"""
Tek maç için tam analiz pipeline'ı.
API çağrıları → İstatistiksel analiz → Claude AI → Sonuç
"""
import logging
from datetime import datetime, timezone

from config import DEFAULT_SEASON
from data.apis.football_api import FootballAPI
from analysis.statistical.match_analyzer import analyze_match
from analysis.ai.claude_analyzer import ClaudeAnalyzer

logger = logging.getLogger(__name__)


def _summarize_recent(matches: list, team_id: int, team_name: str, n: int = 5) -> str:
    """Son maçları kısa metin olarak özetler (Claude'a göndermek için)."""
    lines = []
    for m in matches[-n:]:
        teams  = m.get("teams", {})
        goals  = m.get("goals", {})
        date   = m.get("fixture", {}).get("date", "")[:10]
        h_name = teams.get("home", {}).get("name", "?")
        a_name = teams.get("away", {}).get("name", "?")
        g_h    = goals.get("home", 0) or 0
        g_a    = goals.get("away", 0) or 0
        h_id   = teams.get("home", {}).get("id")
        score  = f"{g_h}-{g_a}"
        result = "G" if (h_id == team_id and g_h > g_a) or (h_id != team_id and g_a > g_h) else \
                 "B" if g_h == g_a else "M"
        lines.append(f"  {date}: {h_name} {score} {a_name} ({result})")
    return "\n".join(lines) if lines else "  Veri yok"


def _summarize_h2h(h2h: list, home_name: str) -> str:
    lines = []
    for m in h2h[-5:]:
        teams  = m.get("teams", {})
        goals  = m.get("goals", {})
        date   = m.get("fixture", {}).get("date", "")[:10]
        h_name = teams.get("home", {}).get("name", "?")
        a_name = teams.get("away", {}).get("name", "?")
        g_h    = goals.get("home", 0) or 0
        g_a    = goals.get("away", 0) or 0
        lines.append(f"  {date}: {h_name} {g_h}-{g_a} {a_name}")
    return "\n".join(lines) if lines else "  H2H verisi yok"


class MatchPipeline:
    def __init__(self, api: FootballAPI, ai: ClaudeAnalyzer, season: int = DEFAULT_SEASON):
        self.api    = api
        self.ai     = ai
        self.season = season

    def analyze_fixture(self, fixture: dict, league_id: int, fallback_season: int = 2024) -> dict:
        """
        Tek bir maç fixture'ını tam olarak analiz eder.
        fixture: API-Football fixtures endpoint'inden gelen tek maç objesi.
        """
        fid     = fixture.get("fixture", {}).get("id")
        teams   = fixture.get("teams", {})
        home    = teams.get("home", {})
        away    = teams.get("away", {})
        home_id = home.get("id")
        away_id = away.get("id")
        home_nm = home.get("name", "?")
        away_nm = away.get("name", "?")
        league_nm = fixture.get("league", {}).get("name", "")

        logger.info(f"Analiz başlıyor: {home_nm} vs {away_nm} (ID:{fid})")

        # Historik veri: önce fixture'ın sezonunu dene, yoksa fallback_season kullan
        fix_season = fixture.get("league", {}).get("season", self.season)
        use_season = fix_season if fix_season <= 2024 else fallback_season

        home_recent = self.api.get_team_last_matches(home_id, league_id, use_season, last=10)
        away_recent = self.api.get_team_last_matches(away_id, league_id, use_season, last=10)
        h2h_matches = self.api.get_h2h(home_id, away_id, last=10)

        # İstatistiksel analiz
        stat_result = analyze_match(
            home_recent, away_recent, h2h_matches,
            home_id, away_id,
        )

        # Özetler (Claude için)
        home_summary = _summarize_recent(home_recent, home_id, home_nm)
        away_summary = _summarize_recent(away_recent, away_id, away_nm)
        h2h_summary  = _summarize_h2h(h2h_matches, home_nm)

        # Claude AI analizi
        ai_result = self.ai.analyze(
            home_nm, away_nm, stat_result,
            home_summary, away_summary, h2h_summary, league_nm
        )

        return {
            "fixture": {
                "id":        fid,
                "home_team": home_nm,
                "away_team": away_nm,
                "home_id":   home_id,
                "away_id":   away_id,
                "date":      fixture.get("fixture", {}).get("date", ""),
                "league":    league_nm,
                "status":    fixture.get("fixture", {}).get("status", {}).get("short", ""),
            },
            "statistical": stat_result,
            "ai_analysis": ai_result,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

    def analyze_daily(self, fixtures: list, league_id: int) -> list[dict]:
        """Günün tüm maçlarını analiz eder."""
        results = []
        for i, fix in enumerate(fixtures):
            try:
                result = self.analyze_fixture(fix, league_id)
                results.append(result)
                logger.info(f"  [{i+1}/{len(fixtures)}] {result['fixture']['home_team']} vs {result['fixture']['away_team']} tamamlandı")
            except Exception as e:
                logger.error(f"Maç analiz hatası [{i}]: {e}")
        return results
