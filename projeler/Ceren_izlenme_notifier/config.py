import os
import sys

class Config:
    def __init__(self):
        self.ENV = os.environ.get("ENV", "development").lower()
        self.IS_DRY_RUN = self.ENV == "development" or os.environ.get("DRY_RUN", "0") == "1"
        
        self.APIFY_KEYS = []
        for i in range(1, 10):
            val = os.environ.get(f"APIFY_API_KEY_{i}")
            if val:
                self.APIFY_KEYS.append(val)
        
        # Geriye dönük uyumluluk (eskiden sadece APIFY_API_KEY vardıysa)
        old_val = os.environ.get("APIFY_API_KEY")
        if old_val and (old_val not in self.APIFY_KEYS):
            self.APIFY_KEYS.append(old_val)
            
        if not self.APIFY_KEYS:
            raise EnvironmentError("CRITICAL STARTUP FAILURE: En az bir adet APIFY_API_KEY_x bulunamadı!")
        self.GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
        
        # Apify Actor IDs
        self.APIFY_INSTAGRAM_ACTOR = os.environ.get("APIFY_INSTAGRAM_ACTOR", "apify/instagram-profile-scraper")
        self.APIFY_TIKTOK_ACTOR = os.environ.get("APIFY_TIKTOK_ACTOR", "0FXVyOXXEmdGcV88a")
        self.APIFY_YOUTUBE_ACTOR = os.environ.get("APIFY_YOUTUBE_ACTOR", "h7sDV53CddomktSi5")
        
        # When running in Railway or locally, determine where the token is.
        oauth_json = os.environ.get("GMAIL_OAUTH_JSON")
        if oauth_json:
            import tempfile
            fd, path = tempfile.mkstemp(suffix=".json")
            with os.fdopen(fd, 'w') as f:
                f.write(oauth_json)
            self.OAUTH_TOKEN_PATH = path
        else:
            default_token_path = os.path.abspath(os.path.join(
                os.path.dirname(__file__), "..", "..", "_knowledge", "credentials", "oauth", "gmail-[isim]-ai-token.json"
            ))
            
            self.OAUTH_TOKEN_PATH = os.environ.get("OAUTH_TOKEN_PATH", default_token_path)

            if not os.path.exists(self.OAUTH_TOKEN_PATH):
                # Fallback path if deployed or different layout
                fallback = os.path.join(os.path.dirname(__file__), "..", "..", "..", "_knowledge", "credentials", "oauth", "gmail-[isim]-ai-token.json")
                if os.path.exists(fallback):
                    self.OAUTH_TOKEN_PATH = fallback

    def _require_env(self, key, default=None):
        val = os.environ.get(key, default)
        if not val:
            raise EnvironmentError(f"CRITICAL STARTUP FAILURE: Gerekli ortam değişkeni {key} bulunamadı!")
        return val

try:
    settings = Config()
except EnvironmentError as e:
    import logging
    logging.error(f"BOOT ERROR: {e}", exc_info=True)
    sys.exit(1)
