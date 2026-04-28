"""
Geçmiş Veri Çekme ve Saklama Servisi
─────────────────────────────────────
Akış:
  1. Borsadan OHLCV verisi çek (CCXT)
  2. PostgreSQL'e yaz (kalıcı depo)
  3. Redis'e cache'le (hızlı erişim)

Kullanım:
  - İlk kurulum: fetch_historical() → geçmiş N günü doldur
  - Canlı: sync_latest() → son eksik mumları tamamla
  - Okuma: get_ohlcv() → Redis → DB → borsa sırasıyla dene
"""
import asyncio
import json
import time
from datetime import datetime, timedelta

from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from core.database import AsyncSessionLocal
from core.redis_client import get_redis
from models.trade import OHLCV


# Timeframe → milisaniye çevrim tablosu
TF_MS = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
}

# Redis cache süresi (saniye)
CACHE_TTL = {
    "1m": 120,       # 2 dakika
    "5m": 600,       # 10 dakika
    "15m": 1800,     # 30 dakika
    "1h": 3600,      # 1 saat
    "4h": 14400,     # 4 saat
    "1d": 86400,     # 1 gün
}


class DataFetcher:
    def __init__(self, exchange_client):
        self.exchange = exchange_client
        self.exchange_name = "bitget"

    # ─── Geçmiş Veri Doldurma ────────────────────────────────────────────────

    async def fetch_historical(
        self,
        symbol: str,
        timeframe: str = "1h",
        days: int = 90,
    ) -> int:
        """
        Geçmişe dönük veri çek ve DB'ye yaz.
        CCXT max 200 mum döndürür → sayfalama ile tüm dönemi doldurur.
        Dönen: toplam yazılan satır sayısı.
        """
        tf_ms = TF_MS.get(timeframe, 3_600_000)
        end_ts = int(time.time() * 1000)
        start_ts = end_ts - (days * 86_400_000)

        total_written = 0
        since = start_ts

        print(f"[DataFetcher] {symbol} {timeframe} — son {days} gün çekiliyor...")

        while since < end_ts:
            try:
                candles = await self.exchange.exchange.fetch_ohlcv(
                    symbol, timeframe, since=since, limit=200,
                )
            except Exception as e:
                print(f"[DataFetcher] API hatası: {e} — 3s bekleniyor")
                await asyncio.sleep(3)
                continue

            if not candles:
                break

            # DB'ye batch upsert
            rows = [
                {
                    "exchange": self.exchange_name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "timestamp": c[0],
                    "open": c[1],
                    "high": c[2],
                    "low": c[3],
                    "close": c[4],
                    "volume": c[5],
                }
                for c in candles
            ]

            written = await self._upsert_rows(rows)
            total_written += written

            # Sonraki sayfa
            last_ts = candles[-1][0]
            since = last_ts + tf_ms

            # Rate limit — borsayı yormamak için
            await asyncio.sleep(0.3)

        # Cache'i güncelle
        await self._refresh_cache(symbol, timeframe)

        print(f"[DataFetcher] {symbol} {timeframe} — {total_written} mum yazıldı.")
        return total_written

    # ─── Son Veriyi Senkronize Et ────────────────────────────────────────────

    async def sync_latest(self, symbol: str, timeframe: str = "1h") -> int:
        """
        DB'deki son mum timestamp'inden itibaren eksik mumları doldur.
        Bot engine her döngüde bunu çağırır.
        """
        last_ts = await self._get_last_timestamp(symbol, timeframe)

        if last_ts:
            since = last_ts + TF_MS.get(timeframe, 3_600_000)
        else:
            # Hiç veri yoksa son 7 günü çek
            since = int(time.time() * 1000) - (7 * 86_400_000)

        try:
            candles = await self.exchange.exchange.fetch_ohlcv(
                symbol, timeframe, since=since, limit=200,
            )
        except Exception as e:
            print(f"[DataFetcher] sync hatası: {e}")
            return 0

        if not candles:
            return 0

        rows = [
            {
                "exchange": self.exchange_name,
                "symbol": symbol,
                "timeframe": timeframe,
                "timestamp": c[0],
                "open": c[1],
                "high": c[2],
                "low": c[3],
                "close": c[4],
                "volume": c[5],
            }
            for c in candles
        ]

        written = await self._upsert_rows(rows)
        await self._refresh_cache(symbol, timeframe)
        return written

    # ─── Veri Okuma (Cache → DB → Borsa) ─────────────────────────────────────

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 200,
    ) -> list:
        """
        3 katmanlı okuma:
        1. Redis cache → varsa anında döndür
        2. PostgreSQL → DB'den oku, Redis'e yaz
        3. Borsa API → çek, DB + Redis'e yaz
        """
        cache_key = f"ohlcv:{self.exchange_name}:{symbol}:{timeframe}:{limit}"
        redis = get_redis()

        # 1. Redis cache
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # 2. PostgreSQL
        rows = await self._read_from_db(symbol, timeframe, limit)
        db_ohlcv = [[r.timestamp, r.open, r.high, r.low, r.close, r.volume] for r in rows] if rows else []

        # 3. Borsadan son mumları çek (her zaman — DB'deki boşlukları doldur)
        exchange_candles = []
        try:
            exchange_candles = await self.exchange.exchange.fetch_ohlcv(
                symbol, timeframe, limit=200,
            )
        except Exception as e:
            print(f"[DataFetcher] Borsa hatası: {e}")

        if exchange_candles:
            # DB'ye kaydet
            db_rows = [
                {
                    "exchange": self.exchange_name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "timestamp": c[0],
                    "open": c[1],
                    "high": c[2],
                    "low": c[3],
                    "close": c[4],
                    "volume": c[5],
                }
                for c in exchange_candles
            ]
            await self._upsert_rows(db_rows)

        # DB verisi + borsa verisini birleştir (timestamp'e göre deduplicate)
        if db_ohlcv:
            ts_map = {c[0]: c for c in db_ohlcv}
            for c in exchange_candles:
                ts_map[c[0]] = c  # borsa verisi daha güncel, üstüne yaz
            merged = sorted(ts_map.values(), key=lambda c: c[0])
            # Son N tanesini al
            result = merged[-limit:] if len(merged) > limit else merged
        elif exchange_candles:
            result = exchange_candles
        else:
            return []

        # Redis'e cache'le
        ttl = CACHE_TTL.get(timeframe, 3600)
        await redis.set(cache_key, json.dumps(result), ex=ttl)

        return result

    # ─── Çoklu Sembol + Timeframe Toplu Çekme ───────────────────────────────

    async def fetch_all(
        self,
        symbols: list[str],
        timeframes: list[str],
        days: int = 90,
    ):
        """Birden fazla sembol ve timeframe için geçmiş veri doldur."""
        total = 0
        for symbol in symbols:
            for tf in timeframes:
                count = await self.fetch_historical(symbol, tf, days)
                total += count
        print(f"[DataFetcher] Toplam {total} mum yazıldı ({len(symbols)} sembol × {len(timeframes)} tf)")
        return total

    async def sync_all(self, symbols: list[str], timeframes: list[str]) -> int:
        """Tüm sembol + timeframe çiftlerini senkronize et."""
        total = 0
        for symbol in symbols:
            for tf in timeframes:
                count = await self.sync_latest(symbol, tf)
                total += count
        return total

    # ─── DB İstatistikleri ───────────────────────────────────────────────────

    async def get_stats(self) -> list[dict]:
        """Her sembol/timeframe için kaç mum var, tarih aralığı ne."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(
                    OHLCV.exchange,
                    OHLCV.symbol,
                    OHLCV.timeframe,
                    func.count(OHLCV.id).label("count"),
                    func.min(OHLCV.timestamp).label("first_ts"),
                    func.max(OHLCV.timestamp).label("last_ts"),
                ).group_by(OHLCV.exchange, OHLCV.symbol, OHLCV.timeframe)
            )
            rows = result.all()
            return [
                {
                    "exchange": r.exchange,
                    "symbol": r.symbol,
                    "timeframe": r.timeframe,
                    "candle_count": r.count,
                    "first": datetime.utcfromtimestamp(r.first_ts / 1000).isoformat() if r.first_ts else None,
                    "last": datetime.utcfromtimestamp(r.last_ts / 1000).isoformat() if r.last_ts else None,
                }
                for r in rows
            ]

    # ─── Dahili Yardımcılar ──────────────────────────────────────────────────

    async def _upsert_rows(self, rows: list[dict]) -> int:
        """PostgreSQL ON CONFLICT upsert — aynı mum varsa güncelle."""
        if not rows:
            return 0

        async with AsyncSessionLocal() as session:
            stmt = pg_insert(OHLCV).values(rows)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_ohlcv",
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                },
            )
            await session.execute(stmt)
            await session.commit()

        return len(rows)

    async def _read_from_db(self, symbol: str, timeframe: str, limit: int) -> list:
        """DB'den son N mumu oku."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(OHLCV)
                .where(
                    OHLCV.exchange == self.exchange_name,
                    OHLCV.symbol == symbol,
                    OHLCV.timeframe == timeframe,
                )
                .order_by(OHLCV.timestamp.desc())
                .limit(limit)
            )
            rows = result.scalars().all()
            return list(reversed(rows))  # eski → yeni sıralama

    async def _get_last_timestamp(self, symbol: str, timeframe: str) -> int | None:
        """DB'deki en son mum timestamp'i."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(func.max(OHLCV.timestamp)).where(
                    OHLCV.exchange == self.exchange_name,
                    OHLCV.symbol == symbol,
                    OHLCV.timeframe == timeframe,
                )
            )
            return result.scalar()

    async def _refresh_cache(self, symbol: str, timeframe: str):
        """DB'den son 500 mumu Redis'e yaz."""
        rows = await self._read_from_db(symbol, timeframe, 500)
        if not rows:
            return

        ohlcv = [[r.timestamp, r.open, r.high, r.low, r.close, r.volume] for r in rows]
        redis = get_redis()
        cache_key = f"ohlcv:{self.exchange_name}:{symbol}:{timeframe}:500"
        ttl = CACHE_TTL.get(timeframe, 3600)
        await redis.set(cache_key, json.dumps(ohlcv), ex=ttl)
