from fastapi import APIRouter, Query
from services.football import get_fixtures_by_date, get_live_fixtures, LEAGUES, get_quota

router = APIRouter(prefix="/fixtures", tags=["fixtures"])

@router.get("/today")
def today_fixtures(league_id: int = None):
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fixtures = get_fixtures_by_date(today, league_id)
    return {"date": today, "count": len(fixtures), "fixtures": _format(fixtures)}

@router.get("/date/{date}")
def fixtures_by_date(date: str, league_id: int = None):
    fixtures = get_fixtures_by_date(date, league_id)
    return {"date": date, "count": len(fixtures), "fixtures": _format(fixtures)}

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
        league = f.get("league",  {})
        status = fix.get("status", {})
        out.append({
            "id":          fix.get("id"),
            "date":        fix.get("date", "")[:16],
            "status":      status.get("short", ""),
            "elapsed":     status.get("elapsed"),
            "league_id":   league.get("id"),
            "league_name": league.get("name", ""),
            "season":      league.get("season"),
            "home": {
                "id":   teams.get("home", {}).get("id"),
                "name": teams.get("home", {}).get("name", ""),
                "logo": teams.get("home", {}).get("logo", ""),
                "goals": goals.get("home"),
            },
            "away": {
                "id":   teams.get("away", {}).get("id"),
                "name": teams.get("away", {}).get("name", ""),
                "logo": teams.get("away", {}).get("logo", ""),
                "goals": goals.get("away"),
            },
        })
    return out
