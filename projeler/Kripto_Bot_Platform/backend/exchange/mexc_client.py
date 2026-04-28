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
    ) -> dict:
        params = {}
        if order_type == "market":
            order = await self.exchange.create_market_order(symbol, side, amount, params=params)
        else:
            order = await self.exchange.create_limit_order(symbol, side, amount, price, params=params)
        return order

    async def close_position(self, symbol: str, side: str, amount: float) -> dict:
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(symbol, close_side, amount)

    async def set_leverage(self, symbol: str, leverage: int):
        await self.exchange.set_leverage(leverage, symbol)

    async def get_positions(self) -> list:
        positions = await self.exchange.fetch_positions()
        return [p for p in positions if float(p.get("contracts", 0)) > 0]

    async def get_ohlcv(self, symbol: str, timeframe: str = "1m", limit: int = 200) -> list:
        return await self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

    async def get_funding_rate(self, symbol: str) -> float:
        ticker = await self.exchange.fetch_ticker(symbol)
        return float(ticker.get("info", {}).get("fundingRate", 0))

    async def close(self):
        await self.exchange.close()
