from fastapi import APIRouter
from datetime import datetime, timezone, date as _date
from services.football import get_fixtures_by_date, get_live_fixtures, LEAGUES, get_quota
from services.database import load_fixtures, save_fixtures

router = APIRouter(prefix="/fixtures", tags=["fixtures"])

DONE_STATUSES = {"FT", "AET", "PEN", "AWD", "WO"}

def _needs_refresh(cached: list, match_date: str) -> bool:
    """
    DB'deki veriyi yenile:
    - Geçmiş tarih bile olsa NS maç varsa — maç başlamadan cache'lendi, güncelle
    - Bugün/gelecek: bitmemiş maç varsa güncelle
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for f in cached:
        status = f.get("fixture", {}).get("status", {}).get("short", "")
        if match_date < today:
            # Geçmiş gün: NS kalmışsa cache yanlış zamanlanmış — yenile
            if status == "NS":
                return True
        else:
            # Bugün veya gelecek: bitmemiş maç varsa güncelle
            if status not in DONE_STATUSES:
                return True
    return False  # Hepsi bitti veya geçmiş+NS yok — cache yeterli

@router.get("/today")
def today_fixtures(league_id: int = None):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cached = load_fixtures(today, league_id)
    if cached and not _needs_refresh(cached, today):
        return {"date": today, "count": len(cached), "fixtures": _format(cached), "source": "db"}
    fixtures = get_fixtures_by_date(today, league_id)
    if fixtures:
        save_fixtures(today, fixtures)
        return {"date": today, "count": len(fixtures), "fixtures": _format(fixtures)}
    # API boş döndü (kota aşıldı / ağ hatası) — DB cache'e düş
    if cached:
        return {"date": today, "count": len(cached), "fixtures": _format(cached), "source": "db_fallback"}
    return {"date": today, "count": 0, "fixtures": []}

@router.get("/date/{date}")
def fixtures_by_date(date: str, league_id: int = None):
    cached = load_fixtures(date, league_id)
    if cached and not _needs_refresh(cached, date):
        return {"date": date, "count": len(cached), "fixtures": _format(cached), "source": "db"}
    fixtures = get_fixtures_by_date(date, league_id)
    if fixtures:
        save_fixtures(date, fixtures)
        return {"date": date, "count": len(fixtures), "fixtures": _format(fixtures)}
    # API boş döndü (kota aşıldı / ağ hatası) — DB cache'e düş
    if cached:
        return {"date": date, "count": len(cached), "fixtures": _format(cached), "source": "db_fallback"}
    return {"date": date, "count": 0, "fixtures": []}

@router.get("/live")
def live_fixtures(league_id: int = None):
    fixtures = get_live_fixtures(league_id)
    return {"count": len(fixtures), "fixtures": _format(fixtures)}

@router.get("/leagues")
def leagues():
    return [{"name": k, "id": v} for k, v in LEAGUES.items()]

@router.get("/quota")
def quota():
    return get_quota()

def _format(fixtures: list) -> list:
    out = []
    for f in fixtures:
        fix    = f.get("fixture", {})
        teams  = f.get("teams",   {})
        goals  = f.get("goals",   {})
        score  = f.get("score",   {})
        league = f.get("league",  {})
        status = fix.get("status", {})
        venue  = fix.get("venue",  {})
        referee = fix.get("referee", "")
        ht_home = score.get("halftime", {}).get("home")
        ht_away = score.get("halftime", {}).get("away")
        out.append({
            "id":          fix.get("id"),
            "date":        fix.get("date", "")[:16],
            "status":      status.get("short", ""),
            "elapsed":     status.get("elapsed"),
            "league_id":   league.get("id"),
            "league_name": league.get("name", ""),
            "league_logo": league.get("logo", ""),
            "league_flag": league.get("flag", ""),
            "season":      league.get("season"),
            "round":       league.get("round", ""),
            "venue":       venue.get("name", ""),
            "venue_city":  venue.get("city", ""),
            "referee":     referee or "",
            "halftime": {
                "home": ht_home,
                "away": ht_away,
            } if ht_home is not None else None,
            "home": {
                "id":     teams.get("home", {}).get("id"),
                "name":   teams.get("home", {}).get("name", ""),
                "logo":   teams.get("home", {}).get("logo", ""),
                "goals":  goals.get("home"),
                "winner": teams.get("home", {}).get("winner"),
            },
            "away": {
                "id":     teams.get("away", {}).get("id"),
                "name":   teams.get("away", {}).get("name", ""),
                "logo":   teams.get("away", {}).get("logo", ""),
                "goals":  goals.get("away"),
                "winner": teams.get("away", {}).get("winner"),
            },
        })
    return out
