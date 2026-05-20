"""
MEXC WebSocket Feeder — Tüm futures ticker'larını anlık olarak Redis'e yazar.

MEXC WS API: wss://contract.mexc.com/edge
- sub.tickers: Tek subscribe ile TÜM coinlerin fiyatını alır (2s'de bir push)
- sub.ticker: Tek coin için (1s'de bir push, trade olduğunda)

Akış:
1. sub.tickers ile tüm coinlere abone ol (tek mesaj!)
2. Gelen fiyatları Redis'e yaz: ticker:mexc:{CCXT_SYMBOL}
3. Scanner simulator Redis'ten ~0ms'de fiyat okur

Kaynak: https://www.mexc.com/api-docs/futures/websocket-api/tickers
"""
import asyncio
import json
import websockets

from core.redis_client import get_redis

MEXC_WS_URL = "wss://contract.mexc.com/edge"


def _to_ccxt_symbol(mexc_symbol: str) -> str:
    """BTC_USDT → BTC/USDT:USDT"""
    try:
        parts = mexc_symbol.split("_")
        if len(parts) != 2:
            return ""
        return f"{parts[0]}/{parts[1]}:{parts[1]}"
    except Exception:
        return ""


async def _run_ws_all_tickers():
    """sub.tickers ile TÜM coinlerin fiyatını al → Redis'e yaz."""
    redis = get_redis()
    retry_count = 0

    while True:
        try:
            async with websockets.connect(
                MEXC_WS_URL,
                ping_interval=None,
                ping_timeout=None,
                close_timeout=10,
            ) as ws:
                retry_count = 0

                # Tek subscribe ile TÜM coinler — gzip false plaintext al
                await ws.send(json.dumps({
                    "method": "sub.tickers",
                    "param": {},
                    "gzip": False,
                }))
                print("[MEXC-WS] sub.tickers aboneliği gönderildi (TÜM coinler)")

                # Keep-alive: 15s'de bir ping (MEXC 1dk sessizlikte koparır)
                async def keep_alive():
                    while True:
                        await asyncio.sleep(15)
                        try:
                            await ws.send(json.dumps({"method": "ping"}))
                        except Exception:
                            break

                ping_task = asyncio.create_task(keep_alive())
                push_count = 0
                coin_count = 0
                try:
                    async for raw in ws:
                        try:
                            data = json.loads(raw)
                        except (json.JSONDecodeError, TypeError):
                            continue

                        channel = data.get("channel", "")

                        # Pong yanıtı
                        if channel == "pong":
                            continue

                        # sub.tickers → push.tickers (array of all tickers)
                        if channel == "push.tickers":
                            tickers = data.get("data", [])
                            if not isinstance(tickers, list):
                                continue

                            pipe = redis.pipeline()
                            batch_count = 0
                            for tick in tickers:
                                raw_sym = tick.get("symbol", "")
                                if not raw_sym:
                                    continue

                                last_price = tick.get("lastPrice")
                                if not last_price:
                                    continue

                                ccxt_sym = _to_ccxt_symbol(raw_sym)
                                if not ccxt_sym:
                                    continue

                                ticker_data = json.dumps({
                                    "symbol": ccxt_sym,
                                    "last": float(last_price),
                                    "bid": float(tick.get("maxBidPrice", last_price) or last_price),
                                    "ask": float(tick.get("minAskPrice", last_price) or last_price),
                                    "high24h": float(tick.get("high24Price", 0) or 0),
                                    "low24h": float(tick.get("lower24Price", 0) or 0),
                                    "volume24h": float(tick.get("volume24", 0) or 0),
                                    "fairPrice": float(tick.get("fairPrice", 0) or 0),
                                    "fundingRate": float(tick.get("fundingRate", 0) or 0),
                                    "holdVol": float(tick.get("holdVol", 0) or 0),
                                    "ts": tick.get("timestamp", 0),
                                })
                                pipe.set(f"ticker:mexc:{ccxt_sym}", ticker_data, ex=30)
                                batch_count += 1

                            if batch_count > 0:
                                await pipe.execute()

                            push_count += 1
                            if push_count == 1:
                                coin_count = batch_count
                                print(f"[MEXC-WS] İlk push alındı: {batch_count} coin fiyatı Redis'e yazıldı")
                            elif push_count % 500 == 0:
                                print(f"[MEXC-WS] {push_count} push işlendi ({batch_count} coin)")

                        # sub.ticker → push.ticker (single coin — açık sim varsa ekstra)
                        elif channel == "push.ticker":
                            tick = data.get("data", {})
                            raw_sym = data.get("symbol", "") or tick.get("symbol", "")
                            if not raw_sym:
                                continue
                            last_price = tick.get("lastPrice")
                            if not last_price:
                                continue
                            ccxt_sym = _to_ccxt_symbol(raw_sym)
                            if not ccxt_sym:
                                continue
                            ticker_data = json.dumps({
                                "symbol": ccxt_sym,
                                "last": float(last_price),
                                "bid": float(tick.get("bid1", last_price) or last_price),
                                "ask": float(tick.get("ask1", last_price) or last_price),
                                "high24h": float(tick.get("high24Price", 0) or 0),
                                "low24h": float(tick.get("lower24Price", 0) or 0),
                                "volume24h": float(tick.get("volume24", 0) or 0),
                                "fairPrice": float(tick.get("fairPrice", 0) or 0),
                                "fundingRate": float(tick.get("fundingRate", 0) or 0),
                                "holdVol": float(tick.get("holdVol", 0) or 0),
                                "ts": tick.get("timestamp", 0),
                            })
                            await redis.set(f"ticker:mexc:{ccxt_sym}", ticker_data, ex=30)

                finally:
                    ping_task.cancel()

        except (websockets.ConnectionClosed, ConnectionError, OSError) as e:
            retry_count += 1
            delay = min(60, 5 * retry_count)
            print(f"[MEXC-WS] Bağlantı koptu: {e} — {delay}s sonra tekrar (#{retry_count})")
            await asyncio.sleep(delay)
        except Exception as e:
            retry_count += 1
            delay = min(120, 10 * retry_count)
            print(f"[MEXC-WS] Hata: {e} — {delay}s sonra tekrar (#{retry_count})")
            await asyncio.sleep(delay)


async def start_mexc_ws_feeder():
    """Arka plan görevi: MEXC WebSocket üzerinden fiyat verisi topla."""
    print("[MEXC-WS] Başlatılıyor (sub.tickers — tüm coinler)...")
    await asyncio.sleep(30)  # Başlangıçta biraz bekle

    await _run_ws_all_tickers()
