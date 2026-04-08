"""
SportRadar Football API provider.
Trial: 1000 istek / 30 gün, 1 req/sn

Endpoint tabanı: https://api.sportradar.com/soccer/trial/v4/en/
"""
import json, logging, os, time
import requests
import redis as _redis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

API_KEY  = os.getenv("SPORTRADAR_API_KEY", "")
BASE_URL = "https://api.sportradar.com/soccer/trial/v4/en"
# Trial: maks 1 istek/sn — rate limiter
_last_call = 0.0

# Redis cache (db=4)
try:
    _r = _redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=os.getenv("REDIS_PASSWORD") or None,
        db=4, decode_responses=True, socket_timeout=3,
    )
    _r.ping()
    REDIS_OK = True
except Exception:
    REDIS_OK = False
    _r = None

# SportRadar → iç format lig eşleştirmesi
# API-Football league_id → SportRadar competition_id
LEAGUE_MAP = {
    39:  "sr:competition:17",    # Premier League
    140: "sr:competition:8",     # La Liga
    135: "sr:competition:23",    # Serie A
    78:  "sr:competition:35",    # Bundesliga
    61:  "sr:competition:34",    # Ligue 1
    203: "sr:competition:52",    # Süper Lig
    2:   "sr:competition:7",     # Champions League
    3:   "sr:competition:679",   # Europa League
}


def _rate_limit():
    global _last_call
    elapsed = time.time() - _last_call
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    _last_call = time.time()


def _cache_get(key: str):
    if REDIS_OK:
        v = _r.get(f"sr:{key}")
        return json.loads(v) if v else None
    return None


def _cache_set(key: str, val, ttl: int = 3600):
    if REDIS_OK:
        _r.set(f"sr:{key}", json.dumps(val), ex=ttl)


def _api(path: str, ttl: int = 3600) -> dict:
    cached = _cache_get(path)
    if cached:
        return cached
    _rate_limit()
    try:
        url = f"{BASE_URL}/{path}?api_key={API_KEY}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            d = r.json()
            _cache_set(path, d, ttl)
            return d
        logger.error(f"SportRadar {r.status_code}: {path}")
        return {}
    except Exception as e:
        logger.error(f"SportRadar hata: {e}")
        return {}


# ── Normalize edilmiş veri fonksiyonları ─────────────────────────────────── #
# Tüm fonksiyonlar API-Football provider ile aynı imzayı döndürür
# böylece football.py'de provider değişimi seamless olur.

def get_fixtures_by_date(date: str, league_id: int = None) -> list:
    """
    Tarihe göre maçları çek, iç formata dönüştür.
    SportRadar: /schedules/{date}/schedule.json
    """
    path = f"schedules/{date}/schedule.json"
    data = _api(path, ttl=1800)
    sport_events = data.get("sport_events", [])
    result = []
    for ev in sport_events:
        normalized = _normalize_fixture(ev)
        if normalized is None:
            continue
        if league_id and normalized.get("league_id") != league_id:
            continue
        result.append(normalized)
    return result


def get_live_fixtures(league_id: int = None) -> list:
    """
    Canlı maçları çek.
    SportRadar: /schedules/live/schedule.json
    """
    data = _api("schedules/live/schedule.json", ttl=30)
    sport_events = data.get("sport_events", [])
    result = []
    for ev in sport_events:
        normalized = _normalize_fixture(ev)
        if normalized is None:
            continue
        if league_id and normalized.get("league_id") != league_id:
            continue
        result.append(normalized)
    return result


def get_team_matches(team_id: int, league_id: int, season: int = 2024) -> list:
    """
    Takımın son maçlarını çek.
    SportRadar: /teams/{team_id}/results.json
    team_id burada SportRadar ID olmalı — mapping gerekir.
    """
    sr_team_id = _resolve_team_id(team_id)
    if not sr_team_id:
        return []
    data = _api(f"teams/{sr_team_id}/results.json", ttl=7200)
    results = data.get("results", [])
    matches = []
    for r in results:
        m = _normalize_match_for_stats(r, sr_team_id)
        if m:
            matches.append(m)
    matches.sort(key=lambda x: x.get("date", ""))
    return matches[-10:]


def get_h2h(team1: int, team2: int) -> list:
    """H2H — takım ID mapping gerektirir."""
    sr1 = _resolve_team_id(team1)
    sr2 = _resolve_team_id(team2)
    if not sr1 or not sr2:
        return []
    data = _api(f"teams/{sr1}/versus/{sr2}/matches.json", ttl=86400)
    matches = []
    for item in data.get("last_meetings", {}).get("results", [])[:8]:
        m = _normalize_h2h(item, sr1)
        if m:
            matches.append(m)
    return matches


def get_fixture_stats(fixture_id: int) -> list:
    """Canlı maç istatistikleri."""
    sr_id = _resolve_fixture_id(fixture_id)
    if not sr_id:
        return []
    data = _api(f"sport_events/{sr_id}/statistics.json", ttl=60)
    return _normalize_stats(data)


def get_fixture_events(fixture_id: int) -> list:
    """Maç olayları (goller, kartlar)."""
    sr_id = _resolve_fixture_id(fixture_id)
    if not sr_id:
        return []
    data = _api(f"sport_events/{sr_id}/timeline.json", ttl=60)
    return _normalize_events(data)


def get_team_standing(team_id: int, league_id: int, season: int = 2024) -> dict:
    """Puan tablosu."""
    sr_competition = LEAGUE_MAP.get(league_id)
    if not sr_competition:
        return {}
    sr_id = sr_competition.replace("sr:competition:", "")
    data = _api(f"competitions/{sr_competition}/seasons.json", ttl=3600)
    seasons = data.get("seasons", [])
    # En son sezon
    target = next((s for s in seasons if str(season) in s.get("name", "")), None)
    if not target:
        return {}
    season_id = target.get("id", "")
    st_data = _api(f"seasons/{season_id}/standings.json", ttl=3600)
    sr_team = _resolve_team_id(team_id)
    for group in st_data.get("standings", []):
        for entry in group.get("rows", []):
            if entry.get("team", {}).get("id") == sr_team:
                return {
                    "rank":         entry.get("rank", 0),
                    "points":       entry.get("points", 0),
                    "played":       entry.get("played", 0),
                    "won":          entry.get("win", 0),
                    "drawn":        entry.get("draw", 0),
                    "lost":         entry.get("loss", 0),
                    "goals_for":    entry.get("goals_scored", 0),
                    "goals_against":entry.get("goals_against", 0),
                    "goal_diff":    entry.get("goal_diff", 0),
                    "form":         "",
                    "description":  "",
                    "total_teams":  len(group.get("rows", [])),
                }
    return {}


def get_team_injuries(team_id: int, league_id: int, season: int = 2024) -> list:
    """SportRadar injury verisi yok (trial'da kısıtlı)."""
    return []


def get_quota() -> dict:
    """SportRadar'da kota endpoint'i yok."""
    return {"current": "N/A", "limit_day": 1000, "provider": "sportradar"}


# ── ID Mapping (API-Football ↔ SportRadar) ─────────────────────────────── #
# Maçları yüklerken SR fixture ID'lerini Redis'e kaydediyoruz
# Sonra analiz sırasında bu mapping'i kullanıyoruz

def store_fixture_mapping(apif_id: int, sr_id: str):
    if REDIS_OK:
        _r.set(f"sr:fmap:{apif_id}", sr_id, ex=86400)

def store_team_mapping(apif_id: int, sr_id: str):
    if REDIS_OK:
        _r.set(f"sr:tmap:{apif_id}", sr_id, ex=86400 * 30)

def _resolve_fixture_id(apif_id: int) -> str:
    if REDIS_OK:
        return _r.get(f"sr:fmap:{apif_id}") or ""
    return ""

def _resolve_team_id(apif_id: int) -> str:
    if REDIS_OK:
        return _r.get(f"sr:tmap:{apif_id}") or ""
    return ""


# ── Normalizasyon ────────────────────────────────────────────────────────── #

def _normalize_fixture(ev: dict) -> dict | None:
    """SportRadar sport_event → API-Football formatına dönüştür."""
    try:
        competitors = ev.get("competitors", [])
        if len(competitors) < 2:
            return None
        home = next((c for c in competitors if c.get("qualifier") == "home"), competitors[0])
        away = next((c for c in competitors if c.get("qualifier") == "away"), competitors[1])
        sport_event_status = ev.get("sport_event_status", {})
        status = _map_status(sport_event_status.get("status", "not_started"),
                             sport_event_status.get("match_status", ""))
        tournament = ev.get("tournament", {})
        season     = ev.get("season", {})
        sport_event_context = ev.get("sport_event_context", {})
        competition = sport_event_context.get("competition", tournament)

        # Takım mapping'i kaydet
        apif_home = hash(home.get("id","")) % 100000
        apif_away = hash(away.get("id","")) % 100000
        store_team_mapping(apif_home, home.get("id",""))
        store_team_mapping(apif_away, away.get("id",""))

        # Fixture mapping
        apif_fix = hash(ev.get("id","")) % 1000000
        store_fixture_mapping(apif_fix, ev.get("id",""))

        return {
            "fixture": {
                "id":      apif_fix,
                "date":    ev.get("start_time", ""),
                "status":  {"short": status, "elapsed": sport_event_status.get("clock", {}).get("played", 0)},
                "venue":   {"name": ev.get("venue", {}).get("name", ""), "city": ev.get("venue", {}).get("city_name", "")},
                "referee": "",
            },
            "league": {
                "id":     _get_league_id(competition.get("id","")),
                "name":   competition.get("name", ""),
                "season": season.get("name", ""),
                "round":  sport_event_context.get("round", {}).get("number", ""),
                "logo":   "",
                "flag":   "",
            },
            "teams": {
                "home": {"id": apif_home, "name": home.get("name",""), "logo": "", "winner": sport_event_status.get("winner_id") == home.get("id")},
                "away": {"id": apif_away, "name": away.get("name",""), "logo": "", "winner": sport_event_status.get("winner_id") == away.get("id")},
            },
            "goals": {
                "home": sport_event_status.get("home_score"),
                "away": sport_event_status.get("away_score"),
            },
            "score": {
                "halftime": {
                    "home": sport_event_status.get("period_scores", [{}])[0].get("home_score") if sport_event_status.get("period_scores") else None,
                    "away": sport_event_status.get("period_scores", [{}])[0].get("away_score") if sport_event_status.get("period_scores") else None,
                }
            },
        }
    except Exception as e:
        logger.error(f"Normalize hata: {e}")
        return None


def _normalize_match_for_stats(result: dict, sr_team_id: str) -> dict:
    """get_team_matches için normalize — API-Football formatına uyumlu."""
    ev = result.get("sport_event", {})
    status = result.get("sport_event_status", {})
    competitors = ev.get("competitors", [])
    home = next((c for c in competitors if c.get("qualifier") == "home"), {})
    away = next((c for c in competitors if c.get("qualifier") == "away"), {})
    return {
        "fixture": {"date": ev.get("start_time",""), "id": ev.get("id","")},
        "teams": {
            "home": {"id": home.get("id",""), "name": home.get("name","")},
            "away": {"id": away.get("id",""), "name": away.get("name","")},
        },
        "goals": {
            "home": status.get("home_score"),
            "away": status.get("away_score"),
        },
        "date": ev.get("start_time",""),
    }


def _normalize_h2h(item: dict, sr_team_id: str) -> dict:
    return _normalize_match_for_stats(item, sr_team_id)


def _normalize_stats(data: dict) -> list:
    """Canlı istatistikleri API-Football formatına çevir."""
    result = []
    for team_key in ["home", "away"]:
        stats = data.get("statistics", {}).get(team_key, {})
        if not stats:
            continue
        result.append({
            "team": {"name": team_key},
            "statistics": [
                {"type": "Shots on Goal",    "value": stats.get("shots_on_target", 0)},
                {"type": "Total Shots",       "value": stats.get("shots_total", 0)},
                {"type": "Ball Possession",   "value": f"{stats.get('ball_possession', 0)}%"},
                {"type": "Corner Kicks",      "value": stats.get("corner_kicks", 0)},
                {"type": "Yellow Cards",      "value": stats.get("yellow_cards", 0)},
                {"type": "Red Cards",         "value": stats.get("red_cards", 0)},
                {"type": "Fouls",             "value": stats.get("fouls", 0)},
                {"type": "Offsides",          "value": stats.get("offsides", 0)},
            ]
        })
    return result


def _normalize_events(data: dict) -> list:
    """Maç olayları → API-Football formatına çevir."""
    events = []
    for ev in data.get("timeline", []):
        t = ev.get("type", "")
        if t in ("score_change", "yellow_card", "red_card", "substitution"):
            events.append({
                "time":   {"elapsed": ev.get("time", 0)},
                "type":   _map_event_type(t),
                "detail": ev.get("description", ""),
                "player": {"name": ev.get("player", {}).get("name", "")},
                "team":   {"name": ev.get("competitor", "")},
            })
    return events


def _map_status(status: str, match_status: str) -> str:
    mapping = {
        "not_started": "NS",
        "inprogress":  "1H" if match_status in ("1st_period","2nd_period") else "LIVE",
        "halftime":    "HT",
        "ended":       "FT",
        "closed":      "FT",
        "postponed":   "PST",
        "cancelled":   "CANC",
        "abandoned":   "ABD",
    }
    return mapping.get(status, "NS")


def _map_event_type(t: str) -> str:
    return {"score_change": "Goal", "yellow_card": "Card", "red_card": "Card", "substitution": "subst"}.get(t, t)


def _get_league_id(sr_competition_id: str) -> int:
    for apif_id, sr_id in LEAGUE_MAP.items():
        if sr_id == sr_competition_id:
            return apif_id
    return 0
