"""
Ekonomik Takvim API — FinnHub verilerini sunar
"""
from fastapi import APIRouter, Query
from services.economic_calendar import (
    get_upcoming_events,
    is_news_blackout,
    sync_economic_events,
    fetch_finnhub_calendar,
)
from core.database import async_session
from models.trade import EconomicEvent
from sqlalchemy import select, and_
from datetime import datetime, timedelta

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events")
async def list_events(
    days: int = Query(14, ge=1, le=90),
    impact: str = Query(None),
    country: str = Query(None),
):
    """Belirtilen gün aralığındaki tüm ekonomik olayları döner"""
    now = datetime.utcnow()
    start = now - timedelta(days=1)  # dünden itibaren
    end = now + timedelta(days=days)

    async with async_session() as session:
        query = select(EconomicEvent).where(
            and_(
                EconomicEvent.event_time >= start,
                EconomicEvent.event_time <= end,
            )
        ).order_by(EconomicEvent.event_time)

        if impact:
            query = query.where(EconomicEvent.impact == impact)
        if country:
            query = query.where(EconomicEvent.country == country)

        result = await session.execute(query)
        events = result.scalars().all()

        return [
            {
                "id": e.id,
                "title": e.title,
                "country": e.country,
                "category": e.category,
                "impact": e.impact,
                "event_time": e.event_time.isoformat() if e.event_time else None,
                "actual": e.actual,
                "forecast": e.forecast,
                "previous": e.previous,
                "source": e.source,
            }
            for e in events
        ]


@router.get("/upcoming")
async def upcoming_events(
    hours: int = Query(24, ge=1, le=168),
    impact: str = Query(None),
):
    """Önümüzdeki X saat içindeki olayları döner"""
    return await get_upcoming_events(hours=hours, impact=impact)


@router.get("/blackout")
async def blackout_status(minutes: int = Query(30, ge=5, le=120)):
    """Şu an haber blackout döneminde mi?"""
    return await is_news_blackout(minutes_buffer=minutes)


@router.post("/sync")
async def trigger_sync():
    """Manuel takvim senkronizasyonu tetikle"""
    from core.config import settings
    key = getattr(settings, "FINNHUB_API_KEY", "")
    key_status = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else ("empty" if not key else "short")
    count = await sync_economic_events()
    return {"synced": count, "key_status": key_status}
