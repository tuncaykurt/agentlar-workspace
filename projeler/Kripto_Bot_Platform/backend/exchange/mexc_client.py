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
    ) -> dict:
        params = {}
        if pos_side:
            params["positionSide"] = pos_side.upper()

        if order_type == "market":
            order = await self.exchange.create_market_order(symbol, side, amount, params=params)
        else:
            order = await self.exchange.create_limit_order(symbol, side, amount, price, params=params)

        # TP/SL: stoporder/place ile pozisyon bazlı TP/SL koy
        # (planorder/place sadece giriş emirleri için çalışır, stoporder/place pozisyona bağlar)
        if tp_price or sl_price:
            import asyncio
            mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
            is_long = side.lower() == "buy"

            # Pozisyon ID'yi retry ile bul (MEXC bazen gecikmeli yansıtır)
            pos_id = None
            target_type = 1 if is_long else 2
            for attempt in range(1, 4):  # 3 deneme: 1.5s, 3s, 5s bekleme
                await asyncio.sleep(1.0 + attempt * 0.5)
                try:
                    pos_resp = await self.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol})
                    pos_data = pos_resp.get("data", []) if isinstance(pos_resp, dict) else pos_resp
                    for p in (pos_data or []):
                        if int(p.get("positionType", 0)) == target_type and float(p.get("holdVol", 0)) > 0:
                            pos_id = int(p.get("positionId", 0))
                            break
                except Exception as e:
                    print(f"[MEXCClient] position query error (attempt {attempt}/3): {e}")

                if pos_id:
                    print(f"[MEXCClient] ✓ Position ID bulundu: {pos_id} (attempt {attempt}/3)")
                    break
                print(f"[MEXCClient] ⚠ Position ID bulunamadı (attempt {attempt}/3), tekrar deneniyor...")

            if pos_id:
                stop_body = {
                    "positionId": pos_id,
                    "vol": int(amount),
                    "profitTrend": 1,
                    "lossTrend": 1,
                    "stopLossType": 0,
                    "takeProfitType": 0,
                    "stopLossOrderPrice": 0,
                    "takeProfitOrderPrice": 0,
                }
                if tp_price:
                    stop_body["takeProfitPrice"] = round(float(tp_price), 2)
                if sl_price:
                    stop_body["stopLossPrice"] = round(float(sl_price), 2)
                try:
                    result = await self.exchange.contractPrivatePostStoporderPlace(stop_body)
                    print(f"[MEXCClient] ✓ TP/SL başarıyla konuldu: TP={tp_price} SL={sl_price} result={result}")
                except Exception as e:
                    print(f"[MEXCClient] ✗ KRITIK: stoporder/place HATASI: {e} — body={stop_body}")
                    raise RuntimeError(f"TP/SL konulamadı (pozisyon korumasız!): {e}")
            else:
                msg = f"TP/SL BAŞARISIZ: 3 denemede positionId bulunamadı ({mexc_symbol}, {'long' if is_long else 'short'})"
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

    async def close(self):
        await self.exchange.close()
