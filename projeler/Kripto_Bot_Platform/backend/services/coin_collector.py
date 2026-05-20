"""
Coin Veri Toplayıcı — Zero-fee coinlerin göstergelerini arka planda toplar.

Akış:
1. Başlangıçta MEXC'den zero-fee sembol listesini çeker (1 saat cache)
2. Paralel batch halinde tüm zero-fee coinler için OHLCV verisini çeker
3. RSI, ATR, EMA200, MACD, Supertrend vb. hesaplar
4. CoinSnapshot tablosuna kaydeder (UPSERT)

Rate limit koruması: semaphore ile eşzamanlılık sınırı + otomatik hız ayarı.
"""
import asyncio
import time
from datetime import datetime

import ccxt.async_support as ccxt
from sqlalchemy import text
from core.database import async_session
from core.redis_client import get_redis
from ai.indicators import calculate_all
import json
import httpx


# Güncelleme aralığı (saniye)
UPDATE_INTERVAL = 10        # döngüler arası minimum bekleme
BATCH_CONCURRENCY = 5       # aynı anda max kaç OHLCV isteği
COIN_DELAY = 0.08           # istek sonrası bekleme (rate limit)
COIN_DELAY_MAX = 3.0        # rate limit varsa maksimum bekleme
SYMBOLS_CACHE_TTL = 3600    # 1 saat
MARKET_DATA_CACHE_TTL = 300 # 5 dakika — funding rate, fear/greed vb.


async def _get_zero_fee_symbols(exchange_client) -> list[dict]:
    """MEXC'den zero-fee futures sembollerini çek."""
    redis = get_redis()
    cache_key = "coin_collector:zero_fee_symbols"

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    await exchange_client.load_markets()
    symbols = []
    # STOCK tokenları filtrele — MEXC'de tokenized stock futures API ile trade edilemez
    # Örnek: AAPLSTOCK/USDT:USDT, TSLASTOCK/USDT:USDT vb.
    EXCLUDED_SUFFIXES = ("STOCK", "STOCKD")  # STOCK ve leveraged stock türevleri

    for symbol, market in exchange_client.markets.items():
        if not market.get("swap") and not market.get("future"):
            continue
        if not market.get("active", True):
            continue
        if market.get("settle") != "USDT" and market.get("quote") != "USDT":
            continue

        base = market.get("base", "")
        # STOCK uzantılı tokenları atla
        if any(base.upper().endswith(suffix) for suffix in EXCLUDED_SUFFIXES):
            continue

        taker_fee = market.get("taker", 0) or 0
        maker_fee = market.get("maker", 0) or 0
        is_zero_fee = taker_fee == 0 and maker_fee == 0

        if not is_zero_fee:
            continue

        max_leverage = None
        limits = market.get("limits", {})
        leverage_limits = limits.get("leverage", {})
        if leverage_limits and leverage_limits.get("max"):
            max_leverage = int(leverage_limits["max"])

        symbols.append({
            "symbol": symbol,
            "base": base,
            "taker_fee": round(taker_fee * 100, 4),
            "maker_fee": round(maker_fee * 100, 4),
            "zero_fee": True,
            "max_leverage": max_leverage,
        })

    symbols.sort(key=lambda x: x["base"])
    await redis.set(cache_key, json.dumps(symbols), ex=SYMBOLS_CACHE_TTL)
    print(f"[CoinCollector] {len(symbols)} zero-fee sembol bulundu.")
    return symbols


async def _fetch_market_data(exchange_client, redis) -> dict:
    """
    Piyasa geneli verileri çek (5 dk cache):
    - Fear & Greed Index (alternative.me — ücretsiz, API key yok)
    - Funding rate'ler (MEXC exchange API — CCXT ile)
    """
    cache_key = "coin_collector:market_data"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    data = {"fear_greed": None, "funding_rates": {}}

    # ── Fear & Greed Index ──
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://api.alternative.me/fng/?limit=1")
            fg_data = r.json().get("data", [{}])[0]
            data["fear_greed"] = int(fg_data.get("value", 50))
    except Exception as e:
        print(f"[CoinCollector] Fear&Greed hatası (devam): {e}")

    # ── Funding Rates (toplu çek) ──
    try:
        funding_rates = await asyncio.wait_for(
            exchange_client.fetch_funding_rates(), timeout=15
        )
        for symbol, fr_info in funding_rates.items():
            rate = fr_info.get("fundingRate")
            if rate is not None:
                data["funding_rates"][symbol] = round(float(rate) * 100, 6)  # % olarak
    except Exception as e:
        # fetch_funding_rates desteklenmiyorsa sessizce geç
        err_str = str(e).lower()
        if "not support" not in err_str and "not available" not in err_str:
            print(f"[CoinCollector] Funding rates hatası (devam): {e}")

    await redis.set(cache_key, json.dumps(data), ex=MARKET_DATA_CACHE_TTL)
    print(f"[CoinCollector] Market data güncellendi: F&G={data['fear_greed']}, funding={len(data['funding_rates'])} coin")
    return data


async def _fetch_and_analyze(exchange_client, sym_info: dict, timeframe: str = "1h",
                              market_data: dict | None = None) -> dict | None:
    """Tek bir coin için OHLCV çek ve göstergeleri hesapla."""
    symbol = sym_info["symbol"]
    try:
        ohlcv = await asyncio.wait_for(
            exchange_client.fetch_ohlcv(symbol, timeframe, limit=210),
            timeout=15,
        )
    except asyncio.TimeoutError:
        return None
    except Exception as e:
        err_str = str(e).lower()
        if "rate" in err_str or "429" in err_str or "too many" in err_str:
            raise  # rate limit'i yukarıya ilet
        return None

    if len(ohlcv) < 55:
        return None

    ind = calculate_all(ohlcv)
    if not ind:
        return None

    price = ind.get("close", 0)
    atr_val = ind.get("atr")
    ema200_val = ind.get("ema200")

    # 24h ve 1h değişim hesapla
    price_change_1h = None
    price_change_24h = None
    if len(ohlcv) >= 2:
        prev_close = ohlcv[-2][4]
        if prev_close > 0:
            price_change_1h = round((price - prev_close) / prev_close * 100, 2)
    if len(ohlcv) >= 25:
        close_24h_ago = ohlcv[-25][4] if timeframe == "1h" else None
        if close_24h_ago and close_24h_ago > 0:
            price_change_24h = round((price - close_24h_ago) / close_24h_ago * 100, 2)

    # Ek piyasa verileri (market_data'dan)
    md = market_data or {}
    funding_rate = md.get("funding_rates", {}).get(symbol)
    fear_greed = md.get("fear_greed")

    return {
        "exchange": "mexc",
        "symbol": symbol,
        "base": sym_info["base"],
        "timeframe": timeframe,
        "price": price,
        "price_change_1h": price_change_1h,
        "price_change_24h": price_change_24h,
        "rsi_14": ind.get("rsi"),
        "atr": atr_val,
        "atr_pct": round(atr_val / price * 100, 4) if atr_val and price else None,
        "ema200": ema200_val,
        "ema200_dist": round((price - ema200_val) / ema200_val * 100, 2) if ema200_val and ema200_val > 0 else None,
        "macd_hist": ind.get("macd_hist"),
        "supertrend_dir": ind.get("supertrend_dir"),
        "adx": ind.get("adx"),
        "volume_ratio": ind.get("vol_ratio"),
        "bb_upper": ind.get("bb_upper"),
        "bb_lower": ind.get("bb_lower"),
        "funding_rate": funding_rate,
        "fear_greed": fear_greed,
        "zero_fee": sym_info.get("zero_fee", False),
        "taker_fee": sym_info.get("taker_fee"),
        "maker_fee": sym_info.get("maker_fee"),
        "max_leverage": sym_info.get("max_leverage"),
    }


_has_funding_col: bool | None = None  # Cache: funding_rate kolonu var mı


async def _upsert_snapshot(data: dict):
    """CoinSnapshot tablosuna UPSERT (varsa güncelle, yoksa ekle). Yeni kolonlar yoksa da çalışır."""
    global _has_funding_col

    async with async_session() as session:
        # İlk çağrıda kolon varlığını kontrol et, sonucu cache'le
        if _has_funding_col is None:
            try:
                await session.execute(text("SELECT funding_rate FROM coin_snapshots LIMIT 1"))
                _has_funding_col = True
            except Exception:
                _has_funding_col = False
                await session.rollback()

        if _has_funding_col:
            await session.execute(text("""
                INSERT INTO coin_snapshots (
                    exchange, symbol, base, timeframe, price,
                    price_change_1h, price_change_24h,
                    rsi_14, atr, atr_pct, ema200, ema200_dist,
                    macd_hist, supertrend_dir, adx, volume_ratio,
                    bb_upper, bb_lower,
                    funding_rate, fear_greed,
                    zero_fee, taker_fee, maker_fee, max_leverage,
                    updated_at
                ) VALUES (
                    :exchange, :symbol, :base, :timeframe, :price,
                    :price_change_1h, :price_change_24h,
                    :rsi_14, :atr, :atr_pct, :ema200, :ema200_dist,
                    :macd_hist, :supertrend_dir, :adx, :volume_ratio,
                    :bb_upper, :bb_lower,
                    :funding_rate, :fear_greed,
                    :zero_fee, :taker_fee, :maker_fee, :max_leverage,
                    NOW()
                )
                ON CONFLICT ON CONSTRAINT uq_coin_snapshot
                DO UPDATE SET
                    base = EXCLUDED.base,
                    price = EXCLUDED.price,
                    price_change_1h = EXCLUDED.price_change_1h,
                    price_change_24h = EXCLUDED.price_change_24h,
                    rsi_14 = EXCLUDED.rsi_14,
                    atr = EXCLUDED.atr,
                    atr_pct = EXCLUDED.atr_pct,
                    ema200 = EXCLUDED.ema200,
                    ema200_dist = EXCLUDED.ema200_dist,
                    macd_hist = EXCLUDED.macd_hist,
                    supertrend_dir = EXCLUDED.supertrend_dir,
                    adx = EXCLUDED.adx,
                    volume_ratio = EXCLUDED.volume_ratio,
                    bb_upper = EXCLUDED.bb_upper,
                    bb_lower = EXCLUDED.bb_lower,
                    funding_rate = EXCLUDED.funding_rate,
                    fear_greed = EXCLUDED.fear_greed,
                    zero_fee = EXCLUDED.zero_fee,
                    taker_fee = EXCLUDED.taker_fee,
                    maker_fee = EXCLUDED.maker_fee,
                    max_leverage = EXCLUDED.max_leverage,
                    updated_at = NOW()
            """), data)
        else:
            # Eski şema — funding_rate/fear_greed kolonu yok
            await session.execute(text("""
                INSERT INTO coin_snapshots (
                    exchange, symbol, base, timeframe, price,
                    price_change_1h, price_change_24h,
                    rsi_14, atr, atr_pct, ema200, ema200_dist,
                    macd_hist, supertrend_dir, adx, volume_ratio,
                    bb_upper, bb_lower,
                    zero_fee, taker_fee, maker_fee, max_leverage,
                    updated_at
                ) VALUES (
                    :exchange, :symbol, :base, :timeframe, :price,
                    :price_change_1h, :price_change_24h,
                    :rsi_14, :atr, :atr_pct, :ema200, :ema200_dist,
                    :macd_hist, :supertrend_dir, :adx, :volume_ratio,
                    :bb_upper, :bb_lower,
                    :zero_fee, :taker_fee, :maker_fee, :max_leverage,
                    NOW()
                )
                ON CONFLICT ON CONSTRAINT uq_coin_snapshot
                DO UPDATE SET
                    base = EXCLUDED.base,
                    price = EXCLUDED.price,
                    price_change_1h = EXCLUDED.price_change_1h,
                    price_change_24h = EXCLUDED.price_change_24h,
                    rsi_14 = EXCLUDED.rsi_14,
                    atr = EXCLUDED.atr,
                    atr_pct = EXCLUDED.atr_pct,
                    ema200 = EXCLUDED.ema200,
                    ema200_dist = EXCLUDED.ema200_dist,
                    macd_hist = EXCLUDED.macd_hist,
                    supertrend_dir = EXCLUDED.supertrend_dir,
                    adx = EXCLUDED.adx,
                    volume_ratio = EXCLUDED.volume_ratio,
                    bb_upper = EXCLUDED.bb_upper,
                    bb_lower = EXCLUDED.bb_lower,
                    zero_fee = EXCLUDED.zero_fee,
                    taker_fee = EXCLUDED.taker_fee,
                    maker_fee = EXCLUDED.maker_fee,
                    max_leverage = EXCLUDED.max_leverage,
                    updated_at = NOW()
            """), data)
        await session.commit()


async def _process_coin(exchange_client, sym_info: dict, semaphore: asyncio.Semaphore,
                        delay: float, stats: dict, market_data: dict | None = None):
    """Semaphore kontrollü tek coin işleme."""
    async with semaphore:
        try:
            data = await _fetch_and_analyze(exchange_client, sym_info, market_data=market_data)
            if data:
                await _upsert_snapshot(data)
                stats["ok"] += 1
            else:
                stats["fail"] += 1
        except Exception as e:
            err_str = str(e).lower()
            if "rate" in err_str or "429" in err_str or "too many" in err_str or "limit" in err_str:
                stats["rate_limited"] += 1
                wait = min(delay * 5, 10)
                await asyncio.sleep(wait)
            else:
                stats["fail"] += 1
        # İstekler arası kısa bekleme
        await asyncio.sleep(delay)


async def run_collection_cycle(current_delay: float = COIN_DELAY) -> float:
    """
    Tek bir toplama döngüsü — paralel batch halinde tüm zero-fee coinleri tara.
    Rate limit algılanırsa delay'i artırır, sorunsuzsa azaltır.
    Returns: sonraki döngü için güncel delay değeri.
    """
    exchange = ccxt.mexc({"options": {"defaultType": "swap"}})
    exchange.timeout = 20000

    try:
        symbols = await _get_zero_fee_symbols(exchange)
        if not symbols:
            print("[CoinCollector] Zero-fee sembol bulunamadı.")
            return current_delay

        # Piyasa geneli verileri çek (5 dk cache — funding rate, fear/greed)
        redis = get_redis()
        market_data = await _fetch_market_data(exchange, redis)

        stats = {"ok": 0, "fail": 0, "rate_limited": 0}
        semaphore = asyncio.Semaphore(BATCH_CONCURRENCY)
        t0 = time.monotonic()

        # Tüm coinleri paralel çalıştır (semaphore ile kontrollü)
        tasks = [
            _process_coin(exchange_client=exchange, sym_info=sym,
                          semaphore=semaphore, delay=current_delay, stats=stats,
                          market_data=market_data)
            for sym in symbols
        ]
        await asyncio.gather(*tasks)

        elapsed = time.monotonic() - t0

        # Delay otomatik ayarla
        new_delay = current_delay
        if stats["rate_limited"] > 0:
            new_delay = min(current_delay * 2, COIN_DELAY_MAX)
            print(f"[CoinCollector] Rate limit ({stats['rate_limited']}x) → delay {current_delay:.2f}s → {new_delay:.2f}s")
        elif stats["rate_limited"] == 0 and current_delay > COIN_DELAY:
            new_delay = max(current_delay * 0.7, COIN_DELAY)

        print(f"[CoinCollector] Döngü: {stats['ok']}✓ {stats['fail']}✗ {stats['rate_limited']}⚠ / {len(symbols)} ({elapsed:.1f}s) delay={new_delay:.2f}s concurrency={BATCH_CONCURRENCY}")
        return new_delay

    except Exception as e:
        print(f"[CoinCollector] Döngü hatası: {e}")
        return min(current_delay * 1.5, COIN_DELAY_MAX)
    finally:
        try:
            await exchange.close()
        except Exception:
            pass


async def start_coin_collector():
    """Arka plan görevi: sürekli zero-fee coinleri tara, rate limit'e göre hız ayarla."""
    print("[CoinCollector] Coin veri toplayıcı başladı (parallel batch, adaptive rate limit).")

    await asyncio.sleep(60)  # DB init + diğer servisler hazır olsun

    delay = COIN_DELAY
    while True:
        try:
            delay = await run_collection_cycle(delay)
        except Exception as e:
            print(f"[CoinCollector] Kritik hata: {e}")
            delay = min(delay * 2, COIN_DELAY_MAX)

        await asyncio.sleep(UPDATE_INTERVAL)
