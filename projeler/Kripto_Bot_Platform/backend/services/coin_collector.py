"""
Coin Veri Toplayıcı — Zero-fee coinlerin göstergelerini arka planda toplar.

Akış:
1. Başlangıçta MEXC'den zero-fee sembol listesini çeker (1 saat cache)
2. Her 5 dakikada tüm zero-fee coinler için OHLCV verisini çeker
3. RSI, ATR, EMA200, MACD, Supertrend vb. hesaplar
4. CoinSnapshot tablosuna kaydeder (UPSERT)

Rate limit koruması: coinler arası 1sn bekleme, toplu hata durumunda 30sn pause.
"""
import asyncio
from datetime import datetime

import ccxt.async_support as ccxt
from sqlalchemy import text
from core.database import async_session
from core.redis_client import get_redis
from ai.indicators import calculate_all
import json


# Güncelleme aralığı (saniye)
UPDATE_INTERVAL = 30    # döngüler arası minimum bekleme
COIN_DELAY = 0.3        # coinler arası bekleme (rate limit)
SYMBOLS_CACHE_TTL = 3600  # 1 saat


async def _get_zero_fee_symbols(exchange_client) -> list[dict]:
    """MEXC'den zero-fee futures sembollerini çek."""
    redis = get_redis()
    cache_key = "coin_collector:zero_fee_symbols"

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    await exchange_client.load_markets()
    symbols = []
    for symbol, market in exchange_client.markets.items():
        if not market.get("swap") and not market.get("future"):
            continue
        if not market.get("active", True):
            continue
        if market.get("settle") != "USDT" and market.get("quote") != "USDT":
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
            "base": market.get("base", ""),
            "taker_fee": round(taker_fee * 100, 4),
            "maker_fee": round(maker_fee * 100, 4),
            "zero_fee": True,
            "max_leverage": max_leverage,
        })

    symbols.sort(key=lambda x: x["base"])
    await redis.set(cache_key, json.dumps(symbols), ex=SYMBOLS_CACHE_TTL)
    print(f"[CoinCollector] {len(symbols)} zero-fee sembol bulundu.")
    return symbols


async def _fetch_and_analyze(exchange_client, sym_info: dict, timeframe: str = "1h") -> dict | None:
    """Tek bir coin için OHLCV çek ve göstergeleri hesapla."""
    symbol = sym_info["symbol"]
    try:
        ohlcv = await asyncio.wait_for(
            exchange_client.fetch_ohlcv(symbol, timeframe, limit=210),
            timeout=15,
        )
    except asyncio.TimeoutError:
        print(f"[CoinCollector] OHLCV timeout: {symbol}")
        return None
    except Exception as e:
        print(f"[CoinCollector] OHLCV hatası {symbol}: {e}")
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
        "zero_fee": sym_info.get("zero_fee", False),
        "taker_fee": sym_info.get("taker_fee"),
        "maker_fee": sym_info.get("maker_fee"),
        "max_leverage": sym_info.get("max_leverage"),
    }


async def _upsert_snapshot(data: dict):
    """CoinSnapshot tablosuna UPSERT (varsa güncelle, yoksa ekle)."""
    async with async_session() as session:
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


async def run_collection_cycle():
    """Tek bir toplama döngüsü — tüm zero-fee coinleri tara."""
    exchange = ccxt.mexc({"options": {"defaultType": "swap"}})
    exchange.timeout = 20000

    try:
        symbols = await _get_zero_fee_symbols(exchange)
        if not symbols:
            print("[CoinCollector] Zero-fee sembol bulunamadı.")
            return

        ok = 0
        fail = 0
        for i, sym in enumerate(symbols):
            try:
                data = await _fetch_and_analyze(exchange, sym)
                if data:
                    await _upsert_snapshot(data)
                    ok += 1
                else:
                    fail += 1
            except Exception as e:
                fail += 1
                print(f"[CoinCollector] {sym['symbol']} hatası: {e}")

            # Rate limit koruması
            if i < len(symbols) - 1:
                await asyncio.sleep(COIN_DELAY)

        print(f"[CoinCollector] Döngü tamamlandı: {ok} başarılı, {fail} başarısız / {len(symbols)} toplam")

    except Exception as e:
        print(f"[CoinCollector] Döngü hatası: {e}")
    finally:
        try:
            await exchange.close()
        except Exception:
            pass


async def start_coin_collector():
    """Arka plan görevi: her 5 dakikada zero-fee coinleri tara."""
    print(f"[CoinCollector] Coin veri toplayıcı başladı ({UPDATE_INTERVAL}s aralık).")

    # İlk çalıştırma — 10sn bekle (DB init tamamlansın)
    await asyncio.sleep(10)

    while True:
        try:
            await run_collection_cycle()
        except Exception as e:
            print(f"[CoinCollector] Kritik hata: {e}")
            await asyncio.sleep(30)  # hata sonrası 30sn bekle

        await asyncio.sleep(UPDATE_INTERVAL)
