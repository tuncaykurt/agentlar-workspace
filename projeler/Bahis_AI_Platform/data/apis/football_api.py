"""
API-Football v3 istemcisi.
Tüm veri çekme işlemleri buradan geçer.
Redis cache ile günlük 100 istek limitini korur.
"""
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests

from config import FOOTBALL_API_BASE, FOOTBALL_HEADERS

logger = logging.getLogger(__name__)


class FootballAPI:
    def __init__(self, cache=None):
        self._cache = cache  # RedisCache instance (opsiyonel)
        self._session = requests.Session()
        self._session.headers.update(FOOTBALL_HEADERS)

    def _get(self, endpoint: str, params: dict = None, cache_ttl: int = 3600) -> dict:
        """
        API çağrısı yapar. Cache varsa önce oraya bakar.
        cache_ttl: saniye cinsinden (canlı veri için düşük, geçmiş için yüksek)
        """
        params = params or {}
        cache_key = f"football:{endpoint}:{json.dumps(params, sort_keys=True)}"

        # Cache kontrolü
        if self._cache:
            cached = self._cache.get(cache_key)
            if cached:
                return json.loads(cached)

        url = f"{FOOTBALL_API_BASE}/{endpoint}"
        try:
            r = self._session.get(url, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()

            if self._cache and data.get("response") is not None:
                self._cache.set(cache_key, json.dumps(data), ttl=cache_ttl)

            remaining = r.headers.get("x-ratelimit-requests-remaining", "?")
            logger.debug(f"API {endpoint} → {len(data.get('response', []))} sonuç | kalan: {remaining}")
            return data
        except Exception as e:
            logger.error(f"API hatası [{endpoint}]: {e}")
            return {"response": [], "errors": [str(e)]}

    # ─────────────────────────────────────────────
    #  FIKSTÜR / MAÇLAR
    # ─────────────────────────────────────────────

    def get_fixtures_by_date(self, date: str, league_id: int = None, season: int = None) -> list:
        """Belirli tarihteki maçları getirir. date='YYYY-MM-DD'"""
        params = {"date": date}
        if league_id: params["league"] = league_id
        if season:    params["season"] = season
        data = self._get("fixtures", params, cache_ttl=1800)
        return data.get("response", [])

    def get_today_fixtures(self, league_id: int = None) -> list:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self.get_fixtures_by_date(today, league_id)

    def get_live_fixtures(self, league_id: int = None) -> list:
        params = {"live": "all"}
        if league_id: params["league"] = league_id
        data = self._get("fixtures", params, cache_ttl=60)  # 1 dk cache
        return data.get("response", [])

    def get_fixture_by_id(self, fixture_id: int) -> Optional[dict]:
        data = self._get("fixtures", {"id": fixture_id}, cache_ttl=300)
        resp = data.get("response", [])
        return resp[0] if resp else None

    # ─────────────────────────────────────────────
    #  TAKIM İSTATİSTİKLERİ
    # ─────────────────────────────────────────────

    def get_team_stats(self, team_id: int, league_id: int, season: int) -> dict:
        """Takımın sezon istatistiklerini getirir."""
        data = self._get(
            "teams/statistics",
            {"team": team_id, "league": league_id, "season": season},
            cache_ttl=86400,  # 24 saat
        )
        return data.get("response", {})

    def get_team_last_matches(self, team_id: int, league_id: int, season: int, last: int = 10) -> list:
        """Takımın sezon maçlarını getirir (free plan: last parametresi yok, tümünü al)."""
        data = self._get(
            "fixtures",
            {"team": team_id, "league": league_id, "season": season, "status": "FT"},
            cache_ttl=3600,
        )
        matches = data.get("response", [])
        # Tarihe göre sırala, son N tanesini al
        matches.sort(key=lambda m: m.get("fixture", {}).get("date", ""))
        return matches[-last:]

    # ─────────────────────────────────────────────
    #  H2H (KAFA KAFAYA)
    # ─────────────────────────────────────────────

    def get_h2h(self, team1_id: int, team2_id: int, last: int = 10) -> list:
        """İki takımın son N karşılaşmasını getirir."""
        data = self._get(
            "fixtures/headtohead",
            {"h2h": f"{team1_id}-{team2_id}", "last": last},
            cache_ttl=86400,
        )
        return data.get("response", [])

    # ─────────────────────────────────────────────
    #  MAÇ İSTATİSTİKLERİ
    # ─────────────────────────────────────────────

    def get_fixture_statistics(self, fixture_id: int) -> list:
        """Maçın detaylı istatistiklerini getirir (şut, korner, kart, vb.)"""
        data = self._get(
            "fixtures/statistics",
            {"fixture": fixture_id},
            cache_ttl=300,
        )
        return data.get("response", [])

    def get_fixture_events(self, fixture_id: int) -> list:
        """Maçtaki olaylar: goller, kartlar, değişiklikler."""
        data = self._get(
            "fixtures/events",
            {"fixture": fixture_id},
            cache_ttl=60,
        )
        return data.get("response", [])

    def get_fixture_lineups(self, fixture_id: int) -> list:
        """İlk 11 ve formasyon bilgisi."""
        data = self._get(
            "fixtures/lineups",
            {"fixture": fixture_id},
            cache_ttl=1800,
        )
        return data.get("response", [])

    # ─────────────────────────────────────────────
    #  OYUNCU İSTATİSTİKLERİ
    # ─────────────────────────────────────────────

    def get_player_stats(self, player_id: int, season: int, league_id: int = None) -> dict:
        params = {"id": player_id, "season": season}
        if league_id: params["league"] = league_id
        data = self._get("players", params, cache_ttl=86400)
        resp = data.get("response", [])
        return resp[0] if resp else {}

    def get_top_scorers(self, league_id: int, season: int) -> list:
        data = self._get(
            "players/topscorers",
            {"league": league_id, "season": season},
            cache_ttl=3600,
        )
        return data.get("response", [])

    # ─────────────────────────────────────────────
    #  PUAN TABLOSU
    # ─────────────────────────────────────────────

    def get_standings(self, league_id: int, season: int) -> list:
        data = self._get(
            "standings",
            {"league": league_id, "season": season},
            cache_ttl=3600,
        )
        resp = data.get("response", [])
        if resp:
            return resp[0].get("league", {}).get("standings", [[]])[0]
        return []

    # ─────────────────────────────────────────────
    #  KALAN İSTEK KONTROLÜ
    # ─────────────────────────────────────────────

    def get_quota(self) -> dict:
        data = self._get("status", cache_ttl=60)
        return data.get("response", {}).get("requests", {})
