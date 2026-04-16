import os
from dotenv import load_dotenv

load_dotenv()

ODDS_API_KEY = os.getenv("ODDS_API_KEY", "")
USE_MOCK_DATA = os.getenv("USE_MOCK_DATA", "true").lower() == "true"

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "0.75"))
CRITICAL_THRESHOLD = float(os.getenv("CRITICAL_THRESHOLD", "0.88"))

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))

# The Odds API endpoints
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
NBA_SPORT_KEY = "basketball_nba"
REGIONS = "eu"           # eu = decimal oranlar (Avrupa formatı)
MARKETS = "h2h,spreads"  # h2h = moneyline, spreads = handikap

# Anomali tespit modeli parametreleri
HST_N_TREES = 10
HST_HEIGHT = 8
HST_WINDOW_SIZE = 250

# Takip edilecek bahis şirketleri (öncelik sırasıyla)
BOOKMAKERS_PRIORITY = [
    "pinnacle",
    "bet365",
    "betfair",
    "unibet",
    "williamhill",
    "draftkings",
    "fanduel",
    "betmgm",
    "caesars",
    "pointsbetus",
]

ALERT_LEVELS = {
    "normal": (0.0, 0.50),
    "suspicious": (0.50, 0.75),
    "warning": (0.75, 0.88),
    "critical": (0.88, 1.0),
}

ALERT_COLORS = {
    "normal": "#2ecc71",
    "suspicious": "#f39c12",
    "warning": "#e67e22",
    "critical": "#e74c3c",
}
