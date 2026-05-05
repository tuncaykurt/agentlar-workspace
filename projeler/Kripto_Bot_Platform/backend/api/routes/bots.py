"""
Bot Yönetimi API — PostgreSQL Persistent
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
from bot.engine import BotEngine
from exchange.bitget_client import bitget
from core.database import async_session
from models.trade import Bot, BotStatus
from sqlalchemy import select, update, delete

router = APIRouter(prefix="/bots", tags=["bots"])

# Çalışan bot instance'ları (memory — sadece aktif engine'ler)
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
    strategy_params: Optional[dict] = None  # frontend alias, params yoksa kullanılır
    tp_pct: Optional[float] = None
    sl_pct: Optional[float] = None
    trailing_sl: Optional[bool] = None


@router.get("")
async def list_bots():
    try:
        async with async_session() as session:
            result = await session.execute(select(Bot).order_by(Bot.id.desc()))
            bots = result.scalars().all()
            return [
                {
                    "id": b.id,
                    "name": b.name,
                    "symbol": b.symbol,
                    "strategy": b.strategy,
                    "exchange": b.exchange,
                    "status": b.status.value if b.status else "stopped",
                    "paper_mode": b.paper_mode,
                    "leverage": b.leverage,
                    "risk_per_trade": b.risk_per_trade,
                    "max_daily_loss": b.max_daily_loss,
                    "initial_balance": b.initial_balance or 1000.0,
                    "params": json.loads(b.params) if b.params else None,
                    "running": b.id in _running_bots,
                    "created_at": b.created_at.isoformat() if b.created_at else None,
                }
                for b in bots
            ]
    except Exception as e:
        print(f"[List Bots Error] {e}")
        return []


@router.post("")
async def create_bot(data: BotCreate):
    try:
        async with async_session() as session:
            effective_params = data.params or data.strategy_params or {}
            if data.tp_pct is not None:
                effective_params["tp_pct"] = data.tp_pct
            if data.sl_pct is not None:
                effective_params["sl_pct"] = data.sl_pct
            if data.trailing_sl is not None:
                effective_params["trailing_sl"] = data.trailing_sl

            # Strateji normalizasyonu:
            # tradingview_webhook engine için custom_signal olarak saklanir,
            # params içinde strateji tipi korunur.
            strategy = data.strategy
            if strategy == "tradingview_webhook":
                # webhook_token'u params'a ekle (signal_source'dan al)
                token = effective_params.get("webhook_token") or effective_params.get("signal_source", "")
                if token and not token.startswith("builtin") and not token.startswith("custom__"):
                    effective_params["webhook_token"] = token
                effective_params["_strategy_display"] = "tradingview_webhook"
                # Engine tradingview_webhook + custom_signal ikisini de yakalar

            bot = Bot(
                name=data.name,
                symbol=data.symbol,
                strategy=strategy,
                exchange="bitget",
                status=BotStatus.STOPPED,
                paper_mode=data.paper_mode,
                leverage=data.leverage,
                risk_per_trade=data.risk_per_trade,
                max_daily_loss=data.max_daily_loss,
                initial_balance=data.initial_balance,
                params=json.dumps(effective_params) if effective_params else None,
            )
            session.add(bot)
            await session.commit()
            await session.refresh(bot)
            print(f"[Bot Created] ID:{bot.id} Name:{data.name} Strategy:{strategy} Params:{effective_params}")
            return {
                "id": bot.id,
                "name": bot.name,
                "symbol": bot.symbol,
                "strategy": bot.strategy,
                "paper_mode": bot.paper_mode,
                "params": effective_params,  # önceki hatayı düzelttik: data.params değil effective_params
                "running": False,
            }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[Bot Create Error] Exception: {str(e)}")
        print(f"[Bot Create Error] Traceback: {error_trace}")
        
        # Validation errors or database constraint violations
        if "integrity error" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(status_code=400, detail=f"Kayıt hatası: Bot ismi veya parametreleri geçersiz. ({str(e)})")
            
        raise HTTPException(
            status_code=503, 
            detail={
                "message": "Veritabanı veya Sunucu Hatası",
                "error": str(e),
                "type": type(e).__name__
            }
        )


@router.post("/{bot_id}/start")
async def start_bot(bot_id: int):
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")
        if bot_id in _running_bots:
            raise HTTPException(400, "Bot zaten calisiyor")

        config = {
            "id": bot.id,
            "name": bot.name,
            "symbol": bot.symbol,
            "strategy": bot.strategy,
            "paper_mode": bot.paper_mode,
            "leverage": bot.leverage,
            "risk_per_trade": bot.risk_per_trade,
            "max_daily_loss": bot.max_daily_loss,
            "initial_balance": bot.initial_balance or 1000.0,
            "params": json.loads(bot.params) if bot.params else {},
        }

        engine = BotEngine(config, bitget)
        _running_bots[bot_id] = engine
        task = asyncio.create_task(engine.run())
        _bot_tasks[bot_id] = task

        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.RUNNING)
        )
        await session.commit()

    return {"status": "started", "bot_id": bot_id}


@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: int):
    if bot_id not in _running_bots:
        raise HTTPException(400, "Bot calismiypr")

    _running_bots[bot_id].stop()
    _bot_tasks[bot_id].cancel()
    del _running_bots[bot_id]
    del _bot_tasks[bot_id]

    async with async_session() as session:
        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.STOPPED)
        )
        await session.commit()

    return {"status": "stopped", "bot_id": bot_id}


@router.delete("/{bot_id}")
async def delete_bot(bot_id: int):
    if bot_id in _running_bots:
        _running_bots[bot_id].stop()
        _bot_tasks[bot_id].cancel()
        del _running_bots[bot_id]
        del _bot_tasks[bot_id]

    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")
        await session.execute(delete(Bot).where(Bot.id == bot_id))
        await session.commit()

    return {"status": "deleted", "bot_id": bot_id}


@router.patch("/{bot_id}")
async def update_bot(bot_id: int, data: BotCreate):
    if bot_id in _running_bots:
        raise HTTPException(400, "Calisan botu duzenleyemezsiniz. Once durdurun.")

    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")

        effective_params = data.params or data.strategy_params
        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(
                name=data.name,
                symbol=data.symbol,
                strategy=data.strategy,
                paper_mode=data.paper_mode,
                leverage=data.leverage,
                risk_per_trade=data.risk_per_trade,
                max_daily_loss=data.max_daily_loss,
                initial_balance=data.initial_balance,
                params=json.dumps(effective_params) if effective_params else None,
            )
        )
        await session.commit()
        print(f"[Bot Updated] ID:{bot_id} Name:{data.name}")

    return {"id": bot_id, **data.dict(), "running": False}


@router.get("/{bot_id}/status")
async def bot_status(bot_id: int):
    from core.redis_client import get_redis
    redis = get_redis()
    raw = await redis.get(f"bot:{bot_id}:status")
    if not raw:
        return {"status": "no_data"}
    return json.loads(raw)
