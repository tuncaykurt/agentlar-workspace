"""
Bitget Exchange İstemcisi
- CCXT ile REST işlemleri
- WebSocket ile canlı veri
Bitget futures: USDT-M perpetual (mix/BTCUSDT_UMCBL formatı)
"""
import asyncio
import json
import websockets
import ccxt.async_support as ccxt
from core.config import settings
from core.redis_client import get_redis


class BitgetClient:
    def __init__(self):
        self.exchange = ccxt.bitget({
            "apiKey": settings.BITGET_API_KEY,
            "secret": settings.BITGET_API_SECRET,
            "password": settings.BITGET_PASSPHRASE,   # Bitget passphrase zorunlu
            "options": {"defaultType": "swap"},        # swap = futures
        })

        # Testnet yoksa direkt canlı (Bitget'in ayrı testnet URL'si var)
        self.ws_url = "wss://ws.bitget.com/mix/v1/stream"

    # ─── WebSocket ────────────────────────────────────────────────────────────

    async def subscribe_kline(self, symbol: str, interval: str = "1m"):
        """
        Canlı mum verisi. Bitget WS formatı:
        instId: BTCUSDT, channel: candle1m
        """
        redis = get_redis()
        channel = f"candle{interval}"
        inst_id = symbol.replace("/", "").replace(":USDT", "")

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"instType": "mc", "channel": channel, "instId": inst_id}]
        }

        while True:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    await ws.send(json.dumps(subscribe_msg))
                    print(f"[Bitget WS] Abone olundu: {channel}/{inst_id}")

                    async for raw in ws:
                        data = json.loads(raw)
                        if "data" in data and data.get("action") in ("snapshot", "update"):
                            for candle in data["data"]:
                                payload = {
                                    "symbol": symbol,
                                    "interval": interval,
                                    "time": int(candle[0]),
                                    "open": float(candle[1]),
                                    "high": float(candle[2]),
                                    "low": float(candle[3]),
                                    "close": float(candle[4]),
                                    "volume": float(candle[5]),
                                }
                                key = f"kline:{symbol}:{interval}"
                                await redis.set(key, json.dumps(payload))
                                await redis.publish(f"kline:{symbol}", json.dumps(payload))
            except Exception as e:
                print(f"[Bitget WS] Bağlantı kesildi: {e} — 5s sonra yeniden bağlanıyor")
                await asyncio.sleep(5)

    async def subscribe_ticker(self, symbol: str):
        """Anlık fiyat."""
        redis = get_redis()
        inst_id = symbol.replace("/", "").replace(":USDT", "")
        subscribe_msg = {
            "op": "subscribe",
            "args": [{"instType": "mc", "channel": "ticker", "instId": inst_id}]
        }

        while True:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    await ws.send(json.dumps(subscribe_msg))
                    async for raw in ws:
                        data = json.loads(raw)
                        if "data" in data:
                            tick = data["data"][0]
                            await redis.set(
                                f"ticker:{symbol}",
                                json.dumps({
                                    "symbol": symbol,
                                    "last": tick.get("last"),
                                    "bid": tick.get("bestBid"),
                                    "ask": tick.get("bestAsk"),
                                    "funding_rate": tick.get("fundingRate"),
                                    "open_interest": tick.get("holdingAmount"),
                                })
                            )
            except Exception as e:
                print(f"[Bitget Ticker WS] {e}")
                await asyncio.sleep(5)

    # ─── REST ─────────────────────────────────────────────────────────────────

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
        params = {"tdMode": "cross"}   # cross margin

        if order_type == "market":
            order = await self.exchange.create_market_order(symbol, side, amount, params=params)
        else:
            order = await self.exchange.create_limit_order(symbol, side, amount, price, params=params)
        return order

    async def close_position(self, symbol: str, side: str, amount: float) -> dict:
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(symbol, close_side, amount)

    async def set_leverage(self, symbol: str, leverage: int):
        await self.exchange.set_leverage(leverage, symbol, params={"marginCoin": "USDT"})

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


bitget = BitgetClient()
