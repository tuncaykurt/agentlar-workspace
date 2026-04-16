"""
API anahtarı olmadan test için gerçekçi mock NBA verisi üretir.
Manipülasyon senaryoları dahil.
"""
import random
import time
from datetime import datetime, timezone
from typing import Generator

# Gerçek NBA takımı çiftleri
NBA_MATCHUPS = [
    ("Boston Celtics", "Miami Heat"),
    ("Los Angeles Lakers", "Golden State Warriors"),
    ("Milwaukee Bucks", "Philadelphia 76ers"),
    ("Denver Nuggets", "Phoenix Suns"),
    ("Oklahoma City Thunder", "Dallas Mavericks"),
]

BOOKMAKERS = [
    "pinnacle", "bet365", "betfair", "unibet",
    "williamhill", "draftkings", "fanduel", "betmgm",
]


def _base_odds(home_team: str) -> float:
    """Takıma göre başlangıç oranı (1.50 - 3.20 arası)."""
    seed = sum(ord(c) for c in home_team)
    random.seed(seed)
    return round(random.uniform(1.55, 2.90), 2)


def generate_normal_tick(event: dict, bookmaker: str) -> dict:
    """Normal piyasa hareketi: küçük rastgele dalgalanma."""
    drift = random.gauss(0, 0.02)
    new_odds = max(1.01, round(event["base_odds"] + drift, 3))
    return {
        "event_id": event["id"],
        "home_team": event["home_team"],
        "away_team": event["away_team"],
        "bookmaker": bookmaker,
        "odds_home": new_odds,
        "odds_away": round(1 / (1 - 1 / new_odds), 3) if new_odds > 1.01 else 9.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scenario": "normal",
    }


def generate_steam_move(event: dict, bookmaker: str) -> dict:
    """
    Steam Move senaryosu:
    Büyük profesyonel bahisçi hareketi → aniden %8-20 oran düşüşü.
    Önce birkaç lider büroda (Pinnacle) başlar, sonra diğerleri kopyalar.
    """
    if bookmaker == "pinnacle":
        drop = random.uniform(0.08, 0.20)
    else:
        drop = random.uniform(0.03, 0.10)

    crashed_odds = max(1.01, round(event["base_odds"] * (1 - drop), 3))
    return {
        "event_id": event["id"],
        "home_team": event["home_team"],
        "away_team": event["away_team"],
        "bookmaker": bookmaker,
        "odds_home": crashed_odds,
        "odds_away": round(crashed_odds * 1.15, 3),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scenario": "steam_move",
    }


def generate_shaving(event: dict, bookmaker: str) -> dict:
    """
    Shaving senaryosu:
    Kademeli küçük düşüşler → her tick'te 0.5-1% kayıp.
    Doğal görünümlü ama kümülatif olarak büyük sapma yaratır.
    """
    shave = random.uniform(0.003, 0.01)
    shaved_odds = max(1.01, round(event["base_odds"] * (1 - shave), 3))
    return {
        "event_id": event["id"],
        "home_team": event["home_team"],
        "away_team": event["away_team"],
        "bookmaker": bookmaker,
        "odds_home": shaved_odds,
        "odds_away": round(shaved_odds * 1.20, 3),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scenario": "shaving",
    }


def mock_data_stream() -> Generator[list[dict], None, None]:
    """
    Sonsuz döngüde NBA canlı oran verisi üretir.
    Her ~15-20 tick'te bir manipülasyon senaryosu tetiklenir.
    """
    events = []
    for i, (home, away) in enumerate(NBA_MATCHUPS):
        events.append({
            "id": f"nba_{i}_{int(time.time())}",
            "home_team": home,
            "away_team": away,
            "base_odds": _base_odds(home),
            "score_home": random.randint(0, 85),
            "score_away": random.randint(0, 85),
            "quarter": random.randint(1, 4),
            "time_remaining": random.randint(0, 720),
        })

    tick = 0
    while True:
        batch = []

        for event in events:
            for bookmaker in BOOKMAKERS:
                # Bağımsız olasılık: her tick'te %12 steam, %10 shaving şansı
                roll = random.random()
                if tick >= 5 and roll < 0.12:
                    tick_data = generate_steam_move(event, bookmaker)
                elif tick >= 5 and roll < 0.22:
                    tick_data = generate_shaving(event, bookmaker)
                else:
                    tick_data = generate_normal_tick(event, bookmaker)

                # Skor güncellemesi (3-4 dakikada bir)
                if tick % 30 == 0:
                    event["score_home"] += random.randint(0, 3)
                    event["score_away"] += random.randint(0, 3)
                    event["base_odds"] = max(
                        1.01,
                        event["base_odds"] + random.gauss(0, 0.05)
                    )

                tick_data["score_home"] = event["score_home"]
                tick_data["score_away"] = event["score_away"]
                tick_data["quarter"] = event["quarter"]
                tick_data["time_remaining"] = max(
                    0, event["time_remaining"] - random.randint(0, 15)
                )
                batch.append(tick_data)

        tick += 1
        yield batch
        time.sleep(0)  # generator'ı bloklamama; çağıran kontrol eder
