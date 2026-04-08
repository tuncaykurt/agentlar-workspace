"""
Odds servisi — api.odds-api.io v3
Gerçek bahis oranlarını çeker, implied probability ve EV hesaplar.
"""
import json, os, logging, requests
import redis as _redis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

API_KEY  = os.getenv("ODDS_API_KEY", "")
BASE_URL = "https://api.odds-api.io/v3"

# Redis cache (football.py ile aynı instance, db=3)
try:
    _r = _redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=os.getenv("REDIS_PASSWORD") or None,
        db=3, decode_responses=True, socket_timeout=3,
    )
    _r.ping()
    REDIS_OK = True
except Exception:
    REDIS_OK = False
    _r = None

# Desteklenen ligler — odds-api.io lig ID'leri (API-Football'dan farklı)
LEAGUE_MAP = {
    39:  "soccer_epl",              # Premier League
    140: "soccer_spain_la_liga",
    135: "soccer_italy_serie_a",
    78:  "soccer_germany_bundesliga",
    61:  "soccer_france_ligue_one",
    2:   "soccer_uefa_champs_league",
    3:   "soccer_uefa_europa_league",
    203: "soccer_turkey_super_league",
}

BOOKMAKERS = ["bet365", "pinnacle", "1xbet", "betway"]


def _cache_get(key: str):
    if REDIS_OK:
        v = _r.get(f"odds:{key}")
        return json.loads(v) if v else None
    return None

def _cache_set(key: str, val, ttl: int = 900):
    if REDIS_OK:
        _r.set(f"odds:{key}", json.dumps(val), ex=ttl)


def _implied_prob(decimal_odds: float) -> float:
    """Decimal oran → implied olasılık (overround temizlenmemiş)."""
    if decimal_odds <= 1.0:
        return 1.0
    return round(1.0 / decimal_odds, 4)


def _remove_overround(probs: list[float]) -> list[float]:
    """Bookmaker marjını çıkar, olasılıkları normalize et."""
    total = sum(probs)
    if total <= 0:
        return probs
    return [round(p / total, 4) for p in probs]


def _ev(our_prob: float, decimal_odds: float) -> float:
    """
    Beklenen değer (Expected Value).
    EV > 0 → value bet (oranlar olasılığımızın altında).
    EV < 0 → kaçın.
    """
    return round(our_prob * decimal_odds - 1.0, 4)


def get_fixture_odds(home_name: str, away_name: str, league_id: int, date: str) -> dict:
    """
    Maç için 1X2 oranlarını çeker ve EV hesabı döndürür.
    Önce Redis cache'e bakar.
    """
    sport = LEAGUE_MAP.get(league_id)
    if not sport:
        return {"available": False, "reason": "Lig desteklenmiyor"}

    cache_key = f"{home_name}:{away_name}:{date}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    # Her bookmaker'ı sırayla dene (free plan: 1 at a time)
    for bm in BOOKMAKERS:
        try:
            resp = requests.get(
                f"{BASE_URL}/odds",
                params={
                    "token":      API_KEY,
                    "sport":      sport,
                    "bookmaker":  bm,
                    "market":     "1x2",
                    "date_from":  date,
                    "date_to":    date,
                },
                timeout=10,
            )
            data = resp.json()
            events = data.get("data", [])

            # İsme göre maçı bul (kısmi eşleşme)
            home_lower = home_name.lower()
            away_lower = away_name.lower()
            for ev in events:
                h = ev.get("home_team", "").lower()
                a = ev.get("away_team", "").lower()
                if _name_match(home_lower, h) and _name_match(away_lower, a):
                    markets = ev.get("markets", {})
                    m1x2 = markets.get("1x2", {})
                    odds_home = float(m1x2.get("1", 0) or 0)
                    odds_draw = float(m1x2.get("x", 0) or m1x2.get("X", 0) or 0)
                    odds_away = float(m1x2.get("2", 0) or 0)

                    if not all([odds_home, odds_draw, odds_away]):
                        continue

                    raw_probs = [
                        _implied_prob(odds_home),
                        _implied_prob(odds_draw),
                        _implied_prob(odds_away),
                    ]
                    fair_probs = _remove_overround(raw_probs)
                    result = {
                        "available":   True,
                        "bookmaker":   bm,
                        "odds": {
                            "home": odds_home,
                            "draw": odds_draw,
                            "away": odds_away,
                        },
                        "implied_probs": {
                            "home": fair_probs[0],
                            "draw": fair_probs[1],
                            "away": fair_probs[2],
                        },
                        "overround": round(sum(raw_probs) - 1.0, 4),
                    }
                    _cache_set(cache_key, result, ttl=900)
                    return result

        except Exception as e:
            logger.warning(f"Odds API hatası [{bm}]: {e}")
            continue

    result = {"available": False, "reason": "Oran bulunamadı"}
    _cache_set(cache_key, result, ttl=300)
    return result


def calculate_ev(our_probs: dict, odds_data: dict) -> dict:
    """
    Kendi olasılıklarımız ile bookmaker oranlarını karşılaştır.
    Her bahis tipi için EV döndür. Pozitif EV = value bet.
    """
    if not odds_data.get("available"):
        return {}

    odds = odds_data.get("odds", {})
    ev_map = {}

    mapping = {
        "home_win": ("home", odds.get("home", 0)),
        "draw":     ("draw", odds.get("draw", 0)),
        "away_win": ("away", odds.get("away", 0)),
    }
    for key, (_, decimal) in mapping.items():
        our_p = our_probs.get(key, 0)
        if decimal > 1.0 and our_p > 0:
            ev_val = _ev(our_p, decimal)
            ev_map[key] = {
                "ev":      ev_val,
                "value":   ev_val > 0.05,   # +5% EV → value bet
                "odds":    decimal,
                "our_prob": our_p,
            }

    return ev_map


def _name_match(query: str, candidate: str) -> bool:
    """Takım ismi kısmi eşleşme — kısa kelimeler yeterli."""
    q_words = [w for w in query.split() if len(w) > 3]
    if not q_words:
        return query in candidate
    return any(w in candidate for w in q_words)
