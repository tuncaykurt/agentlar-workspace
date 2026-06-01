import redis.asyncio as redis
from .config import settings

_client: redis.Redis | None = None

# RESP2 protokolü kullan — Redis 7 + auth kombinasyonunda
# RESP3 HELLO komutu auth'dan önce gönderilip hata veriyor.
_REDIS_OPTS = dict(
    decode_responses=True,
    protocol=2,
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=True,
)


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.REDIS_URL, **_REDIS_OPTS)
    return _client


def create_redis() -> redis.Redis:
    """Pub/Sub için ayrı bağlantı oluştur (her subscriber kendi bağlantısını kullanmalı)."""
    return redis.from_url(settings.REDIS_URL, **_REDIS_OPTS)
