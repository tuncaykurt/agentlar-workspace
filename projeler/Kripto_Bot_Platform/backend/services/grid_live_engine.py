"""
Grid Live Trading Engine
-------------------------
Simülasyondan gerçek işleme geçiş motoru.
Paper (sanal) ve Live (gerçek borsa) modlarını destekler.

Redis Keys:
- grid_live:running   → "1" ise motor aktif
- grid_live:state     → Grid durumu (levels, filled, bounds, pnl)
- grid_live:trades    → İşlem geçmişi (son 200)

Akış:
1. Kullanıcı /hft-start ile botu başlatır
2. HFT Engine her 0.1s'de fiyat kontrolü yapar ve process_tick() çağırır
3. Grid seviyesi geçildiğinde:
   - Paper: Sanal işlem kaydı
   - Live: MEXC'e gerçek market order gönderimi
4. Trailing: Fiyat grid dışına çıkarsa ağ kaydırılır
5. Kill Switch: Tüm emirleri iptal + pozisyonları kapat
"""
import asyncio
import json
import time
from datetime import datetime, timezone
from core.redis_client import get_redis
from services.push_notification import push_trade_notification, push_grid_event


class GridLiveEngine:
    def __init__(self):
        self._exchanges = {}  # user_id -> exchange
        self._poll_tasks = {} # user_id -> task
        self._tick_locks = {} # user_id -> lock
        self._bb_services = {} # user_id -> service

    # ─── Exchange ─────────────────────────────────────────────────────

    async def _get_exchange(self, user_id: str):
        if user_id not in self._exchanges:
            from api.routes.bots import _get_exchange_client
            # user_id 'default' ise admin key'i çeker
            parsed_user_id = None if user_id == "default" else int(user_id)
            self._exchanges[user_id] = await _get_exchange_client("mexc", "cross", user_id=parsed_user_id)
        return self._exchanges[user_id]

    async def _get_contract_size(self, ccxt_symbol: str, user_id: str) -> float:
        ex = await self._get_exchange(user_id)
        if not ex.exchange.markets:
            await ex.exchange.load_markets()
        market = ex.exchange.market(ccxt_symbol)
        return float(market.get("contractSize", 0.001))

    async def _calc_contracts(self, ccxt_symbol: str, margin_usdt: float, price: float, leverage: int, user_id: str) -> int:
        """Margin tutarından kontrat sayısı hesapla. KRİTİK: Doğru hesaplama şart!
        margin_usdt: Kademe başına kullanılacak margin (USDT)
        leverage: Kaldıraç çarpanı
        Formül: notional = margin × leverage → contracts = notional / (price × contractSize)
        """
        contract_size = await self._get_contract_size(ccxt_symbol, user_id)
        if contract_size <= 0:
            contract_size = 0.001
            
        ex = await self._get_exchange(user_id)
        if not ex.exchange.markets:
            await ex.exchange.load_markets()
        market = ex.exchange.market(ccxt_symbol)
        amount_precision = market.get("precision", {}).get("amount", 1)
        
        notional = margin_usdt * leverage
        raw_contracts = notional / (price * contract_size)
        
        # Miktari borsa hassasiyetine gore (ornek: step_size) asagi yuvarla
        # MEXC vadeli islemlerinde genellikle amount = 1, 2 (tam sayi) olur.
        if isinstance(amount_precision, float) and amount_precision < 1:
            decimals = len(str(amount_precision).split(".")[1])
            factor = 10 ** decimals
            contracts = int(raw_contracts * factor) / factor
        else:
            # integer precision (usually 1)
            contracts = int(raw_contracts)

        if contracts < amount_precision:
            contracts = amount_precision if amount_precision > 0 else 1
            
        actual_margin = contracts * price * contract_size / leverage
        print(f"[GridLive] Kontrat hesabı: margin=${margin_usdt:.2f} × {leverage}x = "
              f"notional=${notional:.2f} / (${price} × {contract_size}) = {contracts} kontrat "
              f"(gerçek margin=${actual_margin:.4f})")
        return contracts

    # ─── Akıllı Başlangıç — Son Mumları Analiz Et ─────────────────────

    async def _check_recent_midline_cross(
        self, ccxt_symbol: str, timeframe: str, bb_period: int, bb_std: float, user_id: str, lookback: int = 3
    ) -> dict:
        """Son 'lookback' mum içinde BB orta çizgi kesimi olup olmadığını kontrol eder.
        Eğer kesim varsa crossed=True ve direction (long/short) döner.
        """
        try:
            ex = await self._get_exchange(user_id)
            ohlcv = await ex.get_ohlcv(ccxt_symbol, timeframe, limit=max(bb_period + lookback + 5, 50))
            if not ohlcv or len(ohlcv) < bb_period + lookback:
                return {"crossed": False, "current_side": "long"}

            import pandas as pd
            df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])
            sma = df["close"].rolling(bb_period).mean()

            # Son N+1 mumun kapanış vs orta çizgi ilişkisini kontrol et
            recent = df.tail(lookback + 1)
            sma_recent = sma.tail(lookback + 1)

            sides = []
            for i in range(len(recent)):
                c = float(recent.iloc[i]["close"])
                m = float(sma_recent.iloc[i]) if not pd.isna(sma_recent.iloc[i]) else c
                sides.append("above" if c > m else "below")

            # Mevcut taraf
            current_side = sides[-1]
            current_dir = "long" if current_side == "above" else "short"

            # Son N mumda kesim var mı? (side değişimi)
            for i in range(1, len(sides)):
                if sides[i] != sides[i - 1]:
                    cross_dir = "long" if sides[i] == "above" else "short"
                    print(f"[GridLive] Akıllı Başlangıç: Son {lookback} mumda orta çizgi kesimi bulundu! "
                          f"Yön: {cross_dir.upper()} (mum #{i})")
                    return {"crossed": True, "direction": cross_dir, "current_side": current_side}

            return {"crossed": False, "current_side": current_dir}

        except Exception as e:
            print(f"[GridLive] Akıllı başlangıç BB kontrol hatası: {e}")
            return {"crossed": False, "current_side": "long"}

    async def _check_recent_ema_cross(
        self, ccxt_symbol: str, timeframe: str, user_id: str, min_ema_pct: float = 1.0, lookback: int = 3
    ) -> dict:
        """Son 'lookback' mum içinde EMA6/EMA14 kesişimi olup olmadığını kontrol eder."""
        try:
            ex = await self._get_exchange(user_id)
            ohlcv = await ex.get_ohlcv(ccxt_symbol, timeframe, limit=250)
            if not ohlcv or len(ohlcv) < 200:
                return {"crossed": False}

            import pandas as pd
            df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])
            ema6 = df["close"].ewm(span=6, adjust=False).mean()
            ema14 = df["close"].ewm(span=14, adjust=False).mean()
            ema50 = df["close"].ewm(span=50, adjust=False).mean()
            ema200 = df["close"].ewm(span=200, adjust=False).mean()

            # Son N+1 mum kontrol et
            for i in range(-lookback, 0):
                e6_prev = float(ema6.iloc[i - 1])
                e14_prev = float(ema14.iloc[i - 1])
                e6_curr = float(ema6.iloc[i])
                e14_curr = float(ema14.iloc[i])
                e50 = float(ema50.iloc[i])
                e200 = float(ema200.iloc[i])
                price = float(df.iloc[i]["close"])

                # Long cross
                trend_long = (e50 > e200) and ((e50 - e200) / max(e200, 1) * 100 >= min_ema_pct)
                cross_long = (e6_curr > e14_curr) and (e6_prev <= e14_prev)
                pullback_long = price > e50

                if trend_long and cross_long and pullback_long:
                    print(f"[GridLive] Akıllı Başlangıç: Son {lookback} mumda EMA LONG kesişimi bulundu!")
                    return {"crossed": True, "direction": "long"}

                # Short cross
                trend_short = (e50 < e200) and ((e200 - e50) / max(e50, 1) * 100 >= min_ema_pct)
                cross_short = (e6_curr < e14_curr) and (e6_prev >= e14_prev)
                pullback_short = price < e50

                if trend_short and cross_short and pullback_short:
                    print(f"[GridLive] Akıllı Başlangıç: Son {lookback} mumda EMA SHORT kesişimi bulundu!")
                    return {"crossed": True, "direction": "short"}

            return {"crossed": False}

        except Exception as e:
            print(f"[GridLive] Akıllı başlangıç EMA kontrol hatası: {e}")
            return {"crossed": False}

    # ─── Başlat / Durdur ──────────────────────────────────────────────

    async def start(self, config: dict, user_id: str = "default") -> dict:
        """Grid botunu başlat."""
        redis = get_redis()

        # Zaten çalışıyorsa durdur
        if await redis.get(f"grid_live:running:{user_id}"):
            await self.stop(user_id=user_id, close_positions=False)

        symbol_raw = config.get("symbol", "ETHUSDT")
        base = symbol_raw.replace("USDT", "")
        ccxt_symbol = f"{base}/USDT:USDT"

        mode = config.get("mode", "paper")  # "paper" veya "live"
        leverage = int(config.get("leverage", 10))
        budget_mode = config.get("budget_mode", "fixed")
        
        # Calculate total budget
        if budget_mode == "percent":
            ex = await self._get_exchange(user_id)
            try:
                bal = await ex.exchange.fetch_balance()
                total_balance = float(bal.get("total", {}).get("USDT", 0))
                if total_balance <= 0:
                    total_balance = float(bal.get("free", {}).get("USDT", 0))
                # Fallback if no USDT found
                if total_balance <= 0:
                    total_balance = float(config.get("initial_balance", 1000))
                total_budget = total_balance * (float(config.get("order_size", 100)) / 100)
                print(f"[GridLive] Percent bütçe: Bakiye={total_balance} * %{config.get('order_size')} = {total_budget}")
            except Exception as e:
                print(f"[GridLive] Bakiye okuma hatası (Percent Mode), varsayılan kullanılıyor: {e}")
                total_budget = float(config.get("order_size", 100))
        else:
            total_budget = float(config.get("order_size", 100))  # Toplam bütçe (USDT)
            
        spread_pct = float(config.get("spread_pct", 0.5))
        grid_count = int(config.get("grid_count", 20))
        margin_per_level = round(total_budget / grid_count, 4)  # Kademe başına margin

        # BB modu parametreleri
        grid_mode = config.get("grid_mode", "manual")  # "manual" / "bollinger" / "hybrid" / "bb_direction"
        grid_direction = config.get("grid_direction", "long")  # "long" / "short" / "auto"
        bb_timeframe = config.get("bb_timeframe", "5m")
        bb_period = int(config.get("bb_period", 20))
        bb_std_dev = float(config.get("bb_std_dev", 2.0))
        min_spread_pct = float(config.get("min_spread_pct", 0.3))
        filters = config.get("filters", {})

        # Canlı fiyat al — SADECE MEXC kaynaklari (baska borsa fiyati kullanma!)
        current_price = 0.0
        price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
        if price_raw:
            price_data = json.loads(price_raw)
            current_price = float(price_data.get("last", 0))
        if current_price <= 0:
            # MEXC WS yoksa MEXC API'den direkt cek
            try:
                ex = await self._get_exchange(user_id)
                ticker = await ex.exchange.fetch_ticker(ccxt_symbol)
                current_price = float(ticker.get("last", 0))
            except Exception as e:
                print(f"[GridLive] MEXC fetch_ticker hatası: {e}")
        if current_price <= 0:
            return {"error": f"Fiyat bulunamadı: {ccxt_symbol}. MEXC bağlantısını kontrol edin."}

        # ─── Grid sınırlarını hesapla ─────────────────────────────────
        bb_data = {}
        if grid_mode in ("bollinger", "hybrid"):
            # BB bantlarından dinamik grid sınırları
            from services.bollinger_grid_service import BollingerGridService
            self._bb_services[user_id] = BollingerGridService()
            bb_data = await self._bb_services[user_id].compute_grid_bounds(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
                min_spread_pct, current_price, grid_count
            )

            if not bb_data:
                return {"error": "Bollinger Bands hesaplanamadı. MEXC OHLCV verisi alınamıyor."}

            upper = bb_data["bb_upper"]
            lower = bb_data["bb_lower"]
            # Spread'i BB'den hesapla
            spread_pct = round((upper - lower) / current_price * 100, 4)
            print(f"[GridLive] BB Modu: upper=${upper:.2f} lower=${lower:.2f} "
                  f"mid=${bb_data.get('bb_mid', 0):.2f} width={bb_data.get('bb_width', 0):.4f} "
                  f"rsi={bb_data.get('rsi', 0):.1f} adx={bb_data.get('adx', 0):.1f}")
        
        elif grid_mode == "bb_direction":
            # BB Yön modu: Sinyal ve genişlik için BB kullanılır
            from services.bollinger_grid_service import BollingerGridService
            self._bb_services[user_id] = BollingerGridService()
            bb_data = await self._bb_services[user_id].compute_grid_bounds(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
                min_spread_pct, current_price, grid_count
            )

            if not bb_data:
                return {"error": "Bollinger Bands hesaplanamadı. MEXC OHLCV verisi alınamıyor."}

            # ── Akıllı Başlangıç: son mumları kontrol et ──
            # Eğer son 3 mum içinde orta çizgi kesimi olduysa hemen başla
            smart_start_wait = config.get("smart_start_wait", True)
            
            recent_cross = await self._check_recent_midline_cross(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev, user_id, lookback=3
            )
            
            if not smart_start_wait:
                recent_cross["crossed"] = True
                recent_cross["direction"] = "long" if recent_cross.get("current_side", "above") == "above" else "short"
                if recent_cross.get("current_side") in ["long", "short"]:
                     recent_cross["direction"] = recent_cross["current_side"]
            
            if recent_cross["crossed"]:
                # Sinyal taze veya hemen başla seçili! Hemen grid kur ve başla
                active_dir = recent_cross["direction"]
                bb_upper_new = bb_data.get("bb_upper", 0)
                bb_lower_new = bb_data.get("bb_lower", 0)
                if bb_upper_new > bb_lower_new and current_price > 0:
                    bb_spread_pct = (bb_upper_new - bb_lower_new) / current_price * 100
                    upper = current_price * (1 + bb_spread_pct / 200)
                    lower = current_price * (1 - bb_spread_pct / 200)
                else:
                    upper = 0
                    lower = 0
                print(f"[GridLive] BB Yön Modu: Taze sinyal bulundu ({active_dir.upper()})! "
                      f"Grid anında başlatılıyor. upper=${upper:.2f} lower=${lower:.2f}")
            else:
                # Sinyal eski veya yok — avda bekle
                upper = 0
                lower = 0
                active_dir = recent_cross.get("current_side", "long")
                print(f"[GridLive] BB Yön Modu: Taze sinyal yok, avda bekleniyor. "
                      f"width={bb_data.get('bb_width', 0):.4f}")

        elif grid_mode == "ema_trend":
            # EMA Trend modu: son mumları kontrol et
            from services.bollinger_grid_service import BollingerGridService
            self._bb_services[user_id] = BollingerGridService()
            bb_data = await self._bb_services[user_id].compute_grid_bounds(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
                min_spread_pct, current_price, grid_count
            ) or {}
            
            recent_ema = await self._check_recent_ema_cross(
                ccxt_symbol, bb_timeframe, user_id, filters.get("min_ema_pct", 1.0), lookback=3
            )
            
            if recent_ema["crossed"]:
                active_dir = recent_ema["direction"]
                ema_spread = float(config.get("spread_pct", 1.5))
                upper = current_price * (1 + ema_spread / 200)
                lower = current_price * (1 - ema_spread / 200)
                print(f"[GridLive] EMA Trend Modu: Taze sinyal bulundu ({active_dir.upper()})! "
                      f"Grid anında başlatılıyor.")
            else:
                upper = 0
                lower = 0
                print(f"[GridLive] EMA Trend Modu: Taze sinyal yok, avda bekleniyor.")

        else:
            # Manuel mod — mevcut mantık
            upper = current_price * (1 + spread_pct / 100)
            lower = current_price * (1 - spread_pct / 100)

        step = (upper - lower) / grid_count if upper > 0 else 0
        
        # Fiyat hassasiyetini piyasadan al
        ex = await self._get_exchange(user_id)
        if not ex.exchange.markets:
            await ex.exchange.load_markets()
        market = ex.exchange.market(ccxt_symbol)
        price_precision = market.get("precision", {}).get("price", 8)
        # Convert step size to precision digits if it's a number
        if isinstance(price_precision, float) and price_precision < 1:
            price_decimals = len(str(price_precision).split(".")[1])
        elif isinstance(price_precision, int) and price_precision > 0:
            price_decimals = price_precision
        else:
            price_decimals = 4
            
        upper = round(upper, price_decimals)
        lower = round(lower, price_decimals)
        step = round(step, price_decimals)
        levels = [round(lower + i * step, price_decimals) for i in range(grid_count + 1)] if upper > 0 else []

        # Kontrat sayısını ve büyüklüğünü hesapla (her grid seviyesi için)
        if mode == "live":
            ex = await self._get_exchange(user_id)
            # Cross margin ayarla (tüm bakiye margin olur, likidasyon riski düşer)
            try:
                mexc_sym = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]
                await ex.exchange.contractPrivatePostPositionChangeMargin({"symbol": mexc_sym, "positionType": 2})
                print(f"[GridLive] Cross margin modu set edildi: {ccxt_symbol}")
            except Exception as e:
                print(f"[GridLive] Cross margin ayar uyarısı (devam ediliyor): {e}")
            # Kaldıraç ayarla
            try:
                await ex.set_leverage(ccxt_symbol, leverage)
                print(f"[GridLive] Kaldıraç {leverage}x set edildi: {ccxt_symbol}")
            except Exception as e:
                print(f"[GridLive] Kaldıraç ayar uyarısı (devam ediliyor): {e}")

            contracts_per_level = await self._calc_contracts(ccxt_symbol, margin_per_level, current_price, leverage, user_id)
            contract_size = await self._get_contract_size(ccxt_symbol, user_id)
        else:
            # Paper modda varsayılan contractSize kullan (exchange'e bağlanmadan)
            contract_size = 0.0001 if "BTC" in symbol_raw else 0.01
            raw_contracts = (margin_per_level * leverage) / (contract_size * current_price)
            contracts_per_level = max(1, int(raw_contracts))
        actual_margin_per_level = contracts_per_level * contract_size * current_price / leverage
        print(f"[GridLive] Contract size: {contract_size} | "
              f"Toplam bütçe: ${total_budget} | Kademe margin: ${margin_per_level:.4f} | "
              f"Kontrat/kademe: {contracts_per_level} | Gerçek margin/kademe: ${actual_margin_per_level:.4f}")

        # Grid state oluştur
        state = {
            "mode": mode,
            "symbol": symbol_raw,
            "ccxt_symbol": ccxt_symbol,
            "leverage": leverage,
            "order_size": total_budget,
            "margin_per_level": margin_per_level,
            "contracts_per_level": contracts_per_level,
            "contract_size": contract_size,
            "spread_pct": spread_pct,
            "grid_count": grid_count,
            "levels": levels,
            "upper": upper,
            "lower": lower,
            "step": step,
            "filled_levels": [],  # Alım yapılmış seviye indexleri
            "current_price": current_price,
            "last_level": -1,
            "total_pnl": 0.0,
            "total_trades": 0,
            "total_wins": 0,
            "total_fees": 0.0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "trailing_count": 0,
            # BB modu alanları
            "grid_mode": grid_mode,
            "bb_timeframe": bb_timeframe,
            "bb_period": bb_period,
            "bb_std_dev": bb_std_dev,
            "min_spread_pct": min_spread_pct,
            "filters": filters,
            "bb_upper": bb_data.get("bb_upper", 0),
            "bb_lower": bb_data.get("bb_lower", 0),
            "bb_mid": bb_data.get("bb_mid", 0),
            "bb_width": bb_data.get("bb_width", 0),
            "bb_rsi": bb_data.get("rsi", 0),
            "bb_adx": bb_data.get("adx", 0),
            "bb_paused": False,
            "grid_direction": grid_direction,  # "long" / "short" / "auto"
            # BB Yön modu ek alanları — Akıllı Başlangıç
            "bb_dir_paused": False,
            "bb_dir_wait_cross": grid_mode == "bb_direction" and upper == 0,  # Grid kurulduysa bekleme
            "bb_dir_last_mid_side": ("above" if current_price > bb_data.get("bb_mid", 0) else "below") if grid_mode == "bb_direction" else "",
            "active_direction": active_dir if grid_mode in ("bb_direction", "ema_trend") and upper > 0 else grid_direction,
            # EMA Trend modu ek alanları
            "ema_paused": False,
            "ema_wait_cross": grid_mode == "ema_trend" and upper == 0,
        }

        await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
        await redis.set(f"grid_live:running:{user_id}", "1")
        await redis.delete(f"grid_live:trades:{user_id}")

        # HFT settings'i de güncelle (frontend grafik sınırları için)
        old_hft_raw = await redis.get(f"hft_sim:settings:{user_id}")
        hft_settings = json.loads(old_hft_raw) if old_hft_raw else {}
        hft_settings.update({
            "symbol": symbol_raw,
            "spread_pct": spread_pct,
            "grid_count": grid_count,
            "leverage": leverage,
            "order_size": total_budget,
            "upper_price": upper,
            "lower_price": lower,
            "live_mode": mode,
            "grid_mode": grid_mode,
            "grid_direction": grid_direction,
            "bb_timeframe": bb_timeframe,
            "bb_period": bb_period,
            "bb_std_dev": bb_std_dev,
            "min_spread_pct": min_spread_pct,
        })
        await redis.set(f"hft_sim:settings:{user_id}", json.dumps(hft_settings))

        # Standalone polling loop başlat (HFT Engine'e bağımlı olmadan)
        if user_id in self._poll_tasks and not self._poll_tasks[user_id].done():
            self._poll_tasks[user_id].cancel()
        self._poll_tasks[user_id] = asyncio.create_task(self.run_standalone_loop(user_id))

        # BB modunda arka plan recalc loop başlat
        if grid_mode in ("bollinger", "hybrid", "bb_direction") and user_id in self._bb_services:
            self._bb_services[user_id]._recalc_task = asyncio.create_task(
                self._bb_services[user_id].start_recalc_loop(
                    ccxt_symbol, user_id, bb_timeframe, bb_period, bb_std_dev, min_spread_pct
                )
            )

        mode_label = {"manual": "MANUEL", "bollinger": "BOLLINGER", "hybrid": "HİBRİT", "bb_direction": "BB YÖN"}.get(grid_mode, "MANUEL")
        emoji = "🔴 CANLI" if mode == "live" else "📝 PAPER"
        print(f"[GridLive] {emoji} [{mode_label}] Grid Bot Başlatıldı: {symbol_raw} | "
              f"${lower:.2f}-${upper:.2f} | {grid_count} kademe | "
              f"{leverage}x | toplam=${total_budget} margin/kademe=${margin_per_level:.4f} | "
              f"{contracts_per_level} kontrat/kademe")
              
        asyncio.create_task(push_grid_event("grid_start", f"{emoji} {mode_label} modunda bot başlatıldı. Budget: ${total_budget}", user_id))

        result = {
            "success": True,
            "mode": mode,
            "grid_mode": grid_mode,
            "symbol": symbol_raw,
            "price": current_price,
            "grid_range": f"${lower:.2f} - ${upper:.2f}",
            "step": round(step, 6),
            "step_pct": round(step / current_price * 100, 4),
            "grid_count": grid_count,
            "leverage": leverage,
            "contracts_per_level": contracts_per_level,
            "total_budget": total_budget,
            "margin_per_level": margin_per_level,
            "estimated_profit_per_grid": round(
                contracts_per_level * contract_size * step - contracts_per_level * contract_size * current_price * 0.0002 * 2, 6
            ),
        }
        # BB modu ek bilgileri
        if grid_mode in ("bollinger", "hybrid", "bb_direction") and bb_data:
            result["bb_upper"] = bb_data.get("bb_upper", 0)
            result["bb_lower"] = bb_data.get("bb_lower", 0)
            result["bb_mid"] = bb_data.get("bb_mid", 0)
            result["bb_width"] = bb_data.get("bb_width", 0)
            result["bb_rsi"] = bb_data.get("rsi", 0)
            result["bb_adx"] = bb_data.get("adx", 0)
            result["filters"] = filters
        return result

    async def stop(self, close_positions: bool = False, user_id: str = "default") -> dict:
        """Grid botunu durdur."""
        redis = get_redis()
        await redis.delete(f"grid_live:running:{user_id}")

        # BB recalc loop'u durdur
        if user_id in self._bb_services:
            self._bb_services[user_id].stop()
            del self._bb_services[user_id]

        # Polling loop'u durdur
        if user_id in self._poll_tasks and not self._poll_tasks[user_id].done():
            self._poll_tasks[user_id].cancel()
            del self._poll_tasks[user_id]

        state_raw = await redis.get(f"grid_live:state:{user_id}")
        state = json.loads(state_raw) if state_raw else {}

        result = {
            "stopped": True,
            "mode": state.get("mode", "paper"),
            "total_pnl": state.get("total_pnl", 0),
            "total_trades": state.get("total_trades", 0),
            "total_wins": state.get("total_wins", 0),
            "filled_levels": len(state.get("filled_levels", [])),
        }

        if close_positions and state.get("mode") == "live":
            result["positions_closed"] = await self._close_all_positions(state, user_id)

        print(f"[GridLive] Bot durduruldu. PnL: ${result['total_pnl']:.2f} | "
              f"İşlem: {result['total_trades']} | Açık seviye: {result['filled_levels']}")
              
        asyncio.create_task(push_grid_event("grid_stop", f"PnL: ${result['total_pnl']:.2f} | İşlem: {result['total_trades']}", user_id))
        return result

    async def kill_switch(self, user_id: str = "default") -> dict:
        """ACİL DURDURMA: Tüm emirleri iptal et + tüm pozisyonları kapat."""
        redis = get_redis()
        await redis.delete(f"grid_live:running:{user_id}")

        # Polling loop'u durdur
        if user_id in self._poll_tasks and not self._poll_tasks[user_id].done():
            self._poll_tasks[user_id].cancel()
            del self._poll_tasks[user_id]

        state_raw = await redis.get(f"grid_live:state:{user_id}")
        state = json.loads(state_raw) if state_raw else {}

        result = {
            "killed": True,
            "mode": state.get("mode", "paper"),
            "total_pnl": state.get("total_pnl", 0),
            "orders_cancelled": False,
            "positions_closed": [],
        }

        if state.get("mode") == "live" and state.get("ccxt_symbol"):
            ccxt_symbol = state["ccxt_symbol"]
            mexc_symbol = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]

            try:
                ex = await self._get_exchange(user_id)

                # 1. Tüm açık emirleri iptal et
                try:
                    await ex.exchange.cancel_all_orders(ccxt_symbol)
                    result["orders_cancelled"] = True
                    print(f"[GridLive] ⚡ Tüm açık emirler iptal edildi")
                except Exception as e:
                    print(f"[GridLive] Emir iptal uyarısı: {e}")

                # 2. Trailing emirleri iptal et
                try:
                    await ex.cancel_trailing_order(ccxt_symbol)
                    print(f"[GridLive] ⚡ Trailing emirler iptal edildi")
                except Exception:
                    pass

                # 3. Stop emirlerini iptal et
                try:
                    resp = await ex.exchange.contractPrivatePostStoporderCancelAll({"symbol": mexc_symbol})
                    print(f"[GridLive] ⚡ Stop emirleri iptal edildi: {resp}")
                except Exception:
                    pass

                # 4. Tüm açık pozisyonları kapat
                result["positions_closed"] = await self._close_all_positions(state, user_id)

            except Exception as e:
                result["error"] = str(e)
                print(f"[GridLive] Kill switch hatası: {e}")

        # State'i temizle
        if state:
            state["filled_levels"] = []
            state["last_level"] = -1
            await redis.set(f"grid_live:state:{user_id}", json.dumps(state))

        print(f"[GridLive] KILL SWITCH TETİKLENDİ. Mod: {state.get('mode')} PnL: ${result['total_pnl']:.2f}")
        asyncio.create_task(push_grid_event("grid_stop", f"🚨 KILL SWITCH TETİKLENDİ! PnL: ${result['total_pnl']:.2f}", user_id))
        return result

    async def _close_all_positions(self, state: dict, user_id: str) -> list:
        """Tüm açık pozisyonları market order ile kapat."""
        ccxt_symbol = state.get("ccxt_symbol", "")
        if not ccxt_symbol:
            return []

        mexc_symbol = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]
        closed = []

        try:
            ex = await self._get_exchange(user_id)
            positions = await ex.get_positions(ccxt_symbol)

            for pos in positions:
                contracts = float(pos.get("contracts", 0))
                side = pos.get("side", "")
                if contracts <= 0:
                    continue

                # CCXT reduceOnly ile pozisyon kapat (one-way + hedge mod uyumlu)
                close_side_str = "sell" if side == "long" else "buy"
                try:
                    resp = await ex.exchange.create_order(
                        symbol=ccxt_symbol,
                        type="market",
                        side=close_side_str,
                        amount=int(contracts),
                        params={"reduceOnly": True}
                    )
                    closed.append({
                        "side": side,
                        "contracts": contracts,
                        "closed": True,
                        "order_resp": str(resp)[:200],
                    })
                    print(f"[GridLive] ✓ Pozisyon kapatıldı: {side} {contracts} kontrat")
                except Exception as e:
                    closed.append({"side": side, "contracts": contracts, "closed": False, "error": str(e)})
                    print(f"[GridLive] ✗ Pozisyon kapatma hatası: {e}")

        except Exception as e:
            print(f"[GridLive] Pozisyon sorgulama hatası: {e}")

        return closed

    # ─── Fiyat Tick İşleme ────────────────────────────────────────────

    async def process_tick(self, current_price: float, user_id: str = "default") -> list | None:
        """
        Her fiyat tick'inde HFT Engine tarafından çağrılır.
        Grid seviyesi geçişi varsa işlem yapar.
        Dönen: trade listesi veya None
        """
        # Çift emir önleme: aynı anda sadece bir tick işlenebilir
        if user_id not in self._tick_locks:
            self._tick_locks[user_id] = asyncio.Lock()
            
        if self._tick_locks[user_id].locked():
            return None  # Zaten işleniyor, atla
        async with self._tick_locks[user_id]:
            return await self._process_tick_inner(current_price, user_id)

    async def _process_tick_inner(self, current_price: float, user_id: str) -> list | None:
        """process_tick'in asıl mantığı (lock içinden çağrılır)."""
        redis = get_redis()

        running = await redis.get(f"grid_live:running:{user_id}")
        if not running:
            return None

        state_raw = await redis.get(f"grid_live:state:{user_id}")
        if not state_raw:
            return None

        state = json.loads(state_raw)
        
        upper = state.get("upper", 0)
        lower = state.get("lower", 0)
        grid_count = state.get("grid_count", 20)
        step = state.get("step", 0)
        mode = state.get("mode", "paper")
        grid_mode = state.get("grid_mode", "manual")
        
        state["current_price"] = current_price
        
        is_waiting = (upper == 0 or lower == 0 or step == 0)

        current_level = -1
        if not is_waiting:
            # Fiyatın hangi grid seviyesinde olduğunu bul
            if current_price <= lower:
                current_level = 0
            elif current_price >= upper:
                current_level = grid_count
            else:
                current_level = int((current_price - lower) / step)
                current_level = max(0, min(grid_count - 1, current_level))

        last_level = state.get("last_level", -1)

        # İlk tick — sadece seviyeyi kaydet (eğer beklemiyorsak)
        if last_level == -1 and not is_waiting:
            state["last_level"] = current_level
            await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
            return None

        # Grid seviyesi değişmedi — sadece trailing kontrol et
        if current_level == last_level and not is_waiting:
            changed = await self._check_trailing(state, current_price, redis)
            if changed:
                await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
            return None

        # ─── Grid seviyesi değişti → İşlem yap ───────────────────────
        filled = set(state.get("filled_levels", []))
        trades = []

        # Giriş fiyatları takibi (level_index → entry_price)
        entry_prices = state.get("entry_prices", {})

        # BB modu filtreleri — Redis'ten güncel BB meta oku
        skip_buy = False
        skip_sell = False
        grid_mode = state.get("grid_mode", "manual")
        filters = state.get("filters", {})

        # Aktif yön hesapla
        grid_direction = state.get("grid_direction", "long")
        active_dir = grid_direction  # "long" veya "short"

        if grid_mode in ("bollinger", "hybrid", "bb_direction"):
            ccxt_sym = state.get("ccxt_symbol", "")
            bb_meta_raw = await redis.get(f"bb_grid:meta:{ccxt_sym}")
            if bb_meta_raw:
                try:
                    bb_meta = json.loads(bb_meta_raw)
                    rsi = bb_meta.get("rsi", 50)
                    is_squeeze = bb_meta.get("is_squeeze", False)
                    above_mid = bb_meta.get("above_midline", True)

                    # State'e güncel BB verilerini yaz (frontend için)
                    state["bb_rsi"] = rsi
                    state["bb_width"] = bb_meta.get("bb_width", 0)
                    state["bb_mid"] = bb_meta.get("bb_mid", 0)
                    state["bb_adx"] = bb_meta.get("adx", 0)

                    # Auto yön: BB midline'a göre (auto veya bb_direction modu)
                    if grid_mode == "bb_direction" or grid_direction == "auto":
                        active_dir = "long" if above_mid else "short"
                        state["active_direction"] = active_dir

                    # BB Yön modu lifecycle kontrolleri
                    if grid_mode == "bb_direction":
                        bb_dir_paused = state.get("bb_dir_paused", False)
                        bb_dir_wait_cross = state.get("bb_dir_wait_cross", False)
                        bb_dir_last_mid_side = state.get("bb_dir_last_mid_side", "")
                        
                        bb_mid = state.get("bb_mid", 0)
                        if bb_mid > 0:
                            current_mid_side = "above" if current_price > bb_mid else "below"

                            if bb_dir_wait_cross:
                                # Orta çizgi kesimi bekleniyor
                                if bb_dir_last_mid_side and current_mid_side != bb_dir_last_mid_side:
                                    print(f"[GridLive] BUG-CATCH: Cross triggered! last_side={bb_dir_last_mid_side}, current={current_mid_side}, price={current_price}, mid={bb_mid}")
                                    # Orta çizgi kesildi! Grid'i yeniden başlat
                                    state["bb_dir_wait_cross"] = False
                                    state["bb_dir_paused"] = False
                                    state["band_exited"] = False
                                    state["band_exit_side"] = None
                                    
                                    # Grid'i sıfırla ve yeniden fiyata merkezle!
                                    bb_upper_new = bb_meta.get("bb_upper", state.get("upper", 0))
                                    bb_lower_new = bb_meta.get("bb_lower", state.get("lower", 0))
                                    if bb_upper_new > bb_lower_new and current_price > 0:
                                        bb_spread_pct = (bb_upper_new - bb_lower_new) / current_price * 100
                                        new_upper = current_price * (1 + bb_spread_pct / 200)
                                        new_lower = current_price * (1 - bb_spread_pct / 200)
                                        state["upper"] = new_upper
                                        state["lower"] = new_lower
                                        new_step = (new_upper - new_lower) / grid_count
                                        state["step"] = new_step
                                        state["levels"] = [round(new_lower + i * new_step, 8) for i in range(grid_count + 1)]
                                    state["filled_levels"] = []
                                    state["entry_prices"] = {}
                                    state["last_level"] = -1
                                    await self._sync_hft_bounds(redis, state)
                                    print(f"[GridLive] BB Yön: Orta çizgi kesildi ({bb_dir_last_mid_side} -> {current_mid_side}), grid yeniden başlatıldı")
                                    asyncio.create_task(push_grid_event("signal_" + active_dir, f"Orta çizgi {current_mid_side} kesildi.", user_id))
                                
                                state["bb_dir_last_mid_side"] = current_mid_side
                                await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
                                return None  # Bekleme modunda

                            if bb_dir_paused:
                                state["bb_dir_wait_cross"] = True
                                state["bb_dir_last_mid_side"] = current_mid_side
                                await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
                                return None

                            if not bb_dir_last_mid_side:
                                state["bb_dir_last_mid_side"] = current_mid_side

                            # 4. Aktif çalışırken orta çizgi geçişi — yön anında güncellenir
                            elif bb_dir_last_mid_side and current_mid_side != bb_dir_last_mid_side:
                                # Yön değişti! Açık pozisyonları kapat ve grid'i sıfırla
                                old_dir = active_dir
                                active_dir = "long" if current_mid_side == "above" else "short"
                                state["active_direction"] = active_dir
                                
                                # Açık pozisyonları kapat
                                if filled:
                                    close_levels = list(filled)
                                    cs_val = state.get("contract_size", 0.01)
                                    contracts_per_lvl = state.get("contracts_per_level", 1)
                                    total_contracts = contracts_per_lvl * len(close_levels)
                                    margin_per_lvl = state.get("order_size", 100) / max(1, grid_count)
                                    lev = state.get("leverage", 10)
                                    
                                    total_net_pnl = 0.0
                                    for lvl in close_levels:
                                        ep = entry_prices.get(str(lvl), current_price)
                                        if old_dir == "long":
                                            price_diff_pct = (current_price - ep) / ep if ep > 0 else 0
                                        else:
                                            price_diff_pct = (ep - current_price) / ep if ep > 0 else 0
                                        lvl_gross = margin_per_lvl * lev * price_diff_pct
                                        lvl_notional = margin_per_lvl * lev
                                        lvl_fee = lvl_notional * 0.0002 * 2
                                        total_net_pnl += (lvl_gross - lvl_fee)
                                    
                                    close_side = "sell" if old_dir == "long" else "buy"
                                    trade = await self._execute_order(
                                        state, close_side, current_price, close_levels, len(close_levels), round(total_net_pnl, 4)
                                    )
                                    trades.append(trade)
                                    if trade.get("exchange_status") != "error":
                                        for lvl in close_levels:
                                            filled.discard(lvl)
                                            entry_prices.pop(str(lvl), None)
                                
                                # Grid'i sıfırla ve yeniden fiyata merkezle
                                bb_upper_new = bb_meta.get("bb_upper", state.get("upper", 0))
                                bb_lower_new = bb_meta.get("bb_lower", state.get("lower", 0))
                                if bb_upper_new > bb_lower_new and current_price > 0:
                                    bb_spread_pct = (bb_upper_new - bb_lower_new) / current_price * 100
                                    new_upper = current_price * (1 + bb_spread_pct / 200)
                                    new_lower = current_price * (1 - bb_spread_pct / 200)
                                    state["upper"] = new_upper
                                    state["lower"] = new_lower
                                    new_step = (new_upper - new_lower) / grid_count
                                    state["step"] = new_step
                                    state["levels"] = [round(new_lower + i * new_step, 8) for i in range(grid_count + 1)]
                                state["filled_levels"] = []
                                state["entry_prices"] = {}
                                state["last_level"] = -1
                                state["band_exited"] = False
                                state["band_exit_side"] = None
                                await self._sync_hft_bounds(redis, state)
                                print(f"[GridLive] BB Yön: Midline cross aktif çalışırken ({bb_dir_last_mid_side} -> {current_mid_side}), "
                                      f"yön {active_dir.upper()}, grid sıfırlandı")
                                asyncio.create_task(push_grid_event("signal_" + active_dir, f"Aktif midline cross: {active_dir.upper()}", user_id))

                            state["bb_dir_last_mid_side"] = current_mid_side

                    # EMA Trend lifecycle kontrolleri
                    if grid_mode == "ema_trend":
                        ema_paused = state.get("ema_paused", False)
                        ema_wait_cross = state.get("ema_wait_cross", False)
                        
                        ema6 = bb_meta.get("ema6", 0)
                        ema14 = bb_meta.get("ema14", 0)
                        ema50 = bb_meta.get("ema50", 0)
                        ema200 = bb_meta.get("ema200", 0)
                        prev_ema6 = bb_meta.get("prev_ema6", 0)
                        prev_ema14 = bb_meta.get("prev_ema14", 0)
                        min_ema_pct = filters.get("min_ema_pct", 1.0)
                        
                        # Koşullar (Long)
                        trend_long = (ema50 > ema200) and ((ema50 - ema200) / max(ema200, 1) * 100 >= min_ema_pct)
                        cross_long = (ema6 > ema14) and (prev_ema6 <= prev_ema14)
                        pullback_long = current_price > ema50
                        long_cond = trend_long and cross_long and pullback_long
                        
                        # Koşullar (Short)
                        trend_short = (ema50 < ema200) and ((ema200 - ema50) / max(ema50, 1) * 100 >= min_ema_pct)
                        cross_short = (ema6 < ema14) and (prev_ema6 >= prev_ema14)
                        pullback_short = current_price < ema50
                        short_cond = trend_short and cross_short and pullback_short
                        
                        if ema_wait_cross:
                            # Kesişim bekleniyor
                            if long_cond or short_cond:
                                # Sinyal geldi! Grid'i başlat!
                                state["ema_wait_cross"] = False
                                state["ema_paused"] = False
                                state["band_exited"] = False
                                state["band_exit_side"] = None
                                state["active_direction"] = "long" if long_cond else "short"
                                active_dir = state["active_direction"]
                                
                                # Grid'i sıfırla ve fiyata merkezle
                                spread_pct = state.get("spread_pct", 5.0)
                                new_upper = current_price * (1 + spread_pct / 200)
                                new_lower = current_price * (1 - spread_pct / 200)
                                state["upper"] = new_upper
                                state["lower"] = new_lower
                                new_step = (new_upper - new_lower) / grid_count
                                state["step"] = new_step
                                state["levels"] = [round(new_lower + i * new_step, 8) for i in range(grid_count + 1)]
                                state["filled_levels"] = []
                                state["entry_prices"] = {}
                                state["last_level"] = -1
                                await self._sync_hft_bounds(redis, state)
                                print(f"[GridLive] EMA Trend: {active_dir.upper()} Sinyali! Grid başlatıldı.")
                                asyncio.create_task(push_grid_event("signal_" + active_dir, f"EMA Trend Kesişimi!", user_id))
                            await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
                            return None # Sinyal bekleniyor
                            
                        if ema_paused:
                            state["ema_wait_cross"] = True
                            await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
                            return None

                    # RSI filtresi — yön bazlı
                    if filters.get("rsi_filter"):
                        if active_dir == "long":
                            if rsi > 70: skip_buy = True
                            if rsi < 30: skip_sell = True
                        else:
                            if rsi < 30: skip_buy = True
                            if rsi > 70: skip_sell = True

                    # Squeeze filtresi
                    if filters.get("squeeze_filter") and is_squeeze:
                        skip_buy = True
                        state["bb_paused"] = True
                    else:
                        state["bb_paused"] = False

                    # Orta çizgi filtresi — yön bazlı
                    if filters.get("midline_filter"):
                        if active_dir == "long" and not above_mid:
                            skip_buy = True
                        elif active_dir == "short" and above_mid:
                            skip_buy = True

                except (json.JSONDecodeError, TypeError):
                    pass

        if active_dir == "long":
            # ═══ LONG GRID: düşüşte al, yükselişte sat ═══
            if current_level < last_level:
                if skip_buy:
                    print(f"[GridLive] ⏸ LONG BUY atlandı (filtre aktif)")
                else:
                    buy_levels = []
                    for lvl in range(last_level - 1, current_level - 1, -1):
                        if lvl not in filled and 0 <= lvl < grid_count:
                            buy_levels.append(lvl)
                            filled.add(lvl)
                            entry_prices[str(lvl)] = current_price

                    if buy_levels:
                        trade = await self._execute_order(
                            state, "buy", current_price, buy_levels, len(buy_levels)
                        )
                        trades.append(trade)

            elif current_level > last_level:
                sell_levels = [lvl for lvl in range(last_level, current_level) if lvl in filled]

                if sell_levels:
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    cs = state.get("contract_size", 0.01)
                    # Gerçekçi PnL: borsa standart formülü
                    total_net_pnl = 0.0
                    for lvl in sell_levels:
                        ep = entry_prices.get(str(lvl), current_price - step)
                        lvl_gross = contracts_per_lvl * cs * (current_price - ep)
                        lvl_fee = (contracts_per_lvl * cs * ep * 0.0002) + (contracts_per_lvl * cs * current_price * 0.0002)
                        total_net_pnl += (lvl_gross - lvl_fee)
                    net_pnl = round(total_net_pnl, 6)

                    if skip_sell and mode == "live":
                        print(f"[GridLive] ⏸ SELL atlandı (RSI filtresi)")
                    elif net_pnl < 0:
                        print(f"[GridLive] ⏸ SELL atlandı: net_pnl=${net_pnl:.4f} < 0")
                    else:
                        trade = await self._execute_order(
                            state, "sell", current_price, sell_levels, len(sell_levels), net_pnl
                        )
                        trades.append(trade)
                        if trade.get("exchange_status") != "error":
                            for lvl in sell_levels:
                                filled.discard(lvl)
                                entry_prices.pop(str(lvl), None)

        else:
            # ═══ SHORT GRID: yükselişte short aç, düşüşte kapat ═══
            if current_level > last_level:
                if skip_buy:
                    print(f"[GridLive] ⏸ SHORT açma atlandı (filtre aktif)")
                else:
                    short_levels = []
                    for lvl in range(last_level + 1, current_level + 1):
                        if lvl not in filled and 0 <= lvl < grid_count:
                            short_levels.append(lvl)
                            filled.add(lvl)
                            entry_prices[str(lvl)] = current_price

                    if short_levels:
                        trade = await self._execute_order(
                            state, "sell", current_price, short_levels, len(short_levels)
                        )
                        trades.append(trade)

            elif current_level < last_level:
                # Düşüşte cover (short kapat)
                cover_levels = [lvl for lvl in range(last_level, current_level, -1) if lvl in filled]

                if cover_levels:
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    cs = state.get("contract_size", 0.01)
                    # Gerçekçi PnL: borsa standart formülü (short)
                    total_net_pnl = 0.0
                    for lvl in cover_levels:
                        ep = entry_prices.get(str(lvl), current_price + step)
                        lvl_gross = contracts_per_lvl * cs * (ep - current_price)
                        lvl_fee = (contracts_per_lvl * cs * ep * 0.0002) + (contracts_per_lvl * cs * current_price * 0.0002)
                        total_net_pnl += (lvl_gross - lvl_fee)
                    net_pnl = round(total_net_pnl, 6)

                    if skip_sell and mode == "live":
                        print(f"[GridLive] ⏸ COVER atlandı (RSI filtresi)")
                    elif net_pnl < 0:
                        print(f"[GridLive] ⏸ COVER atlandı: net_pnl=${net_pnl:.4f} < 0")
                    else:
                        trade = await self._execute_order(
                            state, "buy", current_price, cover_levels, len(cover_levels), net_pnl
                        )
                        trades.append(trade)
                        if trade.get("exchange_status") != "error":
                            for lvl in cover_levels:
                                filled.discard(lvl)
                                entry_prices.pop(str(lvl), None)

        # ═══ AĞ KAPATMA MANTIĞI (EXIT TRIGGERS) ═══
        should_close_grid = False
        exit_reason = ""
        
        if grid_mode in ("bollinger", "hybrid", "bb_direction", "ema_trend") and filled:
            # Default exit mode is bollinger unless specified in filters
            exit_mode = filters.get("ema_exit_mode", "bollinger") if grid_mode == "ema_trend" else "bollinger"
            
            # 1. Bollinger Dönüşü (Band Exit & Re-entry)
            if exit_mode == "bollinger":
                bb_upper = state.get("bb_upper", 0)
                bb_lower = state.get("bb_lower", 0)
                band_exited = state.get("band_exited", False)
                band_exit_side = state.get("band_exit_side", None)

                if not band_exited:
                    if active_dir == "long" and current_price > bb_upper and bb_upper > 0:
                        state["band_exited"] = True
                        state["band_exit_side"] = "upper"
                        print(f"[GridLive] 🔔 Band EXIT: fiyat ${current_price:.2f} > üst bant ${bb_upper:.2f}")
                    elif active_dir == "short" and current_price < bb_lower and bb_lower > 0:
                        state["band_exited"] = True
                        state["band_exit_side"] = "lower"
                        print(f"[GridLive] 🔔 Band EXIT: fiyat ${current_price:.2f} < alt bant ${bb_lower:.2f}")
                else:
                    if band_exit_side == "upper" and current_price <= bb_upper:
                        should_close_grid = True
                        exit_reason = "Bollinger Dönüşü (Re-entry)"
                    elif band_exit_side == "lower" and current_price >= bb_lower:
                        should_close_grid = True
                        exit_reason = "Bollinger Dönüşü (Re-entry)"
            
            # 2. EMA Ters Kesişim
            elif exit_mode == "ema_cross":
                ema6 = bb_meta.get("ema6", 0)
                ema14 = bb_meta.get("ema14", 0)
                prev_ema6 = bb_meta.get("prev_ema6", 0)
                prev_ema14 = bb_meta.get("prev_ema14", 0)
                
                if active_dir == "long" and ema6 < ema14 and prev_ema6 >= prev_ema14:
                    should_close_grid = True
                    exit_reason = "EMA Ters Kesişim"
                elif active_dir == "short" and ema6 > ema14 and prev_ema6 <= prev_ema14:
                    should_close_grid = True
                    exit_reason = "EMA Ters Kesişim"
            
            # 3. Fiyatın EMA'ya Teması
            elif exit_mode.startswith("touch_"):
                target_ema = bb_meta.get(exit_mode.replace("touch_", ""), 0)
                if target_ema > 0:
                    # Long isek fiyat düşüp EMA'ya çarparsa kapat
                    if active_dir == "long" and current_price <= target_ema:
                        should_close_grid = True
                        exit_reason = f"Fiyattan {exit_mode.replace('touch_', '').upper()}'ye Temas"
                    # Short isek fiyat yükselip EMA'ya çarparsa kapat
                    elif active_dir == "short" and current_price >= target_ema:
                        should_close_grid = True
                        exit_reason = f"Fiyattan {exit_mode.replace('touch_', '').upper()}'ye Temas"

            if should_close_grid:
                    close_levels = list(filled)
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    cs = state.get("contract_size", 0.01)

                    # Gerçekçi PnL: borsa standart formülü (exit trigger)
                    total_net_pnl = 0.0
                    for lvl in close_levels:
                        ep = entry_prices.get(str(lvl), current_price)
                        if active_dir == "long":
                            lvl_gross = contracts_per_lvl * cs * (current_price - ep)
                        else:
                            lvl_gross = contracts_per_lvl * cs * (ep - current_price)
                        lvl_fee = (contracts_per_lvl * cs * ep * 0.0002) + (contracts_per_lvl * cs * current_price * 0.0002)
                        total_net_pnl += (lvl_gross - lvl_fee)
                    net_pnl = round(total_net_pnl, 6)

                    close_side = "sell" if active_dir == "long" else "buy"
                    trade = await self._execute_order(
                        state, close_side, current_price, close_levels, len(close_levels), net_pnl
                    )
                    trades.append(trade)

                    if trade.get("exchange_status") != "error":
                        for lvl in close_levels:
                            filled.discard(lvl)
                            entry_prices.pop(str(lvl), None)

                    state["band_exited"] = False
                    state["band_exit_side"] = None
                    print(f"[GridLive] 🔄 {exit_reason}: tüm pozisyonlar kapatıldı | "
                          f"pnl=${net_pnl:.4f} | {len(close_levels)} seviye")

                    # BB Yön / EMA Trend modunda → grid'i duraklat, kesimi bekle
                    if grid_mode == "bb_direction":
                        state["bb_dir_paused"] = True
                        print(f"[GridLive] ⏸ BB Yön: Çıkış sonrası durduruldu, orta çizgi kesimi bekleniyor")
                    elif grid_mode == "ema_trend":
                        state["ema_paused"] = True
                        print(f"[GridLive] ⏸ EMA Trend: Çıkış sonrası durduruldu, yeni giriş kesişimi bekleniyor")

        state["entry_prices"] = entry_prices

        state["filled_levels"] = list(filled)
        
        # Sinyal bekleme durumunda değilsek (veya cross az önce gerçekleşmediyse) last_level'i güncelle
        if not is_waiting:
            state["last_level"] = current_level

        # Trailing kontrol (bekleme modunda değilsek)
        if not state.get("band_exited", False) and not is_waiting:
            await self._check_trailing(state, current_price, redis)

        await redis.set(f"grid_live:state:{user_id}", json.dumps(state))
        return trades if trades else None

    async def _check_trailing(self, state: dict, current_price: float, redis) -> bool:
        """Fiyat grid dışına çıktıysa ağı kaydır. True döner ise state değişti."""
        upper = state["upper"]
        lower = state["lower"]
        step = state["step"]
        grid_count = state["grid_count"]
        grid_mode = state.get("grid_mode", "manual")

        if current_price >= upper:
            # BB modunda (bb_direction hariç): sınıra ulaşınca anlık BB recalc dene
            if grid_mode in ("bollinger", "hybrid"):
                recalced = await self._try_bb_recalc(state, current_price, redis)
                if recalced:
                    return True
                # BB recalc başarısız → normal trailing fallback

            diff = current_price - upper
            state["upper"] = current_price
            state["lower"] = lower + diff
            state["levels"] = [round(state["lower"] + i * step, 8) for i in range(grid_count + 1)]
            state["trailing_count"] = state.get("trailing_count", 0) + 1
            print(f"[GridLive] 🚀 Trailing UP: {state['lower']:.4f} - {state['upper']:.4f}")

            # HFT settings güncelle
            await self._sync_hft_bounds(redis, state)
            return True

        elif current_price <= lower and not state.get("filled_levels"):
            if grid_mode in ("bollinger", "hybrid"):
                recalced = await self._try_bb_recalc(state, current_price, redis)
                if recalced:
                    return True

            diff = lower - current_price
            state["lower"] = current_price
            state["upper"] = upper - diff
            state["levels"] = [round(state["lower"] + i * step, 8) for i in range(grid_count + 1)]
            state["trailing_count"] = state.get("trailing_count", 0) + 1
            print(f"[GridLive] 📉 Trailing DOWN: {state['lower']:.4f} - {state['upper']:.4f}")

            await self._sync_hft_bounds(redis, state)
            return True

        return False

    async def _try_bb_recalc(self, state: dict, current_price: float, redis) -> bool:
        """BB bantlarından grid'i yeniden hesapla. Başarılıysa True döner."""
        try:
            # Açık pozisyon varken ızgara sınırlarının değişmesini (kaymasını) engelle
            if state.get("filled_levels"):
                return False
            ccxt_symbol = state.get("ccxt_symbol", "")
            bb_meta_raw = await redis.get(f"bb_grid:meta:{ccxt_symbol}")
            if not bb_meta_raw:
                return False

            bb_meta = json.loads(bb_meta_raw)
            new_upper = bb_meta.get("bb_upper", 0)
            new_lower = bb_meta.get("bb_lower", 0)

            if new_upper <= 0 or new_lower <= 0 or new_upper <= new_lower:
                return False

            # Min spread floor
            min_spread_pct = state.get("min_spread_pct", 0.3)
            bb_mid = bb_meta.get("bb_mid", current_price)
            actual_spread = (new_upper - new_lower) / bb_mid * 100 if bb_mid > 0 else 0
            if actual_spread < min_spread_pct:
                half = min_spread_pct / 200
                new_upper = round(current_price * (1 + half), 8)
                new_lower = round(current_price * (1 - half), 8)

            grid_count = state["grid_count"]
            new_step = (new_upper - new_lower) / grid_count
            new_levels = [round(new_lower + i * new_step, 8) for i in range(grid_count + 1)]

            old_upper = state["upper"]
            old_lower = state["lower"]

            state["upper"] = new_upper
            state["lower"] = new_lower
            state["step"] = new_step
            state["levels"] = new_levels
            state["bb_upper"] = bb_meta.get("bb_upper", 0)
            state["bb_lower"] = bb_meta.get("bb_lower", 0)
            state["bb_mid"] = bb_meta.get("bb_mid", 0)
            state["bb_width"] = bb_meta.get("bb_width", 0)
            state["trailing_count"] = state.get("trailing_count", 0) + 1

            print(f"[GridLive] 🔄 BB Recalc: ${old_lower:.2f}-${old_upper:.2f} → "
                  f"${new_lower:.2f}-${new_upper:.2f} (width={bb_meta.get('bb_width', 0):.4f})")

            await self._sync_hft_bounds(redis, state)
            return True

        except Exception as e:
            print(f"[GridLive] BB recalc hatası: {e}")
            return False

    async def _sync_hft_bounds(self, redis, state: dict):
        """HFT settings'deki grid sınırlarını güncelle (frontend grafik için)."""
        hft_raw = await redis.get("hft_sim:settings")
        hft = json.loads(hft_raw) if hft_raw else {}
        hft["upper_price"] = state["upper"]
        hft["lower_price"] = state["lower"]
        await redis.set("hft_sim:settings", json.dumps(hft))

    async def _execute_order(
        self, state: dict, side: str, price: float,
        grid_levels: list, level_count: int, pnl: float = 0.0,
    ) -> dict:
        """Grid işlemi gerçekleştir — paper veya live."""
        mode = state["mode"]
        ccxt_symbol = state.get("ccxt_symbol", "")
        contracts_per_level = state.get("contracts_per_level", 1)
        total_contracts = contracts_per_level * level_count

        trade = {
            "id": state.get("total_trades", 0) + 1,
            "side": side.upper(),
            "price": round(price, 6),
            "grid_levels": grid_levels,
            "level_count": level_count,
            "contracts": total_contracts,
            "pnl": round(pnl, 4),
            "mode": mode,
            "time": datetime.now(timezone.utc).isoformat(),
            "timestamp": int(time.time()),
        }

        # Live modda gerçek emir gönder
        if mode == "live" and ccxt_symbol:
            mexc_symbol = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]

            if side == "buy":
                # BUY: güncel fiyattan kontrat hesapla (pozisyon açma)
                try:
                    margin = state.get("margin_per_level", 2.0) * level_count
                    total_contracts = await self._calc_contracts(
                        ccxt_symbol, margin, price, int(state.get("leverage", 10))
                    )
                    trade["contracts"] = total_contracts
                except Exception as e:
                    print(f"[GridLive] Kontrat hesap uyarısı: {e}")
            else:
                # SELL: state'teki contracts_per_level kullan (BUY ile aynı miktar)
                # Yeniden hesaplama YAPMA — kontrat uyuşmazlığı zarara yol açar
                total_contracts = contracts_per_level * level_count
                trade["contracts"] = total_contracts

            ex = await self._get_exchange()

            try:
                if side == "buy":
                    # BUY: raw API ile open long (side=1)
                    order_body = {
                        "symbol": mexc_symbol,
                        "price": 0,
                        "vol": total_contracts,
                        "leverage": int(state.get("leverage", 10)),
                        "side": 1,  # open long
                        "type": 5,  # market order
                        "openType": 2,  # cross margin
                    }
                    resp = await ex.exchange.contractPrivatePostOrderSubmit(order_body)
                    order_id = str(resp.get("data", resp.get("orderId", "")))
                    trade["order_id"] = order_id
                    trade["exchange_status"] = "filled"
                else:
                    # SELL: CCXT create_order ile reduceOnly
                    # Bu yöntem hem one-way hem hedge modda çalışır
                    resp = await ex.exchange.create_order(
                        symbol=ccxt_symbol,
                        type="market",
                        side="sell",
                        amount=total_contracts,
                        params={"reduceOnly": True}
                    )
                    order_id = str(resp.get("id", ""))
                    trade["order_id"] = order_id
                    trade["exchange_status"] = "filled"

                print(f"[GridLive] ✓ {side.upper()} {total_contracts} kontrat @ ${price:.4f} "
                      f"seviyeler={grid_levels} order_id={order_id}")
            except Exception as e:
                trade["exchange_status"] = "error"
                trade["error"] = str(e)
                pnl = 0.0  # Başarısız emir → PnL sayma
                trade["pnl"] = 0.0
                print(f"[GridLive] ✗ Emir hatası ({side}): {e}")
        else:
            trade["exchange_status"] = "paper"

        # State güncelle (başarısız emirlerde PnL=0 olacak)
        state["total_trades"] = state.get("total_trades", 0) + 1
        if pnl > 0:
            state["total_wins"] = state.get("total_wins", 0) + 1
        state["total_pnl"] = round(state.get("total_pnl", 0) + pnl, 4)
        # Fee sadece başarılı emirlerde sayılsın (kontrat bazlı)
        if trade["exchange_status"] != "error":
            cs = state.get("contract_size", 0.01)
            notional = total_contracts * cs * price
            fee = notional * 0.0002 * 2  # taker fee %0.02 giriş+çıkış
            state["total_fees"] = round(state.get("total_fees", 0) + fee, 6)

        # İşlem geçmişine ekle
        redis = get_redis()
        await redis.lpush(f"grid_live:trades:{user_id}", json.dumps(trade))
        await redis.ltrim(f"grid_live:trades:{user_id}", 0, 199)
        
        asyncio.create_task(push_trade_notification(trade, user_id))

        return trade

    # ─── Durum Sorgula ────────────────────────────────────────────────

    async def get_status(self, user_id: str = "default") -> dict:
        """Grid botunun tam durumunu döner."""
        redis = get_redis()

        running = await redis.get(f"grid_live:running:{user_id}")
        state_raw = await redis.get(f"grid_live:state:{user_id}")
        state = json.loads(state_raw) if state_raw else {}

        # Son işlemleri al
        trades_raw = await redis.lrange(f"grid_live:trades:{user_id}", 0, 49)
        trades = [json.loads(t) for t in trades_raw] if trades_raw else []

        # Live modda borsa pozisyonlarını da çek
        exchange_positions = []
        exchange_balance = None
        if state.get("mode") == "live" and state.get("ccxt_symbol"):
            try:
                ex = await self._get_exchange(user_id)
                positions = await ex.get_positions(state["ccxt_symbol"])
                exchange_positions = [
                    {
                        "side": p.get("side"),
                        "contracts": float(p.get("contracts", 0)),
                        "entry_price": float(p.get("entryPrice", 0)),
                        "unrealized_pnl": float(p.get("unrealizedPnl", 0)),
                        "leverage": int(p.get("leverage", 0)),
                        "margin": float(p.get("initialMargin", 0)),
                        "liquidation_price": float(p.get("liquidationPrice", 0) or 0),
                    }
                    for p in positions
                ]
            except Exception as e:
                print(f"[GridLive] Pozisyon sorgulama hatası: {e}")

            try:
                ex = await self._get_exchange(user_id)
                exchange_balance = await ex.get_balance()
            except Exception:
                pass
        elif state.get("mode") == "paper":
            filled_levels = state.get("filled_levels", [])
            if filled_levels:
                entry_prices = state.get("entry_prices", {})
                current_price = state.get("current_price", 0)
                cs = state.get("contract_size", 0.01)
                contracts_per_level = state.get("contracts_per_level", 1)
                leverage = state.get("leverage", 10)
                active_dir = state.get("active_direction", state.get("grid_direction", "long"))
                
                total_contracts = contracts_per_level * len(filled_levels)
                grid_count = state.get("grid_count", 20)
                margin_per_level = state.get("order_size", 0) / max(1, grid_count)
                total_margin = margin_per_level * len(filled_levels)
                
                total_ep = sum(entry_prices.get(str(lvl), current_price) for lvl in filled_levels)
                avg_entry = total_ep / len(filled_levels) if filled_levels else current_price
                
                # Gerçekçi PnL: borsa standart formülü
                if avg_entry > 0:
                    if active_dir == "long":
                        unrealized_pnl = total_contracts * cs * (current_price - avg_entry)
                    else:
                        unrealized_pnl = total_contracts * cs * (avg_entry - current_price)
                else:
                    unrealized_pnl = 0
                    
                notional = total_margin * leverage
                fee = notional * 0.0002 * 2
                unrealized_net_pnl = round(unrealized_pnl - fee, 4)
                
                exchange_positions = [
                    {
                        "side": active_dir,
                        "contracts": total_contracts,
                        "entry_price": round(avg_entry, 6),
                        "unrealized_pnl": unrealized_net_pnl,
                        "leverage": int(leverage),
                        "margin": round(total_margin, 2),
                        "liquidation_price": 0.0,
                    }
                ]

        total_trades = state.get("total_trades", 0)
        total_wins = state.get("total_wins", 0)

        result = {
            "running": bool(running),
            "mode": state.get("mode", "paper"),
            "symbol": state.get("symbol", ""),
            "ccxt_symbol": state.get("ccxt_symbol", ""),
            "leverage": state.get("leverage", 0),
            "order_size": state.get("order_size", 0),
            "contracts_per_level": state.get("contracts_per_level", 0),
            "grid_count": state.get("grid_count", 0),
            "spread_pct": state.get("spread_pct", 0),
            "current_price": state.get("current_price", 0),
            "upper": state.get("upper", 0),
            "lower": state.get("lower", 0),
            "step": state.get("step", 0),
            "last_level": state.get("last_level", -1),
            "filled_levels": state.get("filled_levels", []),
            "filled_count": len(state.get("filled_levels", [])),
            "total_pnl": state.get("total_pnl", 0),
            "total_fees": state.get("total_fees", 0),
            "total_trades": total_trades,
            "total_wins": total_wins,
            "win_rate": round(total_wins / max(1, total_trades) * 100, 1),
            "trailing_count": state.get("trailing_count", 0),
            "started_at": state.get("started_at"),
            "trades": trades,
            "exchange_positions": exchange_positions,
            "exchange_balance": exchange_balance,
            # BB modu bilgileri
            "grid_mode": state.get("grid_mode", "manual"),
            "grid_direction": state.get("grid_direction", "long"),
            "active_direction": state.get("active_direction", state.get("grid_direction", "long")),
            "bb_upper": state.get("bb_upper", 0),
            "bb_lower": state.get("bb_lower", 0),
            "bb_mid": state.get("bb_mid", 0),
            "bb_width": state.get("bb_width", 0),
            "bb_rsi": state.get("bb_rsi", 0),
            "bb_adx": state.get("bb_adx", 0),
            "bb_paused": state.get("bb_paused", False),
            "bb_timeframe": state.get("bb_timeframe", ""),
            "filters": state.get("filters", {}),
            "bb_dir_paused": state.get("bb_dir_paused", False),
            "bb_dir_wait_cross": state.get("bb_dir_wait_cross", False),
            "bb_dir_last_mid_side": state.get("bb_dir_last_mid_side", ""),
        }
        return result


    # ─── Kendi Kendine Çalışan Polling Loop ─────────────────────────────

    async def run_standalone_loop(self, user_id: str):
        """
        HFT Engine çalışmasa bile grid motoru kendi kendine çalışır.
        Redis'ten fiyat okur ve process_tick çağırır.
        start() tarafından arka plan task'ı olarak başlatılır.
        """
        redis = get_redis()
        print(f"[GridLive] Standalone polling loop başlatıldı (0.5s interval) - User: {user_id}")

        while True:
            try:
                running = await redis.get(f"grid_live:running:{user_id}")
                if not running:
                    print(f"[GridLive] Standalone loop: grid_live:running:{user_id} yok, durduruluyor.")
                    break

                state_raw = await redis.get(f"grid_live:state:{user_id}")
                if not state_raw:
                    await asyncio.sleep(1)
                    continue

                state = json.loads(state_raw)
                ccxt_symbol = state.get("ccxt_symbol", "")
                if not ccxt_symbol:
                    await asyncio.sleep(1)
                    continue

                # Redis'ten fiyat oku — SADECE MEXC kaynaklari (baska borsa fiyati kullanma!)
                current_price = 0.0
                price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
                if price_raw:
                    price_data = json.loads(price_raw)
                    current_price = float(price_data.get("last", 0))

                # MEXC WS yoksa MEXC API'den direkt cek (Bitget/Binance KULLANMA)
                if current_price <= 0:
                    try:
                        ex = await self._get_exchange(user_id)
                        ticker = await ex.exchange.fetch_ticker(ccxt_symbol)
                        current_price = float(ticker.get("last", 0))
                    except Exception:
                        pass

                if current_price <= 0:
                    await asyncio.sleep(2)
                    continue

                # process_tick çağır
                await self.process_tick(current_price, user_id)

                await asyncio.sleep(0.5)  # 500ms interval

            except asyncio.CancelledError:
                print("[GridLive] Standalone loop iptal edildi.")
                break
            except Exception as e:
                print(f"[GridLive] Standalone loop hatası: {e}")
                await asyncio.sleep(2)

        print("[GridLive] Standalone loop sonlandı.")


# Singleton
grid_engine = GridLiveEngine()
