#!/usr/bin/env python3
"""
env_loader.py — Merkezi Credential Loader (Railway + Lokal Uyumlu)
===================================================================
Öncelik sırası:
  1. os.environ (Railway env vars)
  2. master.env dosyası (lokal geliştirme)

Google Service Account:
  - Railway'de: GOOGLE_SERVICE_ACCOUNT_JSON env var (base64 encoded)
  - Lokal'de: _knowledge/credentials/google-service-account.json dosyası
"""

import os
import sys
import json
import base64
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
ANTIGRAVITY_ROOT = SCRIPT_DIR.parent.parent
MASTER_ENV_PATH = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "master.env"
SA_JSON_PATH = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "google-service-account.json"

_env_cache: dict = {}
_sa_temp_path: str = ""


def _load_master_env() -> dict:
    """master.env dosyasını parse eder (lokal fallback)."""
    try:
        if not MASTER_ENV_PATH.exists():
            return {}
    except PermissionError:
        return {}
    env = {}
    with open(MASTER_ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def get_env(key: str, default: str = "") -> str:
    """Environment variable oku: önce os.environ, sonra master.env fallback."""
    global _env_cache

    # 1. os.environ (Railway)
    val = os.environ.get(key)
    if val:
        return val

    # 2. master.env cache
    if not _env_cache:
        _env_cache = _load_master_env()

    return _env_cache.get(key, default)


def get_sa_json_path() -> str:
    """Google Service Account JSON dosya yolunu döndür.
    
    Railway'de: GOOGLE_SERVICE_ACCOUNT_JSON env var'ından base64 decode edip
                geçici dosyaya yazar.
    Lokal'de: Doğrudan dosya yolunu döndürür.
    """
    global _sa_temp_path

    # Daha önce oluşturduysan tekrar kullan
    if _sa_temp_path and os.path.exists(_sa_temp_path):
        return _sa_temp_path

    # 1. Env var'dan (Railway)
    sa_b64 = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if sa_b64:
        try:
            sa_json = base64.b64decode(sa_b64).decode("utf-8")
            # JSON geçerliliğini kontrol et
            json.loads(sa_json)
            # Geçici dosyaya yaz
            tmp = tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", prefix="sa_", delete=False
            )
            tmp.write(sa_json)
            tmp.close()
            _sa_temp_path = tmp.name
            return _sa_temp_path
        except Exception as e:
            print(f"⚠️ GOOGLE_SERVICE_ACCOUNT_JSON decode hatası: {e}")

    # 2. Lokal dosya
    try:
        if SA_JSON_PATH.exists():
            return str(SA_JSON_PATH)
    except PermissionError:
        pass

    return ""


def require_env(key: str) -> str:
    """Zorunlu environment variable. Yoksa hata verir."""
    val = get_env(key)
    if not val:
        print(f"❌ HATA: {key} bulunamadı! (Railway env var veya master.env gerekli)")
        sys.exit(1)
    return val
