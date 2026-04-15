import os
from dotenv import load_dotenv
load_dotenv()

FOOTBALL_API_KEY  = os.getenv("FOOTBALL_API_KEY", "")
FOOTBALL_API_BASE = os.getenv("FOOTBALL_API_BASE", "https://v3.football.api-sports.io")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ODDS_API_KEY      = os.getenv("ODDS_API_KEY", "")

REDIS_HOST     = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

DEFAULT_LEAGUE = int(os.getenv("DEFAULT_LEAGUE", "203"))   # Süper Lig
DEFAULT_SEASON = int(os.getenv("DEFAULT_SEASON", "2024"))
MAX_COMBO_SIZE = int(os.getenv("MAX_COMBO_SIZE", "5"))
MIN_PROBABILITY = float(os.getenv("MIN_PROBABILITY", "0.60"))

FOOTBALL_HEADERS = {
    "x-apisports-key": FOOTBALL_API_KEY,
    "Accept": "application/json",
}

# Desteklenen lig ID'leri
LEAGUES = {
    "Süper Lig":         203,
    "Premier League":    39,
    "La Liga":           140,
    "Serie A":           135,
    "Bundesliga":        78,
    "Ligue 1":           61,
    "Champions League":  2,
    "Europa League":     3,
}

# Analiz edilecek bahis türleri
BET_TYPES = [
    "match_result",      # 1 / X / 2
    "btts",              # Karşılıklı gol
    "over_under_2_5",    # 2.5 alt/üst
    "over_under_1_5",    # 1.5 alt/üst
    "over_under_3_5",    # 3.5 alt/üst
    "first_half_result", # İlk yarı sonucu
    "double_chance",     # Çifte şans
    "hy_btts",           # İY / MS kombinasyonu
]
