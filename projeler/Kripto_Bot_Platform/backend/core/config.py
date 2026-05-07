from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./kripto.db"
    REDIS_URL: str = "redis://kripto-redis:6379"

    BITGET_API_KEY: str = ""
    BITGET_API_SECRET: str = ""
    BITGET_PASSPHRASE: str = ""

    MEXC_API_KEY: str = ""
    MEXC_API_SECRET: str = ""

    OPENROUTER_API_KEY: str = ""
    AI_FAST_MODEL: str = "deepseek/deepseek-chat"
    AI_DEEP_MODEL: str = "anthropic/claude-3.5-sonnet"
    AI_MIN_CONFIDENCE: int = 60      # Bu skorun altındaki sinyaller reddedilir

    CRYPTOPANIC_API_KEY: str = ""    # cryptopanic.com ücretsiz kayıt
    COINGLASS_API_KEY: str = ""      # coinglass.com ücretsiz kayıt
    FINNHUB_API_KEY: str = ""        # finnhub.io ücretsiz kayıt

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    SECRET_KEY: str = "change-me"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
