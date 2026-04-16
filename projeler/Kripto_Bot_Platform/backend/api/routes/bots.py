from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
from bot.engine import BotEngine
from exchange.bitget_client import bitget

router = APIRouter(prefix="/bots", tags=["bots"])

# Çalışan bot instance'ları (memory'de tutuluyor, DB değil)
_running_bots: dict[int, BotEngine] = {}
_bot_tasks: dict[int, asyncio.Task] = {}


class BotCreate(BaseModel):
    name: str
    symbol: str = "BTC/USDT:USDT"
    strategy: str = "ema_cross"
    paper_mode: bool = True
    leverage: int = 3
    risk_per_trade: float = 0.01
    max_daily_loss: float = 0.05
    initial_balance: float = 1000.0
    params: Optional[dict] = None


class BotResponse(BaseModel):
    id: int
    name: str
    symbol: str
    strategy: str
    paper_mode: bool
    running: bool


_bots_db: dict[int, dict] = {}   # Basit in-memory (ilerleyen fazda PostgreSQL'e taşınır)
_next_id = 1


@router.get("/")
async def list_bots():
    return [
        {**bot, "running": bot["id"] in _running_bots}
        for bot in _bots_db.values()
    ]


@router.post("/")
async def create_bot(data: BotCreate):
    global _next_id
    bot_id = _next_id
    _next_id += 1

    bot = {**data.dict(), "id": bot_id}
    _bots_db[bot_id] = bot
    print(f"[Bot Created] ID:{bot_id} Name:{data.name} Strategy:{data.strategy} Params:{data.params}")
    return bot


@router.post("/{bot_id}/start")
async def start_bot(bot_id: int):
    if bot_id not in _bots_db:
        raise HTTPException(404, "Bot bulunamadı")
    if bot_id in _running_bots:
        raise HTTPException(400, "Bot zaten çalışıyor")

    config = _bots_db[bot_id]
    engine = BotEngine(config, bitget)
    _running_bots[bot_id] = engine
    task = asyncio.create_task(engine.run())
    _bot_tasks[bot_id] = task

    return {"status": "started", "bot_id": bot_id}


@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: int):
    if bot_id not in _running_bots:
        raise HTTPException(400, "Bot çalışmıyor")

    _running_bots[bot_id].stop()
    _bot_tasks[bot_id].cancel()
    del _running_bots[bot_id]
    del _bot_tasks[bot_id]

    return {"status": "stopped", "bot_id": bot_id}


@router.delete("/{bot_id}")
async def delete_bot(bot_id: int):
    if bot_id not in _bots_db:
        raise HTTPException(404, "Bot bulunamadı")
    if bot_id in _running_bots:
        _running_bots[bot_id].stop()
        _bot_tasks[bot_id].cancel()
        del _running_bots[bot_id]
        del _bot_tasks[bot_id]
    del _bots_db[bot_id]
    return {"status": "deleted", "bot_id": bot_id}


@router.patch("/{bot_id}")
async def update_bot(bot_id: int, data: BotCreate):
    if bot_id not in _bots_db:
        raise HTTPException(404, "Bot bulunamadı")
    if bot_id in _running_bots:
        raise HTTPException(400, "Çalışan botu düzenleyemezsiniz. Önce durdurun.")
    _bots_db[bot_id] = {**data.dict(), "id": bot_id}
    print(f"[Bot Updated] ID:{bot_id} Name:{data.name} Params:{data.params}")
    return _bots_db[bot_id]


@router.get("/{bot_id}/status")
async def bot_status(bot_id: int):
    from core.redis_client import get_redis
    import json
    redis = get_redis()
    raw = await redis.get(f"bot:{bot_id}:status")
    if not raw:
        return {"status": "no_data"}
    return json.loads(raw)
