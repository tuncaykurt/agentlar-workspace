import os
import sys
import shutil
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", "..", "_knowledge", "credentials", "master.env")
if os.path.exists(env_path):
    load_dotenv(env_path)

# Antigravity V2 Fail-Fast Environment Validation
class Config:
    def __init__(self):
        # 1. Check if ENV is defined (Development or Production)
        self.ENV = os.environ.get("ENV", "development").lower()
        self.IS_DRY_RUN = self.ENV == "development" or os.environ.get("DRY_RUN", "0") == "1"

        # System dependency check: ffmpeg is critical for video processing
        if not shutil.which("ffmpeg"):
            raise EnvironmentError("CRITICAL STARTUP FAILURE: ffmpeg binary bulunamadı! nixpacks.toml doğru yapılandırılmalı.")
        
        # Notion
        self.NOTION_TOKEN = self._require_env("NOTION_SOCIAL_TOKEN")
        self.NOTION_TWITTER_DB_ID = self._require_env("NOTION_TWITTER_DB_ID")
        
        # X API (Twitter)
        self.X_CONSUMER_KEY = self._require_env("X_CONSUMER_KEY", "dummy" if self.IS_DRY_RUN else None)
        self.X_CONSUMER_SECRET = self._require_env("X_CONSUMER_SECRET", "dummy" if self.IS_DRY_RUN else None)
        self.X_ACCESS_TOKEN = self._require_env("X_ACCESS_TOKEN", "dummy" if self.IS_DRY_RUN else None)
        self.X_ACCESS_TOKEN_SECRET = self._require_env("X_ACCESS_TOKEN_SECRET", "dummy" if self.IS_DRY_RUN else None)
        
        # App specific
        self.TIKTOK_USERNAME = os.environ.get("TIKTOK_USERNAME", "[SOSYAL_MEDYA_KULLANICI]")
        
    def _require_env(self, key, default=None):
        """Fetches an environment variable, raises error if missing."""
        val = os.environ.get(key, default)
        if not val:
            raise EnvironmentError(f"CRITICAL STARTUP FAILURE: Gerekli ortam değişkeni {key} bulunamadı!")
        return val

# Instantiating the config globally so it fails fast on module load.
try:
    settings = Config()
except EnvironmentError as e:
    # Use a basic print here because logger might not be ready, or generic logging might depend on config.
    print(f"BOOT ERROR: {e}")
    sys.exit(1)
