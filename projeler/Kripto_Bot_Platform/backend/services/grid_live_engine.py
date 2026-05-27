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


class GridLiveEngine:
    def __init__(self):
        self._exchange = None
        self._poll_task: asyncio.Task | None = None
        self._tick_lock = asyncio.Lock()  # Çift emir önleme kilidi
        self._bb_service = None  # Bollinger Grid Service (lazy init)

    # ─── Exchange ─────────────────────────────────────────────────────

    async def _get_exchange(self):
        if not self._exchange:
            from exchange.mexc_client import MEXCClient
            self._exchange = MEXCClient()
        return self._exchange

    async def _get_contract_size(self, ccxt_symbol: str) -> float:
        ex = await self._get_exchange()
        if not ex.exchange.markets:
            await ex.exchange.load_markets()
        market = ex.exchange.market(ccxt_symbol)
        return float(market.get("contractSize", 0.001))

    async def _calc_contracts(self, ccxt_symbol: str, margin_usdt: float, price: float, leverage: int) -> int:
        """Margin tutarından kontrat sayısı hesapla. KRİTİK: Doğru hesaplama şart!
        margin_usdt: Kademe başına kullanılacak margin (USDT)
        leverage: Kaldıraç çarpanı
        Formül: notional = margin × leverage → contracts = notional / (price × contractSize)
        """
        contract_size = await self._get_contract_size(ccxt_symbol)
        if contract_size <= 0:
            contract_size = 0.001
        notional = margin_usdt * leverage
        contracts = int(notional / (price * contract_size))
        if contracts < 1:
            contracts = 1
        actual_margin = contracts * price * contract_size / leverage
        print(f"[GridLive] Kontrat hesabı: margin=${margin_usdt:.2f} × {leverage}x = "
              f"notional=${notional:.2f} / (${price} × {contract_size}) = {contracts} kontrat "
              f"(gerçek margin=${actual_margin:.4f})")
        return contracts

    # ─── Başlat / Durdur ──────────────────────────────────────────────

    async def start(self, config: dict) -> dict:
        """Grid botunu başlat."""
        redis = get_redis()

        # Zaten çalışıyorsa durdur
        if await redis.get("grid_live:running"):
            await self.stop(close_positions=False)

        symbol_raw = config.get("symbol", "ETHUSDT")
        base = symbol_raw.replace("USDT", "")
        ccxt_symbol = f"{base}/USDT:USDT"

        mode = config.get("mode", "paper")  # "paper" veya "live"
        leverage = int(config.get("leverage", 10))
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
                ex = await self._get_exchange()
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
            self._bb_service = BollingerGridService()
            bb_data = await self._bb_service.compute_grid_bounds(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
                min_spread_pct, current_price
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
            # BB Yön modu: Sadece sinyal ve genişlik için BB kullanılır, grid anlık fiyata ortalanır
            from services.bollinger_grid_service import BollingerGridService
            self._bb_service = BollingerGridService()
            bb_data = await self._bb_service.compute_grid_bounds(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
                min_spread_pct, current_price
            )

            if not bb_data:
                return {"error": "Bollinger Bands hesaplanamadı. MEXC OHLCV verisi alınamıyor."}

            # BB kanalının toplam genişliği
            bb_spread_pct = round((bb_data["bb_upper"] - bb_data["bb_lower"]) / current_price * 100, 4)
            spread_pct = bb_spread_pct
            
            # Anlık fiyata göre ortala (Toplam genişlik bb_spread_pct olacak şekilde)
            upper = current_price * (1 + bb_spread_pct / 200)
            lower = current_price * (1 - bb_spread_pct / 200)
            
            print(f"[GridLive] BB Yön Modu: Anlık fiyata ortalandı. upper=${upper:.2f} lower=${lower:.2f} width={bb_data.get('bb_width', 0):.4f}")

        else:
            # Manuel mod — mevcut mantık
            upper = current_price * (1 + spread_pct / 100)
            lower = current_price * (1 - spread_pct / 100)

        step = (upper - lower) / grid_count
        levels = [round(lower + i * step, 8) for i in range(grid_count + 1)]

        # Kontrat sayısını hesapla (her grid seviyesi için)
        contracts_per_level = 1
        if mode == "live":
            ex = await self._get_exchange()
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

            contracts_per_level = await self._calc_contracts(ccxt_symbol, margin_per_level, current_price, leverage)

        # Kontrat büyüklüğü (PnL hesabı için KRİTİK)
        if mode == "live":
            contract_size = await self._get_contract_size(ccxt_symbol)
        else:
            # Paper modda varsayılan contractSize kullan (exchange'e bağlanmadan)
            contract_size = 0.0001 if "BTC" in symbol_raw else 0.01
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
            # BB Yön modu ek alanları
            "bb_dir_paused": False,       # Bant dokunusu sonrası duraklama
            "bb_dir_wait_cross": grid_mode == "bb_direction",   # BB Yön moduysa baştan Avda Bekle!
            "bb_dir_last_mid_side": "",   # Son orta çizgi tarafı ("above" / "below")
        }

        await redis.set("grid_live:state", json.dumps(state))
        await redis.set("grid_live:running", "1")
        await redis.delete("grid_live:trades")

        # HFT settings'i de güncelle (frontend grafik sınırları için)
        hft_settings = {
            "symbol": symbol_raw,
            "spread_pct": spread_pct,
            "grid_count": grid_count,
            "leverage": leverage,
            "order_size": total_budget,
            "upper_price": upper,
            "lower_price": lower,
            "live_mode": mode,
        }
        await redis.set("hft_sim:settings", json.dumps(hft_settings))

        # Standalone polling loop başlat (HFT Engine'e bağımlı olmadan)
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
        self._poll_task = asyncio.create_task(self.run_standalone_loop())

        # BB modunda arka plan recalc loop başlat
        if grid_mode in ("bollinger", "hybrid", "bb_direction") and self._bb_service:
            self._bb_service._recalc_task = asyncio.create_task(
                self._bb_service.start_recalc_loop(
                    ccxt_symbol, bb_timeframe, bb_period, bb_std_dev, min_spread_pct
                )
            )

        mode_label = {"manual": "MANUEL", "bollinger": "BOLLINGER", "hybrid": "HİBRİT", "bb_direction": "BB YÖN"}.get(grid_mode, "MANUEL")
        emoji = "🔴 CANLI" if mode == "live" else "📝 PAPER"
        print(f"[GridLive] {emoji} [{mode_label}] Grid Bot Başlatıldı: {symbol_raw} | "
              f"${lower:.2f}-${upper:.2f} | {grid_count} kademe | "
              f"{leverage}x | toplam=${total_budget} margin/kademe=${margin_per_level:.4f} | "
              f"{contracts_per_level} kontrat/kademe")

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
                contracts_per_level * contract_size * step - contracts_per_level * contract_size * current_price * 0.0006 * 2, 6
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

    async def stop(self, close_positions: bool = False) -> dict:
        """Grid botunu durdur."""
        redis = get_redis()
        await redis.delete("grid_live:running")

        # BB recalc loop'u durdur
        if self._bb_service:
            self._bb_service.stop()
            self._bb_service = None

        # Polling loop'u durdur
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            self._poll_task = None

        state_raw = await redis.get("grid_live:state")
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
            result["positions_closed"] = await self._close_all_positions(state)

        print(f"[GridLive] Bot durduruldu. PnL: ${result['total_pnl']:.2f} | "
              f"İşlem: {result['total_trades']} | Açık seviye: {result['filled_levels']}")
        return result

    async def kill_switch(self) -> dict:
        """ACİL DURDURMA: Tüm emirleri iptal et + tüm pozisyonları kapat."""
        redis = get_redis()
        await redis.delete("grid_live:running")

        # Polling loop'u durdur
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            self._poll_task = None

        state_raw = await redis.get("grid_live:state")
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
                ex = await self._get_exchange()

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
                result["positions_closed"] = await self._close_all_positions(state)

            except Exception as e:
                result["error"] = str(e)
                print(f"[GridLive] Kill switch hatası: {e}")

        # State'i temizle
        if state:
            state["filled_levels"] = []
            state["last_level"] = -1
            await redis.set("grid_live:state", json.dumps(state))

        print(f"[GridLive] ⚡⚡⚡ KILL SWITCH AKTİF ⚡⚡⚡ Sonuç: {result}")
        return result

    async def _close_all_positions(self, state: dict) -> list:
        """Tüm açık pozisyonları market order ile kapat."""
        ccxt_symbol = state.get("ccxt_symbol", "")
        if not ccxt_symbol:
            return []

        mexc_symbol = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]
        closed = []

        try:
            ex = await self._get_exchange()
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

    async def process_tick(self, current_price: float) -> list | None:
        """
        Her fiyat tick'inde HFT Engine tarafından çağrılır.
        Grid seviyesi geçişi varsa işlem yapar.
        Dönen: trade listesi veya None
        """
        # Çift emir önleme: aynı anda sadece bir tick işlenebilir
        if self._tick_lock.locked():
            return None  # Zaten işleniyor, atla
        async with self._tick_lock:
            return await self._process_tick_inner(current_price)

    async def _process_tick_inner(self, current_price: float) -> list | None:
        """process_tick'in asıl mantığı (lock içinden çağrılır)."""
        redis = get_redis()

        running = await redis.get("grid_live:running")
        if not running:
            return None

        state_raw = await redis.get("grid_live:state")
        if not state_raw:
            return None

        state = json.loads(state_raw)
        levels = state.get("levels", [])
        if not levels or len(levels) < 2:
            return None

        upper = state["upper"]
        lower = state["lower"]
        grid_count = state["grid_count"]
        step = state["step"]
        mode = state["mode"]

        state["current_price"] = current_price

        # Fiyatın hangi grid seviyesinde olduğunu bul
        if current_price <= lower:
            current_level = 0
        elif current_price >= upper:
            current_level = grid_count
        else:
            current_level = int((current_price - lower) / step)
            current_level = max(0, min(grid_count - 1, current_level))

        last_level = state.get("last_level", -1)

        # İlk tick — sadece seviyeyi kaydet
        if last_level == -1:
            state["last_level"] = current_level
            await redis.set("grid_live:state", json.dumps(state))
            return None

        # Grid seviyesi değişmedi — sadece trailing kontrol et
        if current_level == last_level:
            changed = await self._check_trailing(state, current_price, redis)
            if changed:
                await redis.set("grid_live:state", json.dumps(state))
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
                        current_mid_side = "above" if current_price > state.get("bb_mid", 0) else "below"

                        if bb_dir_wait_cross:
                            # Orta çizgi kesimi bekleniyor
                            if bb_dir_last_mid_side and current_mid_side != bb_dir_last_mid_side:
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
                            state["bb_dir_last_mid_side"] = current_mid_side
                            await redis.set("grid_live:state", json.dumps(state))
                            return None  # Bekleme modunda

                        if bb_dir_paused:
                            state["bb_dir_wait_cross"] = True
                            state["bb_dir_last_mid_side"] = current_mid_side
                            await redis.set("grid_live:state", json.dumps(state))
                            return None

                        if not bb_dir_last_mid_side:
                            state["bb_dir_last_mid_side"] = current_mid_side

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
                    cs = state.get("contract_size", 0.01)
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    total_contracts = contracts_per_lvl * len(sell_levels)
                    total_price_diff = sum(
                        current_price - entry_prices.get(str(lvl), current_price - step)
                        for lvl in sell_levels
                    )
                    avg_price_diff = total_price_diff / len(sell_levels)
                    gross_pnl = total_contracts * cs * avg_price_diff
                    notional = total_contracts * cs * current_price
                    fee_total = notional * 0.0006 * 2
                    net_pnl = round(gross_pnl - fee_total, 6)

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
                    cs = state.get("contract_size", 0.01)
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    total_contracts = contracts_per_lvl * len(cover_levels)
                    # Short kâr = giriş - çıkış
                    total_price_diff = sum(
                        entry_prices.get(str(lvl), current_price + step) - current_price
                        for lvl in cover_levels
                    )
                    avg_price_diff = total_price_diff / len(cover_levels)
                    gross_pnl = total_contracts * cs * avg_price_diff
                    notional = total_contracts * cs * current_price
                    fee_total = notional * 0.0006 * 2
                    net_pnl = round(gross_pnl - fee_total, 6)

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

        # ═══ BAND EXIT CLOSE — bant dışına çık + geri gir = tüm pozisyonları kapat ═══
        if grid_mode in ("bollinger", "hybrid", "bb_direction") and filled:
            bb_upper = state.get("bb_upper", 0)
            bb_lower = state.get("bb_lower", 0)
            band_exited = state.get("band_exited", False)
            band_exit_side = state.get("band_exit_side", None)

            if not band_exited:
                # Fiyat bant dışına çıktı mı?
                if active_dir == "long" and current_price > bb_upper and bb_upper > 0:
                    state["band_exited"] = True
                    state["band_exit_side"] = "upper"
                    print(f"[GridLive] 🔔 Band EXIT: fiyat ${current_price:.2f} > üst bant ${bb_upper:.2f}")
                elif active_dir == "short" and current_price < bb_lower and bb_lower > 0:
                    state["band_exited"] = True
                    state["band_exit_side"] = "lower"
                    print(f"[GridLive] 🔔 Band EXIT: fiyat ${current_price:.2f} < alt bant ${bb_lower:.2f}")
            else:
                # Fiyat geri girdi mi? → tüm pozisyonları kapat
                re_entered = False
                if band_exit_side == "upper" and current_price <= bb_upper:
                    re_entered = True
                elif band_exit_side == "lower" and current_price >= bb_lower:
                    re_entered = True

                if re_entered:
                    close_levels = list(filled)
                    cs = state.get("contract_size", 0.01)
                    contracts_per_lvl = state.get("contracts_per_level", 1)
                    total_contracts = contracts_per_lvl * len(close_levels)

                    total_price_diff = 0.0
                    for lvl in close_levels:
                        ep = entry_prices.get(str(lvl), current_price)
                        if active_dir == "long":
                            total_price_diff += (current_price - ep)
                        else:
                            total_price_diff += (ep - current_price)

                    avg_diff = total_price_diff / len(close_levels) if close_levels else 0
                    gross_pnl = total_contracts * cs * avg_diff
                    notional = total_contracts * cs * current_price
                    fee_total = notional * 0.0006 * 2
                    net_pnl = round(gross_pnl - fee_total, 6)

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
                    print(f"[GridLive] 🔄 Band RE-ENTRY: tüm pozisyonlar kapatıldı | "
                          f"pnl=${net_pnl:.4f} | {len(close_levels)} seviye")

                    # BB Yön modunda → grid'i duraklat, orta çizgi kesimi bekle
                    if grid_mode == "bb_direction":
                        state["bb_dir_paused"] = True
                        print(f"[GridLive] ⏸ BB Yön: Bant dokunusu sonrası durduruldu, orta çizgi kesimi bekleniyor")

        state["entry_prices"] = entry_prices

        state["filled_levels"] = list(filled)
        state["last_level"] = current_level

        # Trailing kontrol
        if not state.get("band_exited", False):
            await self._check_trailing(state, current_price, redis)

        await redis.set("grid_live:state", json.dumps(state))
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
            fee = notional * 0.0006 * 2  # taker fee %0.06 giriş+çıkış
            state["total_fees"] = round(state.get("total_fees", 0) + fee, 6)

        # İşlem geçmişine ekle
        redis = get_redis()
        await redis.lpush("grid_live:trades", json.dumps(trade))
        await redis.ltrim("grid_live:trades", 0, 199)

        return trade

    # ─── Durum Sorgula ────────────────────────────────────────────────

    async def get_status(self) -> dict:
        """Grid botunun tam durumunu döner."""
        redis = get_redis()

        running = await redis.get("grid_live:running")
        state_raw = await redis.get("grid_live:state")
        state = json.loads(state_raw) if state_raw else {}

        # Son işlemleri al
        trades_raw = await redis.lrange("grid_live:trades", 0, 49)
        trades = [json.loads(t) for t in trades_raw] if trades_raw else []

        # Live modda borsa pozisyonlarını da çek
        exchange_positions = []
        exchange_balance = None
        if state.get("mode") == "live" and state.get("ccxt_symbol"):
            try:
                ex = await self._get_exchange()
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
                ex = await self._get_exchange()
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
                
                if active_dir == "long":
                    unrealized_pnl = total_contracts * cs * (current_price - avg_entry)
                else:
                    unrealized_pnl = total_contracts * cs * (avg_entry - current_price)
                    
                notional = total_contracts * cs * current_price
                fee = notional * 0.0006 * 2
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

    async def run_standalone_loop(self):
        """
        HFT Engine çalışmasa bile grid motoru kendi kendine çalışır.
        Redis'ten fiyat okur ve process_tick çağırır.
        start() tarafından arka plan task'ı olarak başlatılır.
        """
        redis = get_redis()
        print("[GridLive] Standalone polling loop başlatıldı (0.5s interval)")

        while True:
            try:
                running = await redis.get("grid_live:running")
                if not running:
                    print("[GridLive] Standalone loop: grid_live:running yok, durduruluyor.")
                    break

                state_raw = await redis.get("grid_live:state")
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
                        ex = await self._get_exchange()
                        ticker = await ex.exchange.fetch_ticker(ccxt_symbol)
                        current_price = float(ticker.get("last", 0))
                    except Exception:
                        pass

                if current_price <= 0:
                    await asyncio.sleep(2)
                    continue

                # process_tick çağır
                await self.process_tick(current_price)

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
