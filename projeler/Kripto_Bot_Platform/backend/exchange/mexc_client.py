"""
MEXC Exchange İstemcisi
- CCXT ile REST işlemleri
- Bitget client ile aynı interface → bot engine değişiklik gerektirmez
MEXC futures: USDT-M perpetual
"""
import ccxt.async_support as ccxt
from core.config import settings


class MEXCClient:
    def __init__(self):
        self.exchange = ccxt.mexc({
            "apiKey": settings.MEXC_API_KEY,
            "secret": settings.MEXC_API_SECRET,
            "options": {"defaultType": "swap"},
        })

    async def get_balance(self) -> dict:
        balance = await self.exchange.fetch_balance({"type": "swap"})
        return {
            "total": balance["total"].get("USDT", 0),
            "free": balance["free"].get("USDT", 0),
            "used": balance["used"].get("USDT", 0),
        }

    async def place_order(
        self,
        symbol: str,
        side: str,
        amount: float,
        order_type: str = "market",
        price: float = None,
        tp_price: float = None,
        sl_price: float = None,
        pos_side: str = None,
        trailing_callback_rate: float = None,
        trailing_active_price: float = None,
        tp_pct: float = None,
        sl_pct: float = None,
    ) -> dict:
        import asyncio
        params = {}
        if pos_side:
            params["positionSide"] = pos_side.upper()

        if order_type == "market":
            order = await self.exchange.create_market_order(symbol, side, amount, params=params)
        else:
            order = await self.exchange.create_limit_order(symbol, side, amount, price, params=params)

        use_trailing = trailing_callback_rate and float(trailing_callback_rate) > 0

        # TP/SL veya Trailing gerekiyorsa pozisyon ID bul
        if tp_price or sl_price or use_trailing:
            mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
            is_long = side.lower() == "buy"

            pos_id = None
            actual_entry = None
            target_type = 1 if is_long else 2
            for attempt in range(1, 4):
                await asyncio.sleep(1.0 + attempt * 0.5)
                try:
                    pos_resp = await self.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol})
                    pos_data = pos_resp.get("data", []) if isinstance(pos_resp, dict) else pos_resp
                    for p in (pos_data or []):
                        if int(p.get("positionType", 0)) == target_type and float(p.get("holdVol", 0)) > 0:
                            pos_id = int(p.get("positionId", 0))
                            actual_entry = float(p.get("openAvg", 0) or p.get("openAvgPrice", 0) or 0)
                            break
                except Exception as e:
                    print(f"[MEXCClient] position query error (attempt {attempt}/3): {e}")

                if pos_id:
                    print(f"[MEXCClient] Position ID bulundu: {pos_id} entry={actual_entry} (attempt {attempt}/3)")
                    break
                print(f"[MEXCClient] Position ID bulunamadi (attempt {attempt}/3), tekrar deneniyor...")

            # Gerçek giriş fiyatından TP/SL yeniden hesapla
            if pos_id and actual_entry and actual_entry > 0 and tp_pct is not None and sl_pct is not None:
                if is_long:
                    tp_price = round(actual_entry * (1 + float(tp_pct) / 100), 2)
                    sl_price = round(actual_entry * (1 - float(sl_pct) / 100), 2)
                else:
                    tp_price = round(actual_entry * (1 - float(tp_pct) / 100), 2)
                    sl_price = round(actual_entry * (1 + float(sl_pct) / 100), 2)
                if use_trailing and tp_price:
                    trailing_active_price = tp_price
                print(f"[MEXCClient] TP/SL gercek giris fiyatindan hesaplandi: entry={actual_entry} TP={tp_price} SL={sl_price}")

            if pos_id:
                # SL her zaman stoporder ile konur
                if sl_price:
                    stop_body = {
                        "positionId": pos_id,
                        "vol": int(amount),
                        "profitTrend": 1,
                        "lossTrend": 1,
                        "stopLossType": 0,
                        "takeProfitType": 0,
                        "stopLossOrderPrice": 0,
                        "takeProfitOrderPrice": 0,
                        "stopLossPrice": round(float(sl_price), 2),
                    }
                    # Trailing yoksa TP'yi de ekle
                    if not use_trailing and tp_price:
                        stop_body["takeProfitPrice"] = round(float(tp_price), 2)
                    try:
                        result = await self.exchange.contractPrivatePostStoporderPlace(stop_body)
                        print(f"[MEXCClient] ✓ SL{'+ TP' if not use_trailing and tp_price else ''} başarıyla konuldu: result={result}")
                    except Exception as e:
                        print(f"[MEXCClient] ✗ KRITIK: stoporder/place HATASI: {e}")
                        raise RuntimeError(f"TP/SL konulamadı (pozisyon korumasız!): {e}")

                # Trailing stop
                if use_trailing:
                    trail_side = 4 if is_long else 2
                    trail_body = {
                        "symbol": mexc_symbol,
                        "leverage": 20,
                        "side": trail_side,
                        "vol": int(amount),
                        "openType": 1,
                        "trend": 1,
                        "activePrice": round(float(trailing_active_price), 2) if trailing_active_price else 0,
                        "backType": 1,
                        "backValue": round(float(trailing_callback_rate), 4),
                        "positionMode": 1,
                        "reduceOnly": True,
                    }
                    try:
                        trail_resp = await self.exchange.contractPrivatePostTrackorderPlace(trail_body)
                        print(f"[MEXCClient] ✓ Trailing order konuldu: {trail_resp}")
                    except Exception as e:
                        print(f"[MEXCClient] ⚠ Trailing başarısız, fallback TP konuluyor: {e}")
                        if tp_price:
                            fb = {
                                "positionId": pos_id, "vol": int(amount),
                                "profitTrend": 1, "lossTrend": 1,
                                "stopLossType": 0, "takeProfitType": 0,
                                "stopLossOrderPrice": 0, "takeProfitOrderPrice": 0,
                                "takeProfitPrice": round(float(tp_price), 2),
                            }
                            await self.exchange.contractPrivatePostStoporderPlace(fb)

                elif not sl_price and tp_price:
                    # Sadece TP (SL yoksa)
                    stop_body = {
                        "positionId": pos_id, "vol": int(amount),
                        "profitTrend": 1, "lossTrend": 1,
                        "stopLossType": 0, "takeProfitType": 0,
                        "stopLossOrderPrice": 0, "takeProfitOrderPrice": 0,
                        "takeProfitPrice": round(float(tp_price), 2),
                    }
                    try:
                        await self.exchange.contractPrivatePostStoporderPlace(stop_body)
                        print(f"[MEXCClient] ✓ TP başarıyla konuldu: {tp_price}")
                    except Exception as e:
                        print(f"[MEXCClient] ✗ KRITIK: TP HATASI: {e}")
                        raise RuntimeError(f"TP konulamadı: {e}")
            else:
                msg = f"TP/SL/Trailing BAŞARISIZ: 3 denemede positionId bulunamadı ({mexc_symbol}, {'long' if is_long else 'short'})"
                print(f"[MEXCClient] ✗ KRITIK: {msg}")
                raise RuntimeError(msg)

        return order

    async def modify_position_tpsl(
        self,
        symbol: str,
        tp_price: float = None,
        sl_price: float = None,
        pos_side: str = "long",
    ) -> dict:
        """MEXC'de açık pozisyonun TP/SL seviyelerini günceller."""
        return await self.exchange.modify_position_tpsl(
            symbol,
            take_profit_price=tp_price,
            stop_loss_price=sl_price,
            params={"positionSide": pos_side.upper()}
        )

    async def close_position(self, symbol: str, side: str, amount: float, pos_side: str = None) -> dict:
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(symbol, close_side, amount, pos_side=pos_side)

    async def set_leverage(self, symbol: str, leverage: int):
        await self.exchange.set_leverage(leverage, symbol)

    async def get_positions(self, symbol: str = None) -> list:
        params = {}
        if symbol:
            params["symbol"] = symbol
        positions = await self.exchange.fetch_positions(symbols=[symbol] if symbol else None)
        return [p for p in positions if float(p.get("contracts", 0)) > 0]

    async def get_ohlcv(self, symbol: str, timeframe: str = "1m", limit: int = 200) -> list:
        return await self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

    async def get_funding_rate(self, symbol: str) -> float:
        ticker = await self.exchange.fetch_ticker(symbol)
        return float(ticker.get("info", {}).get("fundingRate", 0))

    # ─── MEXC Native Trailing Stop (trackorder) ─────────────────────

    async def place_trailing_order(
        self,
        symbol: str,
        side: str,
        amount: float,
        leverage: int,
        callback_rate: float,
        active_price: float = 0,
        open_type: int = 1,
        position_mode: int = 1,
    ) -> dict:
        """
        MEXC native trailing stop emri koy.
        side: "close_long" (4) veya "close_short" (2) — pozisyon kapatma yönü
        callback_rate: geri çekilme yüzdesi (ör: 1.0 = %1)
        active_price: aktivasyon fiyatı (0 = hemen aktif)
        """
        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        side_map = {"close_long": 4, "close_short": 2, "open_long": 1, "open_short": 3}
        mexc_side = side_map.get(side, 4 if "long" in side else 2)

        body = {
            "symbol": mexc_symbol,
            "leverage": int(leverage),
            "side": mexc_side,
            "vol": int(amount),
            "openType": open_type,
            "trend": 1,                 # 1=latest price
            "activePrice": float(active_price) if active_price else 0,
            "backType": 1,              # 1=percentage
            "backValue": round(float(callback_rate), 4),
            "positionMode": position_mode,
            "reduceOnly": True,
        }

        print(f"[MEXCClient] Trailing order: {body}")
        resp = await self.exchange.contractPrivatePostTrackorderPlace(body)
        print(f"[MEXCClient] Trailing order yanıt: {resp}")

        resp_data = resp if isinstance(resp, dict) else {}
        success = resp_data.get("success", False) or resp_data.get("code", -1) == 0
        if not success:
            raise RuntimeError(f"Trailing order başarısız: {resp}")

        return {"id": str(resp_data.get("data", "")), "success": True, "info": resp}

    async def cancel_trailing_order(self, symbol: str, order_id: int = None) -> dict:
        """Trailing stop emrini iptal et."""
        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        body = {"symbol": mexc_symbol}
        if order_id:
            body["trackOrderId"] = int(order_id)
        resp = await self.exchange.contractPrivatePostTrackorderCancel(body)
        print(f"[MEXCClient] Trailing cancel yanıt: {resp}")
        return resp

    async def query_trailing_orders(self, symbol: str = None, states: list = None) -> list:
        """Aktif trailing stop emirlerini sorgula."""
        params = {"states": ",".join(str(s) for s in (states or [0, 1]))}
        if symbol:
            params["symbol"] = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        resp = await self.exchange.contractPrivateGetTrackorderListOrders(params)
        resp_data = resp if isinstance(resp, dict) else {}
        return resp_data.get("data", []) or []

    async def close(self):
        await self.exchange.close()
