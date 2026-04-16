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

        # LinkedIn API
        self.LINKEDIN_ACCESS_TOKEN = self._require_env("LINKEDIN_ACCESS_TOKEN")
        self.LINKEDIN_PERSON_URN = self._require_env("LINKEDIN_PERSON_URN")

        # Content Filter Strictness: "relaxed", "moderate", "strict"
        self.LINKEDIN_FILTER_STRICTNESS = os.environ.get("LINKEDIN_FILTER_STRICTNESS", "relaxed")

        # Groq (LLM - Content Filter & Caption Adaptation)
        self.GROQ_API_KEY = self._require_env("GROQ_API_KEY")
        self.GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
        self.GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

        # Notion (LinkedIn sayfası NOTION_SOCIAL_TOKEN workspace'inde)
        self.NOTION_TOKEN = self._require_env("NOTION_SOCIAL_TOKEN", os.environ.get("NOTION_TOKEN"))
        self.NOTION_LINKEDIN_DB_ID = self._require_env("NOTION_LINKEDIN_DB_ID")

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
    print(f"BOOT ERROR: {e}")
    sys.exit(1)
