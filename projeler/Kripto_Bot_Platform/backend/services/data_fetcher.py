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
    def __init__(self, exchange_client, exchange_name: str = None):
        self.exchange = exchange_client
        # Exchange adını client'tan al — hardcoded "bitget" yerine gerçek borsa adı
        if exchange_name:
            self.exchange_name = exchange_name.lower()
        else:
            self.exchange_name = getattr(exchange_client, '_exchange_name', None) \
                or getattr(getattr(exchange_client, 'exchange', None), 'id', 'bitget')
            self.exchange_name = self.exchange_name.lower()

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

        print(f"[DataFetcher] {symbol} {timeframe} — son {days} gün çekiliyor... (start_ts={start_ts})")

        while since < end_ts:
            try:
                since_val = int(since)
                candles = await self.exchange.exchange.fetch_ohlcv(
                    symbol, timeframe, since=since_val, limit=200
                )
            except Exception as e:
                print(f"[DataFetcher] API hatası ({symbol} {timeframe} since={since}): {e} — 3s bekleniyor")
                await asyncio.sleep(3)
                continue

            if not candles:
                print(f"[DataFetcher] {symbol} {timeframe} — Boş veri döndü (since={since})")
                break

            # DB'ye batch upsert
            rows = [
                {
                    "exchange": self.exchange_name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "timestamp": int(c[0]),
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
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
            since = int(last_ts + TF_MS.get(timeframe, 3_600_000))
        else:
            # Hiç veri yoksa son 7 günü çek
            since = int((time.time() - (7 * 86_400)) * 1000)

        end_ts = int(time.time() * 1000)
        if since >= end_ts:
            return 0

        print(f"[DataFetcher] sync_latest: {symbol} {timeframe} since={since} end={end_ts}")

        candles = []
        try:
            # Bitget 40017: endTime gelecekte kalırsa hata verir → params ile sınırla
            fetch_params = {"endTime": str(int(time.time() * 1000))}
            candles = await self.exchange.exchange.fetch_ohlcv(
                symbol, timeframe, since=since, limit=200, params=fetch_params
            )
        except Exception as e:
            print(f"[DataFetcher] sync CCXT hatası ({symbol} {timeframe}): {e} — V2 direct deneniyor")

        if not candles:
            # CCXT başarısız olduysa Bitget V2 direct ile son mumları al, since'den büyükleri filtrele
            all_candles = await self._bitget_v2_direct(symbol, timeframe, 200)
            candles = [c for c in all_candles if c[0] >= since]
            if candles:
                print(f"[DataFetcher] sync V2 direct: {len(candles)} yeni mum ({symbol} {timeframe})")

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
        3. Borsa API → sayfalı çek (Bitget V2 → Binance fallback), DB + Redis'e yaz

        Not: Cache key limit'ten bağımsız tutulur — tek anahtar, verimli cache.
        """
        cache_key = f"ohlcv:{self.exchange_name}:{symbol}:{timeframe}"
        redis = get_redis()

        # 1. Redis cache (bağlantı hatası olsa bile devam et)
        try:
            cached = await redis.get(cache_key)
            if cached:
                all_cached = json.loads(cached)
                if len(all_cached) >= limit * 0.9:  # Cache yeterliyse döndür
                    return all_cached[-limit:] if len(all_cached) > limit else all_cached
        except Exception as e:
            print(f"[DataFetcher] Redis cache okunamadı ({symbol} {timeframe}): {e}")

        # 2. PostgreSQL (bağlantı hatası olsa bile devam et)
        db_ohlcv = []
        try:
            rows = await self._read_from_db(symbol, timeframe, max(limit, 500))
            db_ohlcv = [[r.timestamp, r.open, r.high, r.low, r.close, r.volume] for r in rows] if rows else []
        except Exception as e:
            print(f"[DataFetcher] DB okunamadı ({symbol} {timeframe}): {e}")

        # 3. Borsa API — Sayfalı çekme (Bitget V2 direct önce, sonra fallback)
        exchange_candles = await self._fetch_paginated(symbol, timeframe, limit)

        if exchange_candles:
            db_rows = [
                {
                    "exchange": self.exchange_name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "timestamp": c[0],
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
                }
                for c in exchange_candles
            ]
            try:
                await self._upsert_rows(db_rows)
            except Exception as e:
                print(f"[DataFetcher] DB upsert hatası: {e}")

        # DB verisi + borsa verisini birleştir (timestamp bazında merge)
        if db_ohlcv:
            ts_map = {c[0]: c for c in db_ohlcv}
            for c in exchange_candles:
                ts_map[c[0]] = list(c)  # borsa verisi daha güncel
            merged = sorted(ts_map.values(), key=lambda c: c[0])
        elif exchange_candles:
            merged = [list(c) for c in exchange_candles]
        else:
            print(f"[DataFetcher] Veri yok: {symbol} {timeframe}")
            return []

        # Boşlukları temizle — ardışık mumlar arasında büyük gap varsa eski mumları at
        tf_ms = TF_MS.get(timeframe, 3_600_000)
        if len(merged) > 1:
            # Sondan geriye doğru ilk büyük boşluğu bul (3x tf'den büyük gap)
            gap_idx = 0
            for i in range(len(merged) - 1, 0, -1):
                if merged[i][0] - merged[i-1][0] > tf_ms * 3:
                    gap_idx = i
                    break
            if gap_idx > 0:
                merged = merged[gap_idx:]

        # Redis'e cache'le — büyük limit'lere de destek ver
        to_cache = merged[-max(limit, 1000):] if len(merged) > max(limit, 1000) else merged
        ttl = CACHE_TTL.get(timeframe, 3600)
        try:
            await redis.set(cache_key, json.dumps(to_cache), ex=ttl)
        except Exception as e:
            print(f"[DataFetcher] Redis cache yazılamadı ({symbol} {timeframe}): {e}")

        # limit kadar son mumu döndür
        return merged[-limit:] if len(merged) > limit else merged

    async def _fetch_paginated(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
    ) -> list:
        """
        Tek sayfa veri çekme: Bitget V2 (max 1000) → CCXT (200) → Binance (1000).
        Sayfalama yapmaz — hızlı döner, timeout olmaz.
        """
        # Bitget V2 direct (tek istek, max 1000 mum)
        all_candles = await self._bitget_v2_direct(symbol, timeframe, min(limit, 1000))

        if not all_candles:
            # CCXT fallback (200 mum)
            try:
                all_candles = await self.exchange.exchange.fetch_ohlcv(
                    symbol, timeframe, limit=min(limit, 200),
                )
                if all_candles:
                    all_candles = [list(c) for c in all_candles]
                    print(f"[DataFetcher] Bitget CCXT: {len(all_candles)} mum ({symbol} {timeframe})")
            except Exception as e:
                print(f"[DataFetcher] Bitget CCXT hatası ({symbol} {timeframe}): {e}")

        if not all_candles:
            # Binance fallback
            all_candles = await self._binance_fallback(symbol, timeframe, min(limit, 1000))

        return all_candles or []

    async def _bitget_v2_direct(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 200,
    ) -> list:
        """
        Direkt Bitget V2 public REST API (httpx) — CCXT'yi bypass eder.
        CCXT'nin startTime/endTime param sorunlarını atlatır.
        """
        import httpx
        inst_id = symbol.replace("/", "").replace(":USDT", "").replace(":", "")
        tf_map = {
            "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
            "1d": "1D", "3d": "3D", "1w": "1W",
        }
        granularity = tf_map.get(timeframe, "1H")
        url = "https://api.bitget.com/api/v2/mix/market/candles"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, params={
                    "symbol": inst_id,
                    "productType": "USDT-FUTURES",
                    "granularity": granularity,
                    "limit": str(min(limit, 1000)),
                })
                if resp.status_code == 200:
                    data = resp.json()
                    candles_raw = data.get("data", [])
                    candles = [
                        [int(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), float(c[5])]
                        for c in candles_raw if len(c) >= 6
                    ]
                    candles.sort(key=lambda c: c[0])
                    print(f"[DataFetcher] Bitget V2 direct: {len(candles)} mum ({symbol} {timeframe})")
                    return candles
                else:
                    print(f"[DataFetcher] Bitget V2 direct HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[DataFetcher] Bitget V2 direct hatası: {e}")
        return []

    async def _bitget_v2_direct_before(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 1000,
        end_ts: int = 0,
    ) -> list:
        """Bitget V2 API — endTime ile belirli bir zamandan önceki mumları çek."""
        import httpx
        inst_id = symbol.replace("/", "").replace(":USDT", "").replace(":", "")
        tf_map = {
            "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
            "1d": "1D",
        }
        granularity = tf_map.get(timeframe, "1H")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    "https://api.bitget.com/api/v2/mix/market/candles",
                    params={
                        "symbol": inst_id,
                        "productType": "USDT-FUTURES",
                        "granularity": granularity,
                        "limit": str(min(limit, 1000)),
                        "endTime": str(end_ts),
                    },
                )
                if resp.status_code == 200:
                    candles_raw = resp.json().get("data", [])
                    candles = [
                        [int(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), float(c[5])]
                        for c in candles_raw if len(c) >= 6
                    ]
                    candles.sort(key=lambda c: c[0])
                    return candles
        except Exception as e:
            print(f"[DataFetcher] Bitget V2 before hatası: {e}")
        return []

    async def _binance_fallback(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 200,
    ) -> list:
        """
        Binance public REST API — API key gerektirmez.
        BTC/USDT:USDT → BTCUSDT formatına çevirir.
        """
        import httpx
        # Sembolü Binance formatına çevir: BTC/USDT:USDT → BTCUSDT
        bn_symbol = symbol.replace("/", "").replace(":USDT", "").replace(":", "")
        # Timeframe çevirimi: ccxt → Binance interval
        tf_map = {
            "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
            "1d": "1d", "3d": "3d", "1w": "1w",
        }
        interval = tf_map.get(timeframe, "1h")
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={bn_symbol}&interval={interval}&limit={min(limit, 500)}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    print(f"[DataFetcher] Binance fallback HTTP {resp.status_code}: {resp.text[:200]}")
                    return []
                data = resp.json()
                # Binance format: [open_time, open, high, low, close, volume, ...]
                candles = [
                    [int(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), float(c[5])]
                    for c in data
                ]
                print(f"[DataFetcher] Binance fallback: {len(candles)} mum ({symbol} {timeframe})")
                return candles
        except Exception as e:
            print(f"[DataFetcher] Binance fallback hatası: {e}")
            return []

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
        # Standart cache key (limit parametresi yok)
        cache_key = f"ohlcv:{self.exchange_name}:{symbol}:{timeframe}"
        ttl = CACHE_TTL.get(timeframe, 3600)
        await redis.set(cache_key, json.dumps(ohlcv), ex=ttl)
