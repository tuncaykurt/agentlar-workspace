from datetime import date as _date
from fastapi import APIRouter
from pydantic import BaseModel
from services.football import statistical_analysis, build_ai_prompt, get_fixture_stats, get_fixture_events
from services.openrouter import analyze_match, get_available_models
from services.odds import get_fixture_odds, calculate_ev
from services.database import load_analysis, save_analysis

router = APIRouter(prefix="/analysis", tags=["analysis"])

class AnalyzeRequest(BaseModel):
    fixture_id: int
    home_id: int
    away_id: int
    home_name: str
    away_name: str
    league_id: int
    league_name: str = ""
    match_date: str = ""   # "YYYY-MM-DD", boş ise bugün
    model: str = None

@router.post("/match")
def analyze(req: AnalyzeRequest):
    match_date = req.match_date or str(_date.today())
    model_key = req.model or "default"

    # 0. DB cache kontrolü — aynı maç+model 12 saat içinde analiz edildiyse döndür
    cached = load_analysis(req.fixture_id, model_key)
    if cached:
        return cached

    # 1. İstatistiksel analiz (standings + injury dahil)
    stat = statistical_analysis(req.home_id, req.away_id, req.league_id)

    # 2. Odds + EV
    odds_data = get_fixture_odds(req.home_name, req.away_name, req.league_id, match_date)
    ev_data   = calculate_ev(stat["probabilities"], odds_data)

    # 3. AI prompt oluştur
    prompt = build_ai_prompt(req.home_name, req.away_name, req.league_name, stat, odds_data, ev_data)

    # 4. OpenRouter AI analizi
    ai = analyze_match(prompt, req.model)

    # 5. DB'ye kaydet
    save_analysis(
        fixture_id=req.fixture_id,
        home=req.home_name,
        away=req.away_name,
        league=req.league_name,
        model=model_key,
        statistical=stat,
        ai_result=ai,
        odds=odds_data,
        ev=ev_data,
    )

    return {
        "fixture_id":  req.fixture_id,
        "home":        req.home_name,
        "away":        req.away_name,
        "league":      req.league_name,
        "statistical": stat,
        "odds":        odds_data,
        "ev":          ev_data,
        "ai":          ai,
    }

@router.get("/models")
def models():
    return get_available_models()

@router.get("/live-stats/{fixture_id}")
def live_stats(fixture_id: int):
    stats  = get_fixture_stats(fixture_id)
    events = get_fixture_events(fixture_id)
    return {"stats": stats, "events": events}
