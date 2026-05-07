"""
Ekonomik Takvim Servisi
FinnHub API'den ekonomik olayları çeker ve PostgreSQL'e kaydeder.
Bot filtreleri bu verileri kullanarak yüksek etkili olaylarda işlem yapmayı durdurur.
"""
import asyncio
import httpx
from datetime import datetime, timedelta
from sqlalchemy import select, and_
from core.database import async_session
from models.trade import EconomicEvent

# FinnHub ücretsiz API — finnhub.io'dan key al
FINNHUB_KEY = ""  # .env'den okunacak


def _get_finnhub_key():
    """Lazy load — settings import döngüsünü önler"""
    global FINNHUB_KEY
    if not FINNHUB_KEY:
        try:
            from core.config import settings
            FINNHUB_KEY = getattr(settings, "FINNHUB_API_KEY", "") or ""
        except Exception:
            pass
    return FINNHUB_KEY


def _classify_impact(impact_str: str) -> str:
    """FinnHub impact değerini normalize et"""
    val = str(impact_str).lower().strip()
    if val in ("high", "3", "red"):
        return "high"
    if val in ("medium", "2", "orange", "yellow"):
        return "medium"
    return "low"


def _classify_category(event_title: str) -> str:
    """Olay başlığından kategori çıkar"""
    title = event_title.lower()
    if any(w in title for w in ["interest rate", "fed", "fomc", "rate decision", "faiz"]):
        return "interest_rate"
    if any(w in title for w in ["cpi", "inflation", "consumer price", "enflasyon", "tüfe"]):
        return "inflation"
    if any(w in title for w in ["nfp", "non-farm", "employment", "unemployment", "jobs", "istihdam"]):
        return "employment"
    if any(w in title for w in ["gdp", "gross domestic", "gsyih"]):
        return "gdp"
    if any(w in title for w in ["ppi", "producer price"]):
        return "producer_price"
    if any(w in title for w in ["retail", "perakende"]):
        return "retail"
    if any(w in title for w in ["pmi", "manufacturing", "imalat"]):
        return "pmi"
    return "other"


async def fetch_finnhub_calendar(from_date: str = None, to_date: str = None) -> list[dict]:
    """
    FinnHub economic calendar endpoint'inden olayları çeker.
    from_date, to_date: YYYY-MM-DD formatında
    """
    key = _get_finnhub_key()
    if not key:
        print("[EconCal] FINNHUB_API_KEY tanımlı değil — takvim çekilemiyor")
        return []

    if not from_date:
        from_date = datetime.utcnow().strftime("%Y-%m-%d")
    if not to_date:
        to_date = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")

    url = f"https://finnhub.io/api/v1/calendar/economic?from={from_date}&to={to_date}&token={key}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        events = data.get("economicCalendar", [])
        print(f"[EconCal] FinnHub'dan {len(events)} olay çekildi ({from_date} → {to_date})")
        return events
    except Exception as e:
        print(f"[EconCal] FinnHub hatası: {e}")
        return []


async def sync_economic_events():
    """
    Ekonomik olayları çek ve DB'ye kaydet.
    Var olan olayları güncelle (actual/forecast değişebilir).
    """
    # Önümüzdeki 14 gün
    from_date = datetime.utcnow().strftime("%Y-%m-%d")
    to_date = (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d")

    raw_events = await fetch_finnhub_calendar(from_date, to_date)
    if not raw_events:
        return 0

    saved = 0
    async with async_session() as session:
        for ev in raw_events:
            try:
                title = ev.get("event", "Unknown")
                country = ev.get("country", "")
                impact = _classify_impact(ev.get("impact", "low"))
                event_time_str = ev.get("time", ev.get("date", ""))

                # Zaman parse
                if "T" in str(event_time_str):
                    event_time = datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
                else:
                    event_time = datetime.strptime(str(event_time_str), "%Y-%m-%d")

                # Aynı olay var mı kontrol et
                existing = await session.execute(
                    select(EconomicEvent).where(
                        and_(
                            EconomicEvent.title == title,
                            EconomicEvent.event_time == event_time,
                            EconomicEvent.country == country,
                        )
                    )
                )
                row = existing.scalar_one_or_none()

                if row:
                    # Güncelle
                    row.actual = str(ev.get("actual", "")) or None
                    row.forecast = str(ev.get("estimate", "")) or None
                    row.previous = str(ev.get("prev", "")) or None
                else:
                    # Yeni ekle
                    new_event = EconomicEvent(
                        title=title,
                        country=country,
                        category=_classify_category(title),
                        impact=impact,
                        event_time=event_time,
                        actual=str(ev.get("actual", "")) or None,
                        forecast=str(ev.get("estimate", "")) or None,
                        previous=str(ev.get("prev", "")) or None,
                        source="finnhub",
                    )
                    session.add(new_event)
                    saved += 1
            except Exception as e:
                print(f"[EconCal] Olay kaydetme hatası: {e}")
                continue

        await session.commit()

    print(f"[EconCal] {saved} yeni olay kaydedildi")
    return saved


async def get_upcoming_events(hours: int = 24, impact: str = None) -> list[dict]:
    """Önümüzdeki X saat içindeki olayları döner"""
    now = datetime.utcnow()
    until = now + timedelta(hours=hours)

    async with async_session() as session:
        query = select(EconomicEvent).where(
            and_(
                EconomicEvent.event_time >= now,
                EconomicEvent.event_time <= until,
            )
        ).order_by(EconomicEvent.event_time)

        if impact:
            query = query.where(EconomicEvent.impact == impact)

        result = await session.execute(query)
        events = result.scalars().all()

        return [
            {
                "id": e.id,
                "title": e.title,
                "country": e.country,
                "category": e.category,
                "impact": e.impact,
                "event_time": e.event_time.isoformat(),
                "actual": e.actual,
                "forecast": e.forecast,
                "previous": e.previous,
                "source": e.source,
                "minutes_until": int((e.event_time - now).total_seconds() / 60),
            }
            for e in events
        ]


async def is_news_blackout(minutes_buffer: int = 30) -> dict:
    """
    Şu an haber blackout döneminde miyiz?
    Yüksek etkili bir olayın ±minutes_buffer dakikası içindeyse True döner.
    """
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=minutes_buffer)
    window_end = now + timedelta(minutes=minutes_buffer)

    async with async_session() as session:
        result = await session.execute(
            select(EconomicEvent).where(
                and_(
                    EconomicEvent.impact == "high",
                    EconomicEvent.event_time >= window_start,
                    EconomicEvent.event_time <= window_end,
                )
            )
        )
        events = result.scalars().all()

        if events:
            return {
                "blackout": True,
                "reason": f"Yüksek etkili olay: {events[0].title}",
                "event_time": events[0].event_time.isoformat(),
                "event": events[0].title,
            }

    return {"blackout": False}


async def start_calendar_sync():
    """Arka planda periyodik takvim senkronizasyonu — her 6 saatte bir"""
    while True:
        try:
            await sync_economic_events()
        except Exception as e:
            print(f"[EconCal] Sync hatası: {e}")
        await asyncio.sleep(6 * 3600)  # 6 saat
