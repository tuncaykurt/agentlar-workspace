"""
PostgreSQL veritabanı servisi.
API'den çekilen verileri kalıcı saklar — günlük kota tasarrufu sağlar.

Tablolar:
  fixtures      — maç listesi (tarih bazlı)
  team_matches  — takım geçmiş maçları
  h2h_matches   — kafa kafaya geçmiş
  analyses      — AI analiz sonuçları
  standings     — puan tablosu
"""
import json, logging, os
from datetime import datetime, date
from typing import Optional
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "")

_conn = None

def get_conn():
    global _conn
    try:
        if _conn is None or _conn.closed:
            _conn = psycopg2.connect(DATABASE_URL, connect_timeout=5)
            _conn.autocommit = True
        return _conn
    except Exception as e:
        logger.error(f"DB bağlantı hatası: {e}")
        return None


def init_db():
    """Tabloları oluştur — uygulama başlangıcında çağrılır."""
    conn = get_conn()
    if not conn:
        logger.warning("DB bağlantısı yok, tablolar oluşturulamadı")
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS fixtures (
                    id          BIGINT PRIMARY KEY,
                    match_date  DATE NOT NULL,
                    league_id   INT,
                    league_name TEXT,
                    home_id     INT,
                    home_name   TEXT,
                    away_id     INT,
                    away_name   TEXT,
                    status      TEXT,
                    home_goals  INT,
                    away_goals  INT,
                    raw         JSONB,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures(match_date);
                CREATE INDEX IF NOT EXISTS idx_fixtures_league ON fixtures(league_id);

                CREATE TABLE IF NOT EXISTS team_matches (
                    id          SERIAL PRIMARY KEY,
                    team_id     INT NOT NULL,
                    league_id   INT NOT NULL,
                    season      INT NOT NULL,
                    raw         JSONB NOT NULL,
                    fetched_at  TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(team_id, league_id, season)
                );

                CREATE TABLE IF NOT EXISTS h2h_matches (
                    id          SERIAL PRIMARY KEY,
                    team1_id    INT NOT NULL,
                    team2_id    INT NOT NULL,
                    raw         JSONB NOT NULL,
                    fetched_at  TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(team1_id, team2_id)
                );

                CREATE TABLE IF NOT EXISTS standings (
                    id          SERIAL PRIMARY KEY,
                    league_id   INT NOT NULL,
                    season      INT NOT NULL,
                    raw         JSONB NOT NULL,
                    fetched_at  TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(league_id, season)
                );

                CREATE TABLE IF NOT EXISTS analyses (
                    id           SERIAL PRIMARY KEY,
                    fixture_id   BIGINT NOT NULL,
                    home_name    TEXT,
                    away_name    TEXT,
                    league_name  TEXT,
                    model        TEXT,
                    statistical  JSONB,
                    ai_result    JSONB,
                    odds         JSONB,
                    ev           JSONB,
                    created_at   TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(fixture_id, model)
                );
                CREATE INDEX IF NOT EXISTS idx_analyses_fixture ON analyses(fixture_id);
                CREATE INDEX IF NOT EXISTS idx_analyses_date ON analyses(created_at);
            """)
        logger.info("DB tabloları hazır")
    except Exception as e:
        logger.error(f"DB init hatası: {e}")


# ── Fixtures ─────────────────────────────────────────────────────────────── #

def save_fixtures(match_date: str, fixtures: list):
    conn = get_conn()
    if not conn or not fixtures:
        return
    try:
        with conn.cursor() as cur:
            for f in fixtures:
                fix   = f.get("fixture", {})
                teams = f.get("teams", {})
                goals = f.get("goals", {})
                league = f.get("league", {})
                cur.execute("""
                    INSERT INTO fixtures
                        (id, match_date, league_id, league_name, home_id, home_name,
                         away_id, away_name, status, home_goals, away_goals, raw)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id) DO UPDATE SET
                        status=EXCLUDED.status,
                        home_goals=EXCLUDED.home_goals,
                        away_goals=EXCLUDED.away_goals,
                        raw=EXCLUDED.raw
                """, (
                    fix.get("id"),
                    match_date,
                    league.get("id"),
                    league.get("name",""),
                    teams.get("home",{}).get("id"),
                    teams.get("home",{}).get("name",""),
                    teams.get("away",{}).get("id"),
                    teams.get("away",{}).get("name",""),
                    fix.get("status",{}).get("short",""),
                    goals.get("home"),
                    goals.get("away"),
                    json.dumps(f),
                ))
    except Exception as e:
        logger.error(f"Fixture kayıt hatası: {e}")


def load_fixtures(match_date: str, league_id: int = None) -> list:
    """DB'den maç listesi yükle. Boş dönerse API'den çek."""
    conn = get_conn()
    if not conn:
        return []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if league_id:
                cur.execute("SELECT raw FROM fixtures WHERE match_date=%s AND league_id=%s", (match_date, league_id))
            else:
                cur.execute("SELECT raw FROM fixtures WHERE match_date=%s", (match_date,))
            rows = cur.fetchall()
            return [row["raw"] for row in rows]
    except Exception as e:
        logger.error(f"Fixture yükleme hatası: {e}")
        return []


# ── Team Matches ─────────────────────────────────────────────────────────── #

def save_team_matches(team_id: int, league_id: int, season: int, matches: list):
    conn = get_conn()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO team_matches (team_id, league_id, season, raw)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (team_id, league_id, season) DO UPDATE SET
                    raw=EXCLUDED.raw, fetched_at=NOW()
            """, (team_id, league_id, season, json.dumps(matches)))
    except Exception as e:
        logger.error(f"Team matches kayıt hatası: {e}")


def load_team_matches(team_id: int, league_id: int, season: int) -> Optional[list]:
    """None dönerse API'den çek. Liste dönerse DB'den kullan."""
    conn = get_conn()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT raw, fetched_at FROM team_matches
                WHERE team_id=%s AND league_id=%s AND season=%s
            """, (team_id, league_id, season))
            row = cur.fetchone()
            if not row:
                return None
            # 7 günden eskiyse yenile
            age = (datetime.now() - row["fetched_at"].replace(tzinfo=None)).days
            if age > 7:
                return None
            return row["raw"]
    except Exception as e:
        logger.error(f"Team matches yükleme hatası: {e}")
        return None


# ── H2H ─────────────────────────────────────────────────────────────────── #

def save_h2h(team1_id: int, team2_id: int, matches: list):
    conn = get_conn()
    if not conn:
        return
    t1, t2 = min(team1_id, team2_id), max(team1_id, team2_id)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO h2h_matches (team1_id, team2_id, raw)
                VALUES (%s,%s,%s)
                ON CONFLICT (team1_id, team2_id) DO UPDATE SET
                    raw=EXCLUDED.raw, fetched_at=NOW()
            """, (t1, t2, json.dumps(matches)))
    except Exception as e:
        logger.error(f"H2H kayıt hatası: {e}")


def load_h2h(team1_id: int, team2_id: int) -> Optional[list]:
    conn = get_conn()
    if not conn:
        return None
    t1, t2 = min(team1_id, team2_id), max(team1_id, team2_id)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT raw, fetched_at FROM h2h_matches
                WHERE team1_id=%s AND team2_id=%s
            """, (t1, t2))
            row = cur.fetchone()
            if not row:
                return None
            age = (datetime.now() - row["fetched_at"].replace(tzinfo=None)).days
            if age > 30:
                return None
            return row["raw"]
    except Exception as e:
        logger.error(f"H2H yükleme hatası: {e}")
        return None


# ── Standings ────────────────────────────────────────────────────────────── #

def save_standings(league_id: int, season: int, data: list):
    conn = get_conn()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO standings (league_id, season, raw)
                VALUES (%s,%s,%s)
                ON CONFLICT (league_id, season) DO UPDATE SET
                    raw=EXCLUDED.raw, fetched_at=NOW()
            """, (league_id, season, json.dumps(data)))
    except Exception as e:
        logger.error(f"Standings kayıt hatası: {e}")


def load_standings(league_id: int, season: int) -> Optional[list]:
    conn = get_conn()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT raw, fetched_at FROM standings
                WHERE league_id=%s AND season=%s
            """, (league_id, season))
            row = cur.fetchone()
            if not row:
                return None
            age = (datetime.now() - row["fetched_at"].replace(tzinfo=None)).days
            if age > 1:  # Puan tablosu her gün değişebilir
                return None
            return row["raw"]
    except Exception as e:
        logger.error(f"Standings yükleme hatası: {e}")
        return None


# ── Analyses ─────────────────────────────────────────────────────────────── #

def save_analysis(fixture_id: int, home: str, away: str, league: str,
                  model: str, statistical: dict, ai_result: dict,
                  odds: dict = None, ev: dict = None):
    conn = get_conn()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO analyses
                    (fixture_id, home_name, away_name, league_name, model,
                     statistical, ai_result, odds, ev)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (fixture_id, model) DO UPDATE SET
                    statistical=EXCLUDED.statistical,
                    ai_result=EXCLUDED.ai_result,
                    odds=EXCLUDED.odds,
                    ev=EXCLUDED.ev,
                    created_at=NOW()
            """, (
                fixture_id, home, away, league, model,
                json.dumps(statistical), json.dumps(ai_result),
                json.dumps(odds) if odds else None,
                json.dumps(ev) if ev else None,
            ))
    except Exception as e:
        logger.error(f"Analiz kayıt hatası: {e}")


def load_analysis(fixture_id: int, model: str) -> Optional[dict]:
    """Aynı maç+model kombinasyonu varsa DB'den getir."""
    conn = get_conn()
    if not conn:
        return None
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM analyses
                WHERE fixture_id=%s AND model=%s
                ORDER BY created_at DESC LIMIT 1
            """, (fixture_id, model))
            row = cur.fetchone()
            if not row:
                return None
            # 12 saatten eskiyse yeniden analiz et
            age_hours = (datetime.now() - row["created_at"].replace(tzinfo=None)).total_seconds() / 3600
            if age_hours > 12:
                return None
            return {
                "fixture_id":  fixture_id,
                "home":        row["home_name"],
                "away":        row["away_name"],
                "league":      row["league_name"],
                "statistical": row["statistical"],
                "ai":          row["ai_result"],
                "odds":        row["odds"],
                "ev":          row["ev"],
                "_cached":     True,
            }
    except Exception as e:
        logger.error(f"Analiz yükleme hatası: {e}")
        return None
