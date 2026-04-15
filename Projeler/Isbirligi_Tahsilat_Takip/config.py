import os
import sys

# Railway ortam algılama
IS_RAILWAY = bool(os.environ.get("RAILWAY_ENVIRONMENT"))

# Yolları belirle (sadece lokal'de kullanılır)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
CREDENTIALS_FILE = os.path.join(PROJECT_ROOT, "_knowledge", "credentials", "master.env")

def load_env():
    """Reads master.env manually and loads variables into os.environ (only on local)"""
    if IS_RAILWAY:
        # Railway'de env variables zaten tanımlı, master.env aranmaz
        return

    if not os.path.exists(CREDENTIALS_FILE):
        print(f"Uyarı: {CREDENTIALS_FILE} bulunamadı. (Lokal ortam)")
        return

    with open(CREDENTIALS_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

load_env()

NOTION_API_TOKEN = os.getenv("NOTION_SOCIAL_TOKEN") or os.getenv("NOTION_API_TOKEN")

if not NOTION_API_TOKEN:
    print("❌ KRİTİK: NOTION_SOCIAL_TOKEN veya NOTION_API_TOKEN bulunamadı!")
    raise EnvironmentError("NOTION_API_TOKEN eksik, uygulama başlatılamıyor.")

# Notion Database ID'leri — Yeni Workspace (Mart 2026+)
YOUTUBE_DB_ID = "BURAYA_NOTION_YOUTUBE_DB_ID"
REELS_DB_ID = "BURAYA_NOTION_REELS_DB_ID"
