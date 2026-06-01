"""
HFT Engine (High-Frequency Trading)
-----------------------------------
Bu motor 'uyumaz'. Saniyede 10 kere (0.1s bekleme ile) Redis'ten anlık WebSocket fiyatlarını okur.
Grid Live Engine ile entegre çalışarak Paper veya Live modda işlem yapar.

Akış:
1. Aktif HFT botlarını veritabanından oku (Sanal veya Gerçek).
2. Bu botların takip ettiği coinlerin fiyatlarını Redis'ten (ticker:mexc:SYMBOL) çek.
3. Grid Live Engine'e fiyat tick'i gönder → Grid seviye geçişlerinde işlem tetiklenir.
"""
import asyncio
import json
import time
from sqlalchemy import text as sql_text

from core.database import async_session
from core.redis_client import get_redis
from services.grid_live_engine import grid_engine

# HFT motoru bekleme süresi (Milisaniye bazında)
HFT_POLL_INTERVAL = 0.1  # Saniyede 10 kere fiyat kontrolü


async def run_hft_engine():
    """HFT Motoru Ana Döngüsü"""
    print("[HFT Engine] Başlatılıyor... (Uyumayan Motor)")
    redis = get_redis()

    # Başlangıçta biraz bekle (WebSocket'in veri toplaması için)
    await asyncio.sleep(5)

    last_db_check = 0
    last_heartbeat = 0
    active_hft_bots = []

    while True:
        try:
            now = time.time()

            # Heartbeat — her 5 saniyede Redis'e yaz (debug/monitoring)
            if now - last_heartbeat > 5:
                active_grids = await redis.keys("grid_live:running:*")
                await redis.set("hft_engine:heartbeat", json.dumps({
                    "ts": now,
                    "alive": True,
                    "active_grids": len(active_grids),
                }), ex=30)
                last_heartbeat = now

            # 1. Her 10 saniyede bir veritabanından güncel HFT bot listesini çek
            if now - last_db_check > 10:
                last_db_check = now  # Hata olsa bile tekrar tekrar sorgulamayı önle
                try:
                    async with async_session() as db:
                        res = await db.execute(sql_text(
                            "SELECT id, name, symbol, strategy, params, status::text, paper_mode "
                            "FROM bots WHERE status::text = 'running' AND strategy IN ('grid_hft', 'dual_hedge_hft')"
                        ))
                        active_hft_bots = res.mappings().all()
                except Exception as db_err:
                    print(f"[HFT Engine] DB sorgu hatası (10s sonra tekrar): {db_err}")

            # Grid Live Engine çalışıyor mu kontrol et (Tüm kullanıcılar için)
            grid_keys = await redis.keys("grid_live:running:*")
            active_users = [(k.decode('utf-8') if isinstance(k, bytes) else k).split(":")[-1] for k in grid_keys] if grid_keys else []

            # Ne HFT bot ne de Grid Live varsa kısa bir uyku
            if not active_hft_bots and not active_users:
                await asyncio.sleep(1)
                continue

            # 2. Grid Live Engine aktifse, onların sembolünü de takip et
            symbols_to_check = set()
            user_symbols = {}

            for user_id in active_users:
                state_raw = await redis.get(f"grid_live:state:{user_id}")
                if state_raw:
                    state = json.loads(state_raw)
                    grid_symbol = state.get("ccxt_symbol")
                    if grid_symbol:
                        symbols_to_check.add(grid_symbol)
                        user_symbols[user_id] = grid_symbol

            # HFT botlarının sembollerini ekle
            for b in active_hft_bots:
                if b["symbol"]:
                    symbols_to_check.add(b["symbol"])

            if not symbols_to_check:
                await asyncio.sleep(1)
                continue

            # 3. Redis'ten fiyatları toplu çek (Pipeline)
            # Symbol normalization: "BTCUSDT" → "BTC/USDT:USDT" (CCXT format)
            sym_list = list(symbols_to_check)
            pipe = redis.pipeline()
            for sym in sym_list:
                # Redis key her zaman CCXT format: ticker:mexc:BTC/USDT:USDT
                redis_sym = sym
                if "/" not in sym and sym.endswith("USDT"):
                    # "BTCUSDT" → "BTC/USDT:USDT"
                    base = sym.replace("USDT", "")
                    redis_sym = f"{base}/USDT:USDT"
                pipe.get(f"ticker:mexc:{redis_sym}")
            raw_prices = await pipe.execute()

            prices = {}
            for i, raw in enumerate(raw_prices):
                if raw:
                    data = json.loads(raw)
                    price = float(data.get("last", 0))
                    # Stale veri kontrolü: 120s'den eski fiyatları kullanma
                    ts = data.get("ts", 0)
                    if ts and (time.time() * 1000 - ts) > 120_000:
                        continue
                    if price > 0:
                        prices[sym_list[i]] = price

            # 4. Grid Live Engine'e fiyat tick'i gönder (Her kullanıcı için)
            for user_id, grid_symbol in user_symbols.items():
                if grid_symbol in prices:
                    current_price = prices[grid_symbol]
                    if current_price > 0:
                        try:
                            await grid_engine.process_tick(current_price, user_id=user_id)
                        except Exception as e:
                            print(f"[HFT Engine] Grid tick hatası (user={user_id}): {e}")

            # 5. Eski HFT botları için de temel trailing mantığı (geriye uyumluluk)
            for bot in active_hft_bots:
                sym = bot["symbol"]
                current_price = prices.get(sym)
                if not current_price:
                    continue

                # Redis'ten HFT özel ayarlarını çek (bot ID bazlı, fallback global)
                bot_id = bot.get("id", "")
                hft_raw = await redis.get(f"hft_sim:settings:{bot_id}") or await redis.get("hft_sim:settings")
                hft_params = json.loads(hft_raw) if hft_raw else {}

                target_sym = hft_params.get("symbol", "BTCUSDT")
                if sym != target_sym:
                    continue

                # Grid Live Engine zaten aktifse bu botun trailing'ini atla
                if active_users:
                    continue

                # Eski trailing mantığı (Grid Live yoksa)
                grid_upper = float(hft_params.get("upper_price", 0))
                grid_lower = float(hft_params.get("lower_price", 0))
                grid_count = int(hft_params.get("grid_count", 20))

                if grid_upper == 0 or grid_lower == 0:
                    spread_pct = float(hft_params.get("spread_pct", 5)) / 100
                    grid_upper = current_price * (1 + spread_pct)
                    grid_lower = current_price * (1 - spread_pct)
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))

                if current_price >= grid_upper:
                    diff = current_price - grid_upper
                    grid_upper = current_price
                    grid_lower = grid_lower + diff
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))

                elif current_price <= grid_lower:
                    diff = grid_lower - current_price
                    grid_lower = current_price
                    grid_upper = grid_upper - diff
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))

            # HFT Döngü Beklemesi
            await asyncio.sleep(HFT_POLL_INTERVAL)

        except asyncio.CancelledError:
            print("[HFT Engine] Kapatılıyor...")
            break
        except Exception as e:
            print(f"[HFT Engine] Döngü Hatası: {e}")
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(run_hft_engine())
