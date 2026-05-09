"""
Bitget Exchange İstemcisi
- CCXT ile REST işlemleri
- WebSocket v2 ile canlı veri
Bitget futures: USDT-M perpetual
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
            "password": settings.BITGET_PASSPHRASE,
            "options": {"defaultType": "swap"},
        })

        # Bitget WS v2 — v1 kapandı
        self.ws_url = "wss://ws.bitget.com/v2/ws/public"

    # ─── WebSocket v2 ─────────────────────────────────────────────────────────

    async def _ws_connect(self, subscribe_msg: dict, handler, label: str):
        """WS bağlantı + ping/pong + otomatik yeniden bağlanma."""
        while True:
            try:
                async with websockets.connect(
                    self.ws_url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    await ws.send(json.dumps(subscribe_msg))
                    print(f"[Bitget WS] {label} abone olundu")

                    async for raw in ws:
                        data = json.loads(raw)

                        # Ping/pong — Bitget v2 "ping" text mesajı gönderir
                        if raw == "ping":
                            await ws.send("pong")
                            continue

                        if "data" in data:
                            await handler(data)

            except (websockets.ConnectionClosed, ConnectionError, OSError) as e:
                print(f"[Bitget WS] {label} koptu: {e} — 5s sonra tekrar")
                await asyncio.sleep(5)
            except Exception as e:
                print(f"[Bitget WS] {label} hata: {e} — 10s sonra tekrar")
                await asyncio.sleep(10)

    async def subscribe_kline(self, symbol: str, interval: str = "1m"):
        """Canlı mum verisi — Bitget WS v2 formatı."""
        redis = get_redis()
        inst_id = symbol.replace("/", "").replace(":USDT", "")

        # v2 format: instType=USDT-FUTURES, channel=candle1m
        subscribe_msg = {
            "op": "subscribe",
            "args": [{"instType": "USDT-FUTURES", "channel": f"candle{interval}", "instId": inst_id}]
        }

        async def handler(data):
            for candle in data.get("data", []):
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

        await self._ws_connect(subscribe_msg, handler, f"candle{interval}/{inst_id}")

    async def subscribe_ticker(self, symbol: str):
        """Anlık fiyat — Bitget WS v2 formatı."""
        redis = get_redis()
        inst_id = symbol.replace("/", "").replace(":USDT", "")

        subscribe_msg = {
            "op": "subscribe",
            "args": [{"instType": "USDT-FUTURES", "channel": "ticker", "instId": inst_id}]
        }

        async def handler(data):
            for tick in data.get("data", []):
                await redis.set(
                    f"ticker:{symbol}",
                    json.dumps({
                        "symbol": symbol,
                        "last": tick.get("lastPr", tick.get("last")),
                        "bid": tick.get("bidPr", tick.get("bestBid")),
                        "ask": tick.get("askPr", tick.get("bestAsk")),
                        "funding_rate": tick.get("fundingRate", "0"),
                        "open_interest": tick.get("holdVol", tick.get("holdingAmount")),
                    })
                )

        await self._ws_connect(subscribe_msg, handler, f"ticker/{inst_id}")

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
        tp_price: float = None,
        sl_price: float = None,
        pos_side: str = None,  # 'long' or 'short' for hedge mode
    ) -> dict:
        params = {"tdMode": "cross"}
        
        if pos_side:
            params["posSide"] = pos_side
            
        # TP/SL doğrudan market emrine ekle
        if tp_price:
            params["takeProfitPrice"] = tp_price
        if sl_price:
            params["stopLossPrice"] = sl_price

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
        # Bitget hedge mode: 0=long, 1=short
        position_idx = 0 if pos_side == "long" else 1
        
        return await self.exchange.modify_position_tpsl(
            symbol,
            take_profit_price=tp_price,
            stop_loss_price=sl_price,
            params={
                "positionIdx": position_idx,
                "tpslMode": "full"
            }
        )

    async def close_position(self, symbol: str, side: str, amount: float, pos_side: str = None) -> dict:
        close_side = "sell" if side == "buy" else "buy"
        return await self.place_order(symbol, close_side, amount, pos_side=pos_side)

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
