import asyncio
import json
import websockets
import ccxt.async_support as ccxt
from core.config import settings
from core.redis_client import get_redis


class BybitClient:
    """Bybit REST + WebSocket istemcisi."""

    def __init__(self):
        self.exchange = ccxt.bybit({
            "apiKey": settings.BYBIT_API_KEY,
            "secret": settings.BYBIT_API_SECRET,
            "options": {"defaultType": "linear"},
            "sandbox": settings.BYBIT_TESTNET,
        })
        self.ws_url = (
            "wss://stream-testnet.bybit.com/v5/public/linear"
            if settings.BYBIT_TESTNET
            else "wss://stream.bybit.com/v5/public/linear"
        )
        self._subscribers: dict[str, list] = {}

    # ─── WebSocket: Canlı fiyat verisi ───────────────────────────────────────

    async def subscribe_kline(self, symbol: str, interval: str = "1"):
        """Canlı mum verisi dinle, Redis'e yaz."""
        redis = get_redis()
        topic = f"kline.{interval}.{symbol}"

        async with websockets.connect(self.ws_url) as ws:
            await ws.send(json.dumps({"op": "subscribe", "args": [topic]}))
            print(f"[Bybit WS] Abone olundu: {topic}")

            async for raw in ws:
                data = json.loads(raw)
                if data.get("topic") == topic and data.get("data"):
                    candle = data["data"][0]
                    payload = {
                        "symbol": symbol,
                        "interval": interval,
                        "time": candle["start"],
                        "open": float(candle["open"]),
                        "high": float(candle["high"]),
                        "low": float(candle["low"]),
                        "close": float(candle["close"]),
                        "volume": float(candle["volume"]),
                        "confirm": candle["confirm"],
                    }
                    await redis.set(f"kline:{symbol}:{interval}", json.dumps(payload))
                    await redis.publish(f"kline:{symbol}", json.dumps(payload))

    async def subscribe_ticker(self, symbol: str):
        """Anlık fiyat (ticker) dinle."""
        redis = get_redis()
        topic = f"tickers.{symbol}"

        async with websockets.connect(self.ws_url) as ws:
            await ws.send(json.dumps({"op": "subscribe", "args": [topic]}))

            async for raw in ws:
                data = json.loads(raw)
                if data.get("topic") == topic:
                    tick = data.get("data", {})
                    await redis.set(
                        f"ticker:{symbol}",
                        json.dumps({
                            "symbol": symbol,
                            "last": tick.get("lastPrice"),
                            "bid": tick.get("bid1Price"),
                            "ask": tick.get("ask1Price"),
                            "funding_rate": tick.get("fundingRate"),
                            "open_interest": tick.get("openInterest"),
                        })
                    )

    # ─── REST: İşlem yönetimi ─────────────────────────────────────────────────

    async def get_balance(self) -> dict:
        balance = await self.exchange.fetch_balance()
        return {
            "total": balance["total"].get("USDT", 0),
            "free": balance["free"].get("USDT", 0),
            "used": balance["used"].get("USDT", 0),
        }

    async def place_order(
        self,
        symbol: str,
        side: str,          # 'buy' veya 'sell'
        amount: float,
        order_type: str = "market",
        price: float = None,
        tp_price: float = None,
        sl_price: float = None,
        pos_side: str = None,  # 'long' or 'short'
    ) -> dict:
        params = {}
        if pos_side:
            # Bybit: 1 for long, 2 for short
            params["positionIdx"] = 1 if pos_side == "long" else 2
            
        if tp_price:
            params["takeProfit"] = tp_price
        if sl_price:
            params["stopLoss"] = sl_price

        if order_type == "market":
            order = await self.exchange.create_market_order(symbol, side, amount, params=params)
        else:
            order = await self.exchange.create_limit_order(symbol, side, amount, price, params=params)
        return order

    async def modify_position_tpsl(
        self,
        symbol: str,
        tp_price: float = None,
        sl_price: float = None,
        pos_side: str = "long",
    ) -> dict:
        """Açık pozisyonun TP/SL seviyelerini günceller."""
        position_idx = 1 if pos_side == "long" else 2
        return await self.exchange.set_trading_stop(
            symbol,
            params={
                "takeProfit": tp_price,
                "stopLoss": sl_price,
                "positionIdx": position_idx,
            }
        )

    async def close_position(self, symbol: str, side: str, amount: float, pos_side: str = None) -> dict:
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(symbol, close_side, amount, pos_side=pos_side)

    async def set_leverage(self, symbol: str, leverage: int):
        await self.exchange.set_leverage(leverage, symbol)

    async def get_positions(self) -> list:
        positions = await self.exchange.fetch_positions()
        return [p for p in positions if float(p.get("contracts", 0)) > 0]

    async def get_ohlcv(self, symbol: str, timeframe: str = "1m", limit: int = 200) -> list:
        return await self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

    async def close(self):
        await self.exchange.close()


bybit = BybitClient()
