"""
Redis entegrasyonu — anlık oran verisi ve alarm geçmişi için.

Kullanım:
  store = RedisStore()
  store.push_tick(result_dict)
  alerts = store.get_recent_alerts(n=50)
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("redis paketi yüklü değil. pip install redis")


class RedisStore:
    """
    Redis bağlantısı varsa kullanır, yoksa in-memory fallback.
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        max_alerts: int = 500,
    ):
        self.max_alerts = max_alerts
        self._client = None
        self._fallback: list[dict] = []

        if REDIS_AVAILABLE:
            try:
                self._client = redis.Redis(
                    host=host,
                    port=port,
                    db=db,
                    password=password,
                    decode_responses=True,
                    socket_timeout=2,
                )
                self._client.ping()
                logger.info(f"Redis bağlantısı kuruldu: {host}:{port}")
            except Exception as e:
                logger.warning(f"Redis bağlanamadı ({e}), in-memory mod aktif.")
                self._client = None

    @property
    def is_connected(self) -> bool:
        return self._client is not None

    # ------------------------------------------------------------------ #
    #  YAZI
    # ------------------------------------------------------------------ #

    def push_tick(self, result: dict) -> None:
        """Her işlenen tick'i saklar (sadece alert olanları veya tümü)."""
        payload = json.dumps(result, default=str)

        if self._client:
            # live:<event_id>:<bookmaker> → son oran (STRING)
            live_key = f"live:{result['event_id']}:{result['bookmaker']}"
            self._client.set(live_key, payload, ex=300)  # 5 dk TTL

            # alerts:history → ZSET (score = unix timestamp, sıralı)
            if result.get("is_alert"):
                ts = datetime.now(timezone.utc).timestamp()
                self._client.zadd("alerts:history", {payload: ts})
                # Maksimum eleman sayısını koru
                self._client.zremrangebyrank("alerts:history", 0, -self.max_alerts - 1)
        else:
            # In-memory fallback
            if result.get("is_alert"):
                self._fallback.append(result)
                if len(self._fallback) > self.max_alerts:
                    self._fallback.pop(0)

    def push_batch(self, results: list[dict]) -> None:
        for r in results:
            self.push_tick(r)

    # ------------------------------------------------------------------ #
    #  OKUMA
    # ------------------------------------------------------------------ #

    def get_recent_alerts(self, n: int = 50) -> list[dict]:
        """En son n alarmı döner (yeniden eskiye)."""
        if self._client:
            raw = self._client.zrevrange("alerts:history", 0, n - 1)
            return [json.loads(r) for r in raw]
        else:
            return list(reversed(self._fallback[-n:]))

    def get_live_odds(self, event_id: str) -> list[dict]:
        """Bir event için tüm büroların güncel oranlarını döner."""
        if self._client:
            pattern = f"live:{event_id}:*"
            keys = self._client.keys(pattern)
            results = []
            for key in keys:
                raw = self._client.get(key)
                if raw:
                    results.append(json.loads(raw))
            return results
        return []

    def get_all_live_events(self) -> list[dict]:
        """Tüm aktif event'lerin en son tick'lerini döner."""
        if self._client:
            keys = self._client.keys("live:*")
            seen_events: dict[str, dict] = {}
            for key in keys:
                raw = self._client.get(key)
                if raw:
                    data = json.loads(raw)
                    eid = data["event_id"]
                    if eid not in seen_events:
                        seen_events[eid] = data
            return list(seen_events.values())
        return []

    def get_stats(self) -> dict:
        """Bağlantı ve veri istatistikleri."""
        if self._client:
            alert_count = self._client.zcard("alerts:history")
            live_keys = len(self._client.keys("live:*"))
            return {
                "connected": True,
                "alert_count": alert_count,
                "live_keys": live_keys,
            }
        return {
            "connected": False,
            "alert_count": len(self._fallback),
            "live_keys": 0,
        }
