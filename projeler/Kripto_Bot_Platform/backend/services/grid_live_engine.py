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

    async def _calc_contracts(self, ccxt_symbol: str, usdt_amount: float, price: float) -> int:
        """USDT tutarından kontrat sayısı hesapla. KRİTİK: Doğru hesaplama şart!"""
        contract_size = await self._get_contract_size(ccxt_symbol)
        if contract_size <= 0:
            contract_size = 0.001
        contracts = int(usdt_amount / (price * contract_size))
        if contracts < 1:
            contracts = 1
        print(f"[GridLive] Kontrat hesabı: ${usdt_amount} / (${price} × {contract_size}) = {contracts} kontrat")
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
        order_size = float(config.get("order_size", 100))
        spread_pct = float(config.get("spread_pct", 0.5))
        grid_count = int(config.get("grid_count", 20))

        # Canlı fiyat al
        price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
        if not price_raw:
            return {"error": f"Fiyat bulunamadı: {ccxt_symbol}. MEXC WebSocket bağlantısını kontrol edin."}
        price_data = json.loads(price_raw)
        current_price = float(price_data.get("last", 0))
        if current_price <= 0:
            return {"error": "Geçersiz fiyat"}

        # Grid sınırlarını hesapla
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

            contracts_per_level = await self._calc_contracts(ccxt_symbol, order_size, current_price)

        # Grid state oluştur
        state = {
            "mode": mode,
            "symbol": symbol_raw,
            "ccxt_symbol": ccxt_symbol,
            "leverage": leverage,
            "order_size": order_size,
            "contracts_per_level": contracts_per_level,
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
            "order_size": order_size,
            "upper_price": upper,
            "lower_price": lower,
            "live_mode": mode,
        }
        await redis.set("hft_sim:settings", json.dumps(hft_settings))

        # Standalone polling loop başlat (HFT Engine'e bağımlı olmadan)
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
        self._poll_task = asyncio.create_task(self.run_standalone_loop())

        emoji = "🔴 CANLI" if mode == "live" else "📝 PAPER"
        print(f"[GridLive] {emoji} Grid Bot Başlatıldı: {symbol_raw} | "
              f"${lower:.2f}-${upper:.2f} | {grid_count} kademe | "
              f"{leverage}x | ${order_size}/kademe | {contracts_per_level} kontrat/kademe")

        return {
            "success": True,
            "mode": mode,
            "symbol": symbol_raw,
            "price": current_price,
            "grid_range": f"${lower:.2f} - ${upper:.2f}",
            "step": round(step, 6),
            "step_pct": round(step / current_price * 100, 4),
            "grid_count": grid_count,
            "leverage": leverage,
            "contracts_per_level": contracts_per_level,
            "order_size": order_size,
            "estimated_profit_per_grid": round(
                (step / current_price) * order_size * leverage - order_size * leverage * 0.0012, 4
            ),
        }

    async def stop(self, close_positions: bool = False) -> dict:
        """Grid botunu durdur."""
        redis = get_redis()
        await redis.delete("grid_live:running")

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

        if current_level < last_level:
            # Fiyat DÜŞTÜ → BUY (pozisyon aç)
            buy_levels = []
            for lvl in range(last_level - 1, current_level - 1, -1):
                if lvl not in filled and 0 <= lvl < grid_count:
                    buy_levels.append(lvl)
                    filled.add(lvl)

            if buy_levels:
                trade = await self._execute_order(
                    state, "buy", current_price, buy_levels, len(buy_levels)
                )
                trades.append(trade)

        elif current_level > last_level:
            # Fiyat YÜKSELDİ → SELL (kâr al)
            sell_levels = []
            for lvl in range(last_level, current_level):
                if lvl in filled:
                    sell_levels.append(lvl)

            if sell_levels:
                # PnL hesapla: her satılan seviye için grid step kadar kâr
                gross_per_level = (step / current_price) * state["order_size"] * state["leverage"]
                fee_per_level = state["order_size"] * state["leverage"] * 0.0006 * 2  # giriş+çıkış
                net_pnl = (gross_per_level - fee_per_level) * len(sell_levels)

                trade = await self._execute_order(
                    state, "sell", current_price, sell_levels, len(sell_levels), net_pnl
                )
                trades.append(trade)

                # Sadece başarılı SELL'lerde seviyeleri boşalt
                if trade.get("exchange_status") != "error":
                    for lvl in sell_levels:
                        filled.discard(lvl)
                # Başarısız → seviyeler dolu kalır, tekrar SELL denemez BUY da yapılmaz

        state["filled_levels"] = list(filled)
        state["last_level"] = current_level

        # Trailing kontrol
        await self._check_trailing(state, current_price, redis)

        await redis.set("grid_live:state", json.dumps(state))
        return trades if trades else None

    async def _check_trailing(self, state: dict, current_price: float, redis) -> bool:
        """Fiyat grid dışına çıktıysa ağı kaydır. True döner ise state değişti."""
        upper = state["upper"]
        lower = state["lower"]
        step = state["step"]
        grid_count = state["grid_count"]

        if current_price >= upper:
            diff = current_price - upper
            state["upper"] = current_price
            state["lower"] = lower + diff
            state["levels"] = [round(state["lower"] + i * step, 8) for i in range(grid_count + 1)]
            state["trailing_count"] = state.get("trailing_count", 0) + 1
            print(f"[GridLive] 🚀 Trailing UP: {state['lower']:.4f} - {state['upper']:.4f}")

            # HFT settings güncelle
            await self._sync_hft_bounds(redis, state)
            return True

        elif current_price <= lower:
            diff = lower - current_price
            state["lower"] = current_price
            state["upper"] = upper - diff
            state["levels"] = [round(state["lower"] + i * step, 8) for i in range(grid_count + 1)]
            state["trailing_count"] = state.get("trailing_count", 0) + 1
            print(f"[GridLive] 📉 Trailing DOWN: {state['lower']:.4f} - {state['upper']:.4f}")

            await self._sync_hft_bounds(redis, state)
            return True

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
        }

        # Live modda gerçek emir gönder
        if mode == "live" and ccxt_symbol:
            mexc_symbol = ccxt_symbol.split("/")[0] + "_" + ccxt_symbol.split("/")[1].split(":")[0]

            # Kontrat sayısını güncel fiyattan yeniden hesapla
            try:
                total_contracts = await self._calc_contracts(
                    ccxt_symbol, state["order_size"] * level_count, price
                )
                trade["contracts"] = total_contracts
            except Exception as e:
                print(f"[GridLive] Kontrat hesap uyarısı: {e}")

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
        # Fee sadece başarılı emirlerde sayılsın
        if trade["exchange_status"] != "error":
            state["total_fees"] = round(
                state.get("total_fees", 0) +
                state["order_size"] * state["leverage"] * 0.0006 * 2 * level_count,
                4
            )

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

        total_trades = state.get("total_trades", 0)
        total_wins = state.get("total_wins", 0)

        return {
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
        }


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

                # Redis'ten fiyat oku
                price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
                if not price_raw:
                    await asyncio.sleep(1)
                    continue

                price_data = json.loads(price_raw)
                current_price = float(price_data.get("last", 0))
                if current_price <= 0:
                    await asyncio.sleep(1)
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
