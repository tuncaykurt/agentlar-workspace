"""
MEXC WebSocket Feeder — Zero-fee coinlerin anlık fiyatlarını Redis'e yazar.

Akış:
1. coin_snapshots'tan aktif zero-fee coinleri oku
2. MEXC Futures WS'e bağlan → ticker aboneliği aç
3. Gelen fiyatları Redis'e yaz: ticker:mexc:{symbol}
4. Periyodik olarak coin listesini yenile (yeni coin eklendiyse)

Scanner simulator ve diğer servisler Redis'ten anlık fiyat okur.
REST fetch_ticker() yerine ~0ms'de fiyat alır.
"""
import asyncio
import json
import websockets
from sqlalchemy import text as sql_text

from core.database import async_session
from core.redis_client import get_redis

MEXC_WS_URL = "wss://contract.mexc.com/edge"
REFRESH_INTERVAL = 300  # Coin listesini 5dk'da bir yenile
MAX_SUBS_PER_WS = 50    # Bir WS bağlantısında max abone sayısı


async def _get_zero_fee_symbols() -> list[str]:
    """DB'den zero-fee coin sembollerini oku."""
    try:
        async with async_session() as session:
            result = await session.execute(sql_text("""
                SELECT DISTINCT symbol FROM coin_snapshots
                WHERE zero_fee = true AND price > 0
            """))
            return [row[0] for row in result.fetchall() if row[0]]
    except Exception as e:
        print(f"[MEXC-WS] Coin listesi hatası: {e}")
        return []


def _to_mexc_symbol(ccxt_symbol: str) -> str:
    """BTC/USDT:USDT → BTC_USDT"""
    try:
        base = ccxt_symbol.split("/")[0]
        quote = ccxt_symbol.split("/")[1].split(":")[0]
        return f"{base}_{quote}"
    except Exception:
        return ""


def _to_ccxt_symbol(mexc_symbol: str) -> str:
    """BTC_USDT → BTC/USDT:USDT"""
    try:
        parts = mexc_symbol.split("_")
        return f"{parts[0]}/{parts[1]}:{parts[1]}"
    except Exception:
        return ""


async def _run_ws_feeder(symbols: list[str]):
    """Bir WS bağlantısı üzerinden ticker verisi al → Redis'e yaz."""
    redis = get_redis()
    retry_count = 0

    subscribe_msgs = []
    for sym in symbols:
        mexc_sym = _to_mexc_symbol(sym)
        if mexc_sym:
            subscribe_msgs.append({
                "method": "sub.ticker",
                "param": {"symbol": mexc_sym},
            })

    if not subscribe_msgs:
        return

    while True:
        try:
            async with websockets.connect(
                MEXC_WS_URL,
                ping_interval=None,
                ping_timeout=None,
                close_timeout=10,
            ) as ws:
                retry_count = 0

                # Abonelikleri gönder
                for msg in subscribe_msgs:
                    await ws.send(json.dumps(msg))
                    await asyncio.sleep(0.05)  # Rate limit — MEXC bazen reddeder
                print(f"[MEXC-WS] {len(subscribe_msgs)} ticker aboneliği gönderildi")

                # Keep-alive: 20s'de bir ping
                async def keep_alive():
                    while True:
                        await asyncio.sleep(20)
                        try:
                            await ws.send(json.dumps({"method": "ping"}))
                        except Exception:
                            break

                ping_task = asyncio.create_task(keep_alive())
                msg_count = 0
                try:
                    async for raw in ws:
                        try:
                            data = json.loads(raw)
                        except (json.JSONDecodeError, TypeError):
                            continue

                        channel = data.get("channel", "")
                        if channel == "pong" or data.get("method") == "pong":
                            continue

                        if channel != "push.ticker":
                            continue

                        tick = data.get("data", {})
                        if not tick:
                            continue

                        raw_sym = data.get("symbol", "") or tick.get("symbol", "")
                        if not raw_sym:
                            continue

                        ccxt_sym = _to_ccxt_symbol(raw_sym)
                        if not ccxt_sym:
                            continue

                        last_price = tick.get("lastPrice") or tick.get("last")
                        if not last_price:
                            continue

                        ticker_data = {
                            "symbol": ccxt_sym,
                            "last": float(last_price),
                            "bid": float(tick.get("bid1", last_price) or last_price),
                            "ask": float(tick.get("ask1", last_price) or last_price),
                            "high24h": float(tick.get("high24Price", 0) or 0),
                            "low24h": float(tick.get("low24Price", 0) or 0),
                            "volume24h": float(tick.get("volume24", 0) or 0),
                            "ts": data.get("ts", 0),
                        }

                        await redis.set(
                            f"ticker:mexc:{ccxt_sym}",
                            json.dumps(ticker_data),
                            ex=120,
                        )

                        msg_count += 1
                        if msg_count == 1:
                            print(f"[MEXC-WS] İlk ticker alındı: {ccxt_sym} = ${float(last_price):,.4f}")
                        elif msg_count % 5000 == 0:
                            print(f"[MEXC-WS] {msg_count} ticker mesajı işlendi")

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
    print("[MEXC-WS] Başlatılıyor...")
    await asyncio.sleep(60)  # coin_collector'ın veri toplamasını bekle

    current_symbols: list[str] = []
    ws_task: asyncio.Task | None = None

    while True:
        try:
            # Coin listesini güncelle
            new_symbols = await _get_zero_fee_symbols()
            if not new_symbols:
                print("[MEXC-WS] Henüz coin verisi yok — 30s bekleniyor")
                await asyncio.sleep(30)
                continue

            # Coin listesi değiştiyse WS'i yeniden başlat
            if set(new_symbols) != set(current_symbols) or ws_task is None or ws_task.done():
                if ws_task and not ws_task.done():
                    ws_task.cancel()
                    try:
                        await ws_task
                    except (asyncio.CancelledError, Exception):
                        pass

                current_symbols = new_symbols
                print(f"[MEXC-WS] {len(current_symbols)} coin için ticker aboneliği başlatılıyor")
                ws_task = asyncio.create_task(_run_ws_feeder(current_symbols))

        except Exception as e:
            print(f"[MEXC-WS] Feeder yönetim hatası: {e}")

        await asyncio.sleep(REFRESH_INTERVAL)
