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
from exchange.exchange_factory import create_exchange_client, SUPPORTED_EXCHANGES
from core.redis_client import get_redis
from core.database import async_session
from models.trade import Bot, BotStatus
from sqlalchemy import select, update, delete

class _ExClient:
    """CCXT exchange'i BotEngine interface'ine saran wrapper."""
    def __init__(self, ex):
        self.exchange = ex
    async def set_leverage(self, symbol, leverage):
        await self.exchange.set_leverage(leverage, symbol)
    async def place_order(self, symbol, side, amount, order_type="market", price=None, tp_price=None, sl_price=None):
        params = {}
        if tp_price: params["takeProfitPrice"] = tp_price
        if sl_price: params["stopLossPrice"] = sl_price
        if order_type == "market":
            return await self.exchange.create_market_order(symbol, side, amount, params=params)
        return await self.exchange.create_limit_order(symbol, side, amount, price, params=params)
    async def get_funding_rate(self, symbol):
        t = await self.exchange.fetch_ticker(symbol)
        return float(t.get("info", {}).get("fundingRate", 0))
    async def get_ohlcv(self, symbol, tf="1m", limit=200):
        return await self.exchange.fetch_ohlcv(symbol, tf, limit=limit)
    async def close(self):
        await self.exchange.close()


async def _get_exchange_client(exchange: str):
    """Redis'teki kullanıcı API key'leri ile doğru exchange client oluşturur."""
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:default:{exchange}")
    if raw:
        keys = json.loads(raw)
        ex = create_exchange_client(
            exchange,
            keys["api_key"], keys["secret"], keys.get("passphrase", "")
        )
        return _ExClient(ex)
    # Redis'te key yoksa bitget için module singleton, diğerleri için hata
    if exchange == "bitget":
        return bitget
    raise HTTPException(400, f"{exchange} için API key bulunamadı. Önce Borsa Ayarları'ndan key girin.")

router = APIRouter(prefix="/bots", tags=["bots"])

# Çalışan bot instance'ları (memory — sadece aktif engine'ler)
_running_bots: dict[int, BotEngine] = {}
_bot_tasks: dict[int, asyncio.Task] = {}


class BotCreate(BaseModel):
    name: str
    symbol: str = "BTC/USDT:USDT"
    strategy: str = "ema_cross"
    exchange: str = "bitget"
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
                exchange=data.exchange,
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
                "exchange": bot.exchange,
                "paper_mode": bot.paper_mode,
                "leverage": bot.leverage,
                "risk_per_trade": bot.risk_per_trade,
                "max_daily_loss": bot.max_daily_loss,
                "initial_balance": bot.initial_balance,
                "params": effective_params,
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

        exchange_client = await _get_exchange_client(bot.exchange or "bitget")
        engine = BotEngine(config, exchange_client)
        _running_bots[bot_id] = engine

        async def _safe_run(eng, bid):
            try:
                await eng.run()
            except Exception as e:
                import traceback
                print(f"[Bot #{bid}] ENGINE ÇÖKTÜ: {e}")
                traceback.print_exc()

        task = asyncio.create_task(_safe_run(engine, bot_id))
        _bot_tasks[bot_id] = task

        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.RUNNING)
        )
        await session.commit()

    return {"status": "started", "bot_id": bot_id}


@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: int):
    if bot_id not in _running_bots:
        raise HTTPException(400, "Bot çalışmıyor")

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

        effective_params = data.params or data.strategy_params or {}
        if data.tp_pct is not None:
            effective_params["tp_pct"] = data.tp_pct
        if data.sl_pct is not None:
            effective_params["sl_pct"] = data.sl_pct
        if data.trailing_sl is not None:
            effective_params["trailing_sl"] = data.trailing_sl

        strategy = data.strategy
        if strategy == "tradingview_webhook":
            token = effective_params.get("webhook_token") or effective_params.get("signal_source", "")
            if token and not token.startswith("builtin") and not token.startswith("custom__"):
                effective_params["webhook_token"] = token
            effective_params["_strategy_display"] = "tradingview_webhook"

        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(
                name=data.name,
                symbol=data.symbol,
                strategy=strategy,
                paper_mode=data.paper_mode,
                leverage=data.leverage,
                risk_per_trade=data.risk_per_trade,
                max_daily_loss=data.max_daily_loss,
                initial_balance=data.initial_balance,
                params=json.dumps(effective_params) if effective_params else None,
            )
        )
        await session.commit()
        print(f"[Bot Updated] ID:{bot_id} Name:{data.name} Strategy:{strategy} Params:{effective_params}")

    return {
        "id": bot_id,
        "name": data.name,
        "symbol": data.symbol,
        "strategy": strategy,
        "exchange": data.exchange,
        "paper_mode": data.paper_mode,
        "leverage": data.leverage,
        "risk_per_trade": data.risk_per_trade,
        "max_daily_loss": data.max_daily_loss,
        "initial_balance": data.initial_balance,
        "params": effective_params,
        "running": bot_id in _running_bots,
    }


@router.get("/{bot_id}/status")
async def bot_status(bot_id: int):
    from core.redis_client import get_redis
    redis = get_redis()
    raw = await redis.get(f"bot:{bot_id}:status")
    if not raw:
        return {"status": "no_data"}
    return json.loads(raw)


# ─── Akıllı Filtreler ────────────────────────────────────────────────────────

class FilterUpdate(BaseModel):
    smart_hours_enabled: Optional[bool] = None
    news_protection_enabled: Optional[bool] = None
    self_learning_enabled: Optional[bool] = None
    trend_filter_enabled: Optional[bool] = None
    volatility_filter_enabled: Optional[bool] = None
    news_blackout_minutes: Optional[int] = None
    min_win_rate_threshold: Optional[float] = None
    max_volatility_atr: Optional[float] = None
    blocked_hours: Optional[str] = None


@router.get("/{bot_id}/filters")
async def get_filters(bot_id: int):
    from models.trade import BotFilter
    async with async_session() as session:
        result = await session.execute(select(BotFilter).where(BotFilter.bot_id == bot_id))
        f = result.scalar_one_or_none()
        if not f:
            return {
                "bot_id": bot_id,
                "smart_hours_enabled": False,
                "news_protection_enabled": False,
                "self_learning_enabled": False,
                "trend_filter_enabled": False,
                "volatility_filter_enabled": False,
                "news_blackout_minutes": 30,
                "min_win_rate_threshold": 0.4,
                "max_volatility_atr": None,
                "blocked_hours": None,
            }
        return {
            "bot_id": f.bot_id,
            "smart_hours_enabled": f.smart_hours_enabled,
            "news_protection_enabled": f.news_protection_enabled,
            "self_learning_enabled": f.self_learning_enabled,
            "trend_filter_enabled": f.trend_filter_enabled,
            "volatility_filter_enabled": f.volatility_filter_enabled,
            "news_blackout_minutes": f.news_blackout_minutes,
            "min_win_rate_threshold": f.min_win_rate_threshold,
            "max_volatility_atr": f.max_volatility_atr,
            "blocked_hours": f.blocked_hours,
        }


@router.get("/signals/all")
async def get_all_signal_logs(limit: int = 100, action: str = None):
    """Tüm botlardan gelen sinyal logları"""
    from models.trade import SignalLog
    async with async_session() as session:
        query = select(SignalLog).order_by(SignalLog.created_at.desc())
        if action:
            query = query.where(SignalLog.action == action)
        query = query.limit(limit)
        result = await session.execute(query)
        logs = result.scalars().all()
        return [
            {
                "id": l.id,
                "bot_id": l.bot_id,
                "symbol": l.symbol,
                "signal_type": l.signal_type,
                "source": l.source,
                "price": l.price,
                "reason": l.reason,
                "action": l.action,
                "reject_reason": l.reject_reason,
                "confidence": l.confidence,
                "tp_price": l.tp_price,
                "sl_price": l.sl_price,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]


@router.get("/{bot_id}/signals")
async def get_signal_logs(bot_id: int, limit: int = 50, action: str = None):
    """Bot'a gelen tüm sinyallerin logunu döner"""
    from models.trade import SignalLog
    async with async_session() as session:
        query = select(SignalLog).where(SignalLog.bot_id == bot_id).order_by(SignalLog.created_at.desc())
        if action:
            query = query.where(SignalLog.action == action)
        query = query.limit(limit)
        result = await session.execute(query)
        logs = result.scalars().all()
        return [
            {
                "id": l.id,
                "signal_type": l.signal_type,
                "source": l.source,
                "price": l.price,
                "reason": l.reason,
                "action": l.action,
                "reject_reason": l.reject_reason,
                "confidence": l.confidence,
                "tp_price": l.tp_price,
                "sl_price": l.sl_price,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]


@router.get("/{bot_id}/performance")
async def bot_performance(bot_id: int):
    """Bot'un sinyal performansı — TP/SL vuruş oranı, kâr/zarar özeti."""
    from models.trade import SignalLog
    async with async_session() as session:
        result = await session.execute(
            select(SignalLog).where(
                SignalLog.bot_id == bot_id,
                SignalLog.outcome.isnot(None),
            ).order_by(SignalLog.created_at.desc())
        )
        signals = result.scalars().all()

    total = len(signals)
    tp_hits = sum(1 for s in signals if s.outcome == "tp_hit")
    sl_hits = sum(1 for s in signals if s.outcome == "sl_hit")
    still_open = sum(1 for s in signals if s.outcome == "open")
    expired = sum(1 for s in signals if s.outcome == "expired")

    pnl_list = [s.outcome_pnl_pct for s in signals if s.outcome_pnl_pct is not None]
    avg_pnl = sum(pnl_list) / len(pnl_list) if pnl_list else 0
    total_pnl = sum(pnl_list)

    closed = tp_hits + sl_hits
    win_rate = (tp_hits / closed * 100) if closed > 0 else 0

    return {
        "bot_id": bot_id,
        "total_signals": total,
        "open": still_open,
        "tp_hit": tp_hits,
        "sl_hit": sl_hits,
        "expired": expired,
        "win_rate": round(win_rate, 1),
        "avg_pnl_pct": round(avg_pnl, 2),
        "total_pnl_pct": round(total_pnl, 2),
        "last_signals": [
            {
                "id": s.id,
                "signal_type": s.signal_type,
                "price": s.price,
                "tp_price": s.tp_price,
                "sl_price": s.sl_price,
                "outcome": s.outcome,
                "outcome_price": s.outcome_price,
                "outcome_pnl_pct": s.outcome_pnl_pct,
                "outcome_at": s.outcome_at.isoformat() if s.outcome_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in signals[:20]
        ],
    }


@router.patch("/{bot_id}/filters")
async def update_filters(bot_id: int, data: FilterUpdate):
    from models.trade import BotFilter
    async with async_session() as session:
        result = await session.execute(select(BotFilter).where(BotFilter.bot_id == bot_id))
        f = result.scalar_one_or_none()
        if not f:
            f = BotFilter(bot_id=bot_id)
            session.add(f)

        for field, value in data.dict(exclude_none=True).items():
            setattr(f, field, value)

        await session.commit()
        await session.refresh(f)

    return {"status": "ok", "bot_id": bot_id}
