"""
Redis cache katmanı — API istek limitini korur.
Redis yoksa in-memory dict fallback.
"""
import json
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class RedisCache:
    def __init__(self, host="localhost", port=6379, db=1, password=None):
        self._client = None
        self._memory: dict = {}  # fallback
        self._memory_ttl: dict = {}

        if REDIS_AVAILABLE:
            try:
                self._client = redis.Redis(
                    host=host, port=port, db=db,
                    password=password, decode_responses=True,
                    socket_timeout=3,
                )
                self._client.ping()
                logger.info(f"Cache Redis bağlandı: {host}:{port} db={db}")
            except Exception as e:
                logger.warning(f"Cache Redis bağlanamadı ({e}), in-memory kullanılıyor.")
                self._client = None

    def get(self, key: str) -> Optional[str]:
        if self._client:
            return self._client.get(f"cache:{key}")
        # In-memory fallback
        if key in self._memory:
            if time.time() < self._memory_ttl.get(key, 0):
                return self._memory[key]
            else:
                del self._memory[key]
        return None

    def set(self, key: str, value: str, ttl: int = 3600):
        if self._client:
            self._client.set(f"cache:{key}", value, ex=ttl)
        else:
            self._memory[key] = value
            self._memory_ttl[key] = time.time() + ttl

    def delete(self, key: str):
        if self._client:
            self._client.delete(f"cache:{key}")
        elif key in self._memory:
            del self._memory[key]

    def flush_pattern(self, pattern: str):
        if self._client:
            keys = self._client.keys(f"cache:*{pattern}*")
            if keys:
                self._client.delete(*keys)
