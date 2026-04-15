"""
odds-api.io v3 üzerinden gerçek zamanlı NBA oran verisi toplama.

Free plan: max 2 büro → Bet365 + Bwin kullanıyoruz.
USE_MOCK_DATA=true → mock_data.py ile API'siz test.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

import aiohttp

from config import ODDS_API_KEY, USE_MOCK_DATA, POLL_INTERVAL

logger = logging.getLogger(__name__)

ODDS_API_BASE = "https://api.odds-api.io/v3"
BOOKMAKERS = ["Bet365", "Bwin"]   # Free plan: max 2
BASKETBALL_SPORT = "basketball"
NBA_LEAGUE_SLUG = "usa-nba"


# ─────────────────────────────────────────────
#  YARDIMCI FONKSİYONLAR
# ─────────────────────────────────────────────

def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _fetch_nba_events(session: aiohttp.ClientSession) -> list[dict]:
    """Bugün oynanacak (pending) + canlı (live) NBA eventlerini getirir."""
    url = f"{ODDS_API_BASE}/events"
    params = {"apiKey": ODDS_API_KEY, "sport": BASKETBALL_SPORT}
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                logger.error(f"Events API hatası: {resp.status}")
                return []
            events = await resp.json()
            today = _today_iso()
            return [
                e for e in events
                if NBA_LEAGUE_SLUG in e.get("league", {}).get("slug", "")
                and e.get("status") in ("live", "pending")
                and today in e.get("date", "")
            ]
    except Exception as e:
        logger.error(f"Events fetch hatası: {e}")
        return []


async def _fetch_odds_for_event(
    session: aiohttp.ClientSession,
    event: dict,
    bookmaker: str,
) -> list[dict]:
    """Tek event + tek büro için oran verisini normalize eder."""
    url = f"{ODDS_API_BASE}/odds"
    params = {"apiKey": ODDS_API_KEY, "eventId": event["id"], "bookmakers": bookmaker}
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()
            return _normalize(event, bookmaker, data)
    except Exception as e:
        logger.warning(f"Odds fetch hatası ({bookmaker}/{event['id']}): {e}")
        return []


def _normalize(event: dict, bookmaker: str, data: dict) -> list[dict]:
    """API yanıtını iç formata çevirir."""
    results = []
    bm_data = data.get("bookmakers", {}).get(bookmaker, [])
    scores = data.get("scores", {}) or {}

    for market in bm_data:
        if market.get("name") != "ML":   # Sadece moneyline (kazanma oranı)
            continue
        for odds_entry in market.get("odds", []):
            home_odds = float(odds_entry.get("home", 0))
            away_odds = float(odds_entry.get("away", 0))
            if home_odds <= 0:
                continue
            results.append({
                "event_id": str(event["id"]),
                "home_team": event.get("home", ""),
                "away_team": event.get("away", ""),
                "bookmaker": bookmaker,
                "odds_home": home_odds,
                "odds_away": away_odds,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "scenario": "real",
                "score_home": int(scores.get("home") or 0),
                "score_away": int(scores.get("away") or 0),
                "quarter": 0,
                "time_remaining": 0,
                "status": event.get("status", ""),
                "league": event.get("league", {}).get("name", ""),
            })
    return results


# ─────────────────────────────────────────────
#  ANA STREAM
# ─────────────────────────────────────────────

async def real_data_stream(poll_interval: int = POLL_INTERVAL) -> AsyncGenerator[list[dict], None]:
    """
    Her poll_interval saniyede bir:
    1. Günün NBA eventlerini çeker
    2. Her event × her büro için oranları paralel çeker
    3. Normalize batch döner
    """
    async with aiohttp.ClientSession() as session:
        while True:
            events = await _fetch_nba_events(session)
            if not events:
                logger.info("Aktif NBA eventi yok, tekrar deneniyor...")
                await asyncio.sleep(poll_interval)
                continue

            logger.info(f"{len(events)} NBA eventi izleniyor: "
                        f"{[e['home'] + ' vs ' + e['away'] for e in events]}")

            # Tüm event × büro kombinasyonları paralel
            tasks = [
                _fetch_odds_for_event(session, event, bm)
                for event in events
                for bm in BOOKMAKERS
            ]
            results_nested = await asyncio.gather(*tasks)
            batch = [tick for sublist in results_nested for tick in sublist]

            if batch:
                logger.info(f"Batch: {len(batch)} oran tick'i")
                yield batch

            await asyncio.sleep(poll_interval)


def get_data_stream():
    """Config'e göre mock veya gerçek stream döner."""
    if USE_MOCK_DATA:
        logger.info("Mock veri modu aktif.")
        from data.mock_data import mock_data_stream
        return mock_data_stream()
    else:
        if not ODDS_API_KEY:
            raise ValueError(".env dosyasında ODDS_API_KEY eksik!")
        logger.info("Gerçek API modu aktif (odds-api.io).")
        return real_data_stream()
