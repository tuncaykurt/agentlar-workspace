"""
HFT Engine (High-Frequency Trading)
-----------------------------------
Bu motor 'uyumaz'. Saniyede 10 kere (0.1s bekleme ile) Redis'ten anlık WebSocket fiyatlarını okur.
Dinamik Trailing Grid (İz Süren Ağ) ve Hızlı Scalper stratejilerini çalıştırır.

Akış:
1. Aktif HFT botlarını veritabanından oku (Sanal veya Gerçek).
2. Bu botların takip ettiği coinlerin fiyatlarını Redis'ten (ticker:mexc:SYMBOL) çek.
3. Fiyat Grid seviyesine ulaştıysa (veya ağ dışına taştıysa) anında işlemi tetikle.
"""
import asyncio
import json
import time
from sqlalchemy import text as sql_text

from core.database import async_session
from core.redis_client import get_redis

# HFT motoru bekleme süresi (Milisaniye bazında)
HFT_POLL_INTERVAL = 0.1  # Saniyede 10 kere fiyat kontrolü

async def run_hft_engine():
    """HFT Motoru Ana Döngüsü"""
    print("[HFT Engine] Başlatılıyor... (Uyumayan Motor)")
    redis = get_redis()
    
    # Başlangıçta biraz bekle (WebSocket'in veri toplaması için)
    await asyncio.sleep(5)
    
    last_db_check = 0
    active_hft_bots = []
    
    while True:
        try:
            now = time.time()
            
            # 1. Her 10 saniyede bir veritabanından güncel HFT bot listesini çek (Sürekli DB'yi yormamak için)
            if now - last_db_check > 10:
                async with async_session() as db:
                    # 'grid_hft' veya 'scalper_hft' stratejisi olan aktif botları al
                    res = await db.execute(sql_text(
                        "SELECT id, name, symbol, strategy, params, is_active, is_simulation "
                        "FROM bots WHERE is_active = 1 AND strategy IN ('grid_hft', 'dual_hedge_hft')"
                    ))
                    active_hft_bots = res.mappings().all()
                last_db_check = now
            
            # Aktif HFT bot yoksa kısa bir uyku
            if not active_hft_bots:
                await asyncio.sleep(1)
                continue
            
            # 2. Redis'ten aktif HFT botlarının coin fiyatlarını hızlıca çek (Toplu okuma - Pipeline)
            symbols_to_check = list(set([b["symbol"] for b in active_hft_bots if b["symbol"]]))
            if not symbols_to_check:
                await asyncio.sleep(1)
                continue
                
            pipe = redis.pipeline()
            for sym in symbols_to_check:
                pipe.get(f"ticker:mexc:{sym}")
            raw_prices = await pipe.execute()
            
            prices = {}
            for i, raw in enumerate(raw_prices):
                if raw:
                    data = json.loads(raw)
                    prices[symbols_to_check[i]] = float(data.get("last", 0))
            
            # 3. Her bot için Hızlı Karar Mekanizması
            for bot in active_hft_bots:
                sym = bot["symbol"]
                current_price = prices.get(sym)
                
                if not current_price:
                    continue # Fiyat henüz WS'den gelmedi
                
                # Redis'ten HFT özel ayarlarını çek
                hft_raw = await redis.get("hft_sim:settings")
                hft_params = json.loads(hft_raw) if hft_raw else {}
                
                # Sadece UI'dan seçilen coini işle (şimdilik)
                target_sym = hft_params.get("symbol", "BTCUSDT")
                if sym != target_sym:
                    continue

                # -- Dinamik (Trailing) Grid Algoritması (Saniyelik Karar) --
                grid_upper = float(hft_params.get("upper_price", 0))
                grid_lower = float(hft_params.get("lower_price", 0))
                grid_count = int(hft_params.get("grid_count", 20))
                
                # Eğer ağ henüz belirlenmediyse (ilk çalışma veya coin değişimi) merkezi şu anki fiyat yap
                if grid_upper == 0 or grid_lower == 0:
                    spread_pct = float(hft_params.get("spread_pct", 5)) / 100
                    grid_upper = current_price * (1 + spread_pct)
                    grid_lower = current_price * (1 - spread_pct)
                    print(f"[HFT] {sym} için yeni ağ kuruldu: {grid_lower:.4f} - {grid_upper:.4f}")
                    # Veritabanına yeni sınırları kaydet
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))
                    
                # İz Sürme (Trailing) Kuralı: Fiyat ağı yukarı kırdıysa tüm ağı yukarı kaydır
                if current_price >= grid_upper:
                    diff = current_price - grid_upper
                    grid_upper = current_price
                    grid_lower = grid_lower + diff
                    print(f"[HFT] 🚀 {sym} Trailing Up! Yeni Ağ: {grid_lower:.4f} - {grid_upper:.4f}")
                    # TODO: Kâr Al (Take Profit) sinyali üret
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))
                    
                # İz Sürme (Trailing) Kuralı: Fiyat ağı aşağı kırdıysa tüm ağı aşağı kaydır
                elif current_price <= grid_lower:
                    diff = grid_lower - current_price
                    grid_lower = current_price
                    grid_upper = grid_upper - diff
                    print(f"[HFT] 📉 {sym} Trailing Down! Yeni Ağ: {grid_lower:.4f} - {grid_upper:.4f}")
                    # TODO: Ekleme (DCA) veya Zarar Kes (Stop) sinyali üret
                    hft_params["upper_price"] = grid_upper
                    hft_params["lower_price"] = grid_lower
                    await redis.set("hft_sim:settings", json.dumps(hft_params))
                
                # TODO: Izgaraların (Gridlerin) kendi içindeki al/sat (Scalping) mantığı
                
            # HFT Döngü Beklemesi (0.1 saniye = Saniyede 10 kez tarama)
            await asyncio.sleep(HFT_POLL_INTERVAL)
            
        except asyncio.CancelledError:
            print("[HFT Engine] Kapatılıyor...")
            break
        except Exception as e:
            print(f"[HFT Engine] Döngü Hatası: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(run_hft_engine())
