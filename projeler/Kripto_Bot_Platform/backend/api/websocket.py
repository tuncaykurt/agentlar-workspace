"""
Frontend → Backend WebSocket
Bitget'ten gelen canlı veriyi Redis pub/sub üzerinden frontend'e iletir.
"""
import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
from core.redis_client import get_redis
import redis.asyncio as aioredis
from core.config import settings


async def market_ws(websocket: WebSocket, symbol: str):
    """Belirli bir sembolün canlı mum verisini frontend'e gönder."""
    await websocket.accept()

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, protocol=2)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"kline:{symbol}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"kline:{symbol}")
        await redis_client.aclose()


async def bot_status_ws(websocket: WebSocket, bot_id: int):
    """Bot durumunu her 5 saniyede bir gönder. Token query param ile auth."""
    # WS auth: ?token=xxx query param'dan JWT doğrula
    token = websocket.query_params.get("token")
    if token:
        try:
            from core.security import decode_token
            payload = decode_token(token)
            # Token geçerli, devam et
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

    await websocket.accept()
    redis = get_redis()

    try:
        while True:
            raw = await redis.get(f"bot:{bot_id}:status")
            if raw:
                await websocket.send_text(raw)
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
