import redis.asyncio as redis
from .config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def create_redis() -> redis.Redis:
    """Pub/Sub için ayrı bağlantı oluştur (her subscriber kendi bağlantısını kullanmalı)."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)
