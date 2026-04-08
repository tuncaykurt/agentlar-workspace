"""
Futbol veri servisi + istatistiksel analiz motoru.
DATA_PROVIDER=sportradar → SportRadar kullanır
DATA_PROVIDER=apifootball (varsayılan) → API-Football kullanır
"""
import json, math, logging, os
from typing import Optional
import requests
import redis as _redis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ── Provider seçimi ──────────────────────────────────────────────────────── #
_PROVIDER = os.getenv("DATA_PROVIDER", "apifootball").lower()

if _PROVIDER == "sportradar":
    from services.providers.sportradar import (
        get_fixtures_by_date as _get_fixtures_by_date,
        get_live_fixtures    as _get_live_fixtures,
        get_team_matches     as _get_team_matches,
        get_h2h              as _get_h2h,
        get_fixture_stats    as _get_fixture_stats,
        get_fixture_events   as _get_fixture_events,
        get_team_standing    as _get_team_standing,
        get_team_injuries    as _get_team_injuries,
        get_quota            as _get_quota,
    )
    logger.info("Provider: SportRadar")
else:
    _get_fixtures_by_date = None  # aşağıda tanımlanıyor
    logger.info("Provider: API-Football")

API_KEY  = os.getenv("FOOTBALL_API_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"
HEADERS  = {"x-apisports-key": API_KEY}

# Redis cache
try:
    _r = _redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=os.getenv("REDIS_PASSWORD") or None,
        db=2, decode_responses=True, socket_timeout=3,
    )
    _r.ping()
    REDIS_OK = True
except Exception:
    REDIS_OK = False
    _r = None

LEAGUES = {
    "Süper Lig":        203,
    "Premier League":   39,
    "La Liga":          140,
    "Serie A":          135,
    "Bundesliga":       78,
    "Ligue 1":          61,
    "Champions League": 2,
    "Europa League":    3,
}

# ── Cache ────────────────────────────────────────────────────────────────── #

def _cache_get(key: str) -> Optional[str]:
    if REDIS_OK:
        return _r.get(f"fb:{key}")
    return None

def _cache_set(key: str, val: str, ttl: int = 3600):
    if REDIS_OK:
        _r.set(f"fb:{key}", val, ex=ttl)

def _api(endpoint: str, params: dict, ttl: int = 3600) -> dict:
    ck = f"{endpoint}:{json.dumps(params,sort_keys=True)}"
    cached = _cache_get(ck)
    if cached:
        return json.loads(cached)
    try:
        r = requests.get(f"{BASE_URL}/{endpoint}", headers=HEADERS, params=params, timeout=15)
        d = r.json()
        if not d.get("errors"):
            _cache_set(ck, json.dumps(d), ttl)
        return d
    except Exception as e:
        logger.error(f"API hata [{endpoint}]: {e}")
        return {"response": [], "errors": [str(e)]}

# ── Veri çekme ───────────────────────────────────────────────────────────── #

def get_fixtures_by_date(date: str, league_id: int = None) -> list:
    if _PROVIDER == "sportradar":
        return _get_fixtures_by_date(date, league_id)
    params = {"date": date}
    if league_id:
        params["league"] = league_id
    return _api("fixtures", params, ttl=1800).get("response", [])

def get_live_fixtures(league_id: int = None) -> list:
    if _PROVIDER == "sportradar":
        return _get_live_fixtures(league_id)
    params = {"live": "all"}
    if league_id:
        params["league"] = league_id
    return _api("fixtures", params, ttl=60).get("response", [])

def get_team_matches(team_id: int, league_id: int, season: int = 2024) -> list:
    if _PROVIDER == "sportradar":
        return _get_team_matches(team_id, league_id, season)
    data = _api("fixtures", {"team": team_id, "league": league_id, "season": season}, ttl=7200)
    matches = data.get("response", [])
    matches.sort(key=lambda m: m.get("fixture", {}).get("date", ""))
    return matches[-10:]

def get_h2h(team1: int, team2: int) -> list:
    if _PROVIDER == "sportradar":
        return _get_h2h(team1, team2)
    return _api("fixtures/headtohead", {"h2h": f"{team1}-{team2}", "last": 8}, ttl=86400).get("response", [])

def get_fixture_stats(fixture_id: int) -> list:
    if _PROVIDER == "sportradar":
        return _get_fixture_stats(fixture_id)
    return _api("fixtures/statistics", {"fixture": fixture_id}, ttl=300).get("response", [])

def get_fixture_events(fixture_id: int) -> list:
    if _PROVIDER == "sportradar":
        return _get_fixture_events(fixture_id)
    return _api("fixtures/events", {"fixture": fixture_id}, ttl=60).get("response", [])

def get_quota() -> dict:
    if _PROVIDER == "sportradar":
        return _get_quota()
    return _api("status", {}, ttl=60).get("response", {}).get("requests", {})

def get_standings(league_id: int, season: int = 2024) -> list:
    d = _api("standings", {"league": league_id, "season": season}, ttl=3600)
    r = d.get("response", [])
    if r:
        return r[0].get("league", {}).get("standings", [[]])[0]
    return []

def get_team_standing(team_id: int, league_id: int, season: int = 2024) -> dict:
    """Takımın lig tablosundaki sırasını ve istatistiklerini döndürür."""
    if _PROVIDER == "sportradar":
        return _get_team_standing(team_id, league_id, season)
    standings = get_standings(league_id, season)
    for entry in standings:
        if entry.get("team", {}).get("id") == team_id:
            return {
                "rank":           entry.get("rank", 0),
                "points":         entry.get("points", 0),
                "played":         entry.get("all", {}).get("played", 0),
                "won":            entry.get("all", {}).get("win", 0),
                "drawn":          entry.get("all", {}).get("draw", 0),
                "lost":           entry.get("all", {}).get("lose", 0),
                "goals_for":      entry.get("all", {}).get("goals", {}).get("for", 0),
                "goals_against":  entry.get("all", {}).get("goals", {}).get("against", 0),
                "goal_diff":      entry.get("goalsDiff", 0),
                "form":           entry.get("form", ""),        # "WWDLW" gibi
                "description":    entry.get("description", ""), # "Şampiyon", "Düşme" vb.
                "total_teams":    len(standings),
            }
    return {}

def get_team_injuries(team_id: int, league_id: int, season: int = 2024) -> list:
    """Takımın mevcut sakatlarını döndürür."""
    if _PROVIDER == "sportradar":
        return _get_team_injuries(team_id, league_id, season)
    data = _api("injuries", {"team": team_id, "league": league_id, "season": season}, ttl=3600)
    injuries = data.get("response", [])
    result = []
    for inj in injuries:
        player = inj.get("player", {})
        result.append({
            "name":   player.get("name", ""),
            "type":   inj.get("injury", {}).get("type", ""),
            "reason": inj.get("injury", {}).get("reason", ""),
        })
    return result

# ── İstatistiksel analiz ─────────────────────────────────────────────────── #

def _poisson(lam: float, k: int) -> float:
    if lam <= 0: return 1.0 if k == 0 else 0.0
    return (lam**k) * math.exp(-lam) / math.factorial(k)

def _poisson_matrix(lh: float, la: float, n: int = 8) -> list:
    return [[_poisson(lh, i) * _poisson(la, j) for j in range(n+1)] for i in range(n+1)]

def _probs(matrix: list) -> dict:
    hw = dr = aw = btts = o15 = o25 = o35 = 0.0
    for i, row in enumerate(matrix):
        for j, p in enumerate(row):
            t = i + j
            if i > j:   hw   += p
            elif i == j: dr   += p
            else:        aw   += p
            if i > 0 and j > 0: btts += p
            if t > 1: o15 += p
            if t > 2: o25 += p
            if t > 3: o35 += p
    return {
        "home_win":   round(hw, 4),
        "draw":       round(dr, 4),
        "away_win":   round(aw, 4),
        "btts":       round(btts, 4),
        "over_1_5":   round(o15, 4),
        "over_2_5":   round(o25, 4),
        "over_3_5":   round(o35, 4),
        "under_2_5":  round(1-o25, 4),
        "double_1x":  round(hw+dr, 4),
        "double_x2":  round(dr+aw, 4),
        "double_12":  round(hw+aw, 4),
    }

def _team_avgs(matches: list, team_id: int) -> dict:
    scored = conceded = total = 0
    for m in matches:
        g = m.get("goals", {})
        is_home = m.get("teams", {}).get("home", {}).get("id") == team_id
        gf = (g.get("home") or 0) if is_home else (g.get("away") or 0)
        ga = (g.get("away") or 0) if is_home else (g.get("home") or 0)
        scored += gf; conceded += ga; total += 1
    if total == 0:
        return {"scored": 1.3, "conceded": 1.1, "total": 0}
    return {"scored": round(scored/total, 3), "conceded": round(conceded/total, 3), "total": total}

def _form(matches: list, team_id: int) -> float:
    pts = []
    for m in matches[-6:]:
        g = m.get("goals", {})
        is_home = m.get("teams", {}).get("home", {}).get("id") == team_id
        gf = (g.get("home") or 0) if is_home else (g.get("away") or 0)
        ga = (g.get("away") or 0) if is_home else (g.get("home") or 0)
        pts.append(1.0 if gf > ga else 0.4 if gf == ga else 0.0)
    if not pts: return 0.5
    w = [0.5**(len(pts)-1-i) for i in range(len(pts))]
    return round(sum(p*wt for p,wt in zip(pts,w)) / sum(w), 3)

def _motivation_factor(standing: dict, total_teams: int) -> float:
    """
    Puan tablosu konumuna göre motivasyon çarpanı (0.85 - 1.15).
    Şampiyonluk yarışı veya düşme hattı → yüksek motivasyon.
    Orta sıra → nötr.
    """
    if not standing:
        return 1.0
    rank = standing.get("rank", 0)
    desc = standing.get("description", "").lower()
    total = standing.get("total_teams", total_teams) or 20

    # Açıklamaya göre hızlı karar
    if any(k in desc for k in ["şampiyon", "champions", "title"]):
        return 1.12
    if any(k in desc for k in ["düşme", "relegation", "playoff"]):
        return 1.10
    if any(k in desc for k in ["europe", "avrupa", "champions league"]):
        return 1.08

    # Sıraya göre
    ratio = rank / total
    if ratio <= 0.15:   return 1.10   # İlk %15 — şampiyonluk yarışı
    if ratio >= 0.85:   return 1.08   # Son %15 — düşme hattı
    if ratio <= 0.30:   return 1.04   # Avrupa yarışı
    return 1.0                        # Orta sıra

def _injury_factor(injuries: list) -> float:
    """Her sakatlık için xG'yi küçük oranda düşür (maks %20)."""
    count = len(injuries)
    return max(0.80, 1.0 - count * 0.04)

def statistical_analysis(home_id: int, away_id: int, league_id: int) -> dict:
    season = 2024
    home_m = get_team_matches(home_id, league_id, season)
    away_m = get_team_matches(away_id, league_id, season)
    h2h_m  = get_h2h(home_id, away_id)

    ha = _team_avgs(home_m, home_id)
    aa = _team_avgs(away_m, away_id)
    hf = _form(home_m, home_id)
    af = _form(away_m, away_id)

    # ── Standings ──────────────────────────────────────────────────────────── #
    home_st = get_team_standing(home_id, league_id, season)
    away_st = get_team_standing(away_id, league_id, season)
    total_teams = home_st.get("total_teams") or away_st.get("total_teams") or 20
    home_motiv = _motivation_factor(home_st, total_teams)
    away_motiv = _motivation_factor(away_st, total_teams)

    # ── Injuries ───────────────────────────────────────────────────────────── #
    home_inj = get_team_injuries(home_id, league_id, season)
    away_inj = get_team_injuries(away_id, league_id, season)
    home_inj_factor = _injury_factor(home_inj)
    away_inj_factor = _injury_factor(away_inj)

    # ── xG hesabı (form + motivasyon + sakatlık) ───────────────────────────── #
    ff_home = 0.7 + (hf - 0.5) * 0.4
    ff_away = 0.7 + (af - 0.5) * 0.4
    lh = max(0.4, ha["scored"] * aa["conceded"] * ff_home * 1.08 * home_motiv * home_inj_factor)
    la = max(0.4, aa["scored"] * ha["conceded"] * ff_away * away_motiv * away_inj_factor)

    # ── H2H ───────────────────────────────────────────────────────────────── #
    h2h_wins = h2h_draws = h2h_away = h2h_goals = 0
    for m in h2h_m:
        g = m.get("goals", {})
        gh, ga = g.get("home") or 0, g.get("away") or 0
        hid = m.get("teams", {}).get("home", {}).get("id")
        if hid == home_id:
            if gh > ga: h2h_wins += 1
            elif gh == ga: h2h_draws += 1
            else: h2h_away += 1
        else:
            if ga > gh: h2h_wins += 1
            elif ga == gh: h2h_draws += 1
            else: h2h_away += 1
        h2h_goals += gh + ga
    h2h_total = len(h2h_m)

    matrix = _poisson_matrix(lh, la)
    probs  = _probs(matrix)

    confidence = min(1.0, (
        min(ha["total"], 8) / 8 * 0.4 +
        min(aa["total"], 8) / 8 * 0.4 +
        min(h2h_total, 5)   / 5 * 0.2
    ))

    return {
        "probabilities": probs,
        "expected_goals": {"home": round(lh, 2), "away": round(la, 2), "total": round(lh+la, 2)},
        "form": {"home": hf, "away": af},
        "averages": {"home": ha, "away": aa},
        "h2h": {
            "total": h2h_total,
            "home_wins": h2h_wins,
            "draws": h2h_draws,
            "away_wins": h2h_away,
            "avg_goals": round(h2h_goals / h2h_total, 2) if h2h_total else 2.4,
        },
        "standings": {
            "home": home_st,
            "away": away_st,
        },
        "injuries": {
            "home": home_inj,
            "away": away_inj,
            "home_count": len(home_inj),
            "away_count": len(away_inj),
        },
        "adjustments": {
            "home_motivation": round(home_motiv, 3),
            "away_motivation": round(away_motiv, 3),
            "home_injury_factor": round(home_inj_factor, 3),
            "away_injury_factor": round(away_inj_factor, 3),
        },
        "confidence": round(confidence, 3),
        "data_matches": {"home": ha["total"], "away": aa["total"], "h2h": h2h_total},
    }

def build_ai_prompt(home: str, away: str, league: str, stat: dict, odds_data: dict = None, ev_data: dict = None) -> str:
    p   = stat["probabilities"]
    xg  = stat["expected_goals"]
    f   = stat["form"]
    h   = stat["h2h"]
    adj = stat.get("adjustments", {})
    st  = stat.get("standings", {})
    inj = stat.get("injuries", {})

    home_st = st.get("home", {})
    away_st = st.get("away", {})
    home_inj_count = inj.get("home_count", 0)
    away_inj_count = inj.get("away_count", 0)

    # Standings satırı
    def _st_line(s: dict, name: str) -> str:
        if not s:
            return f"{name}: Puan tablosu verisi yok"
        return (f"{name}: {s.get('rank','-')}. sıra, "
                f"{s.get('points',0)} puan, "
                f"AG={s.get('goal_diff',0):+d}, "
                f"Form={s.get('form','')[-5:] if s.get('form') else '-'}"
                + (f" [{s.get('description','')}]" if s.get("description") else ""))

    # Odds satırı
    odds_section = ""
    if odds_data and odds_data.get("available"):
        o = odds_data["odds"]
        ip = odds_data["implied_probs"]
        odds_section = f"""
Bahis Oranları ({odds_data.get('bookmaker','?')}):
  1 (Ev): {o.get('home','-')}  →  implied %{ip.get('home',0)*100:.1f}
  X (Ber): {o.get('draw','-')}  →  implied %{ip.get('draw',0)*100:.1f}
  2 (Dep): {o.get('away','-')}  →  implied %{ip.get('away',0)*100:.1f}
  Overround: %{odds_data.get('overround',0)*100:.1f}"""

    ev_section = ""
    if ev_data:
        value_bets = [k for k, v in ev_data.items() if v.get("value")]
        if value_bets:
            ev_lines = []
            for k, v in ev_data.items():
                label = {"home_win":"Ev","draw":"Ber","away_win":"Dep"}.get(k, k)
                sign = "✓ VALUE" if v.get("value") else ""
                ev_lines.append(f"  {label}: EV={v['ev']:+.2f} {sign}")
            ev_section = "\nBeklenen Değer (EV):\n" + "\n".join(ev_lines)

    # Sakatlık satırı
    inj_lines = []
    for inj_player in inj.get("home", [])[:5]:
        inj_lines.append(f"  {home}: {inj_player.get('name','')} ({inj_player.get('type','')})")
    for inj_player in inj.get("away", [])[:5]:
        inj_lines.append(f"  {away}: {inj_player.get('name','')} ({inj_player.get('type','')})")
    inj_section = ("\nSakatlıklar:\n" + "\n".join(inj_lines)) if inj_lines else f"\nSakatlık: Ev={home_inj_count}, Dep={away_inj_count}"

    return f"""
Maç: {home} vs {away} | Lig: {league}

xG (Beklenen Gol — düzeltilmiş): Ev={xg['home']}  Dep={xg['away']}  Toplam={xg['total']}
Form (0-1): {home}={f['home']}  {away}={f['away']}
Motivasyon çarpanı: Ev={adj.get('home_motivation',1.0)}  Dep={adj.get('away_motivation',1.0)}
Sakatlık çarpanı:   Ev={adj.get('home_injury_factor',1.0)}  Dep={adj.get('away_injury_factor',1.0)}

Puan Tablosu:
  {_st_line(home_st, home)}
  {_st_line(away_st, away)}
{inj_section}

Poisson Olasılıkları:
  1 (Ev kazanır):     %{p['home_win']*100:.1f}
  X (Beraberlik):     %{p['draw']*100:.1f}
  2 (Dep kazanır):    %{p['away_win']*100:.1f}
  BTTS (Karş.gol):   %{p['btts']*100:.1f}
  Üst 1.5:           %{p['over_1_5']*100:.1f}
  Üst 2.5:           %{p['over_2_5']*100:.1f}
  Üst 3.5:           %{p['over_3_5']*100:.1f}
  Çifte Şans 1X:     %{p['double_1x']*100:.1f}
  Çifte Şans X2:     %{p['double_x2']*100:.1f}

H2H ({h['total']} maç): Ev {h['home_wins']}G / {h['draws']}B / {h['away_wins']}M  Ort.gol={h['avg_goals']}
{odds_section}{ev_section}
Veri kalitesi: {stat['confidence']} (0=düşük, 1=yüksek)
"""
