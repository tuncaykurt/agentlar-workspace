"""
Arbitraj Stratejisi için Blankly / Simülasyon Stres Testi
Bu dosya, ArbitrageHedgeStrategy'nin geçmiş/simüle edilmiş fonlama oranları 
üzerinde ne kadar kâr getirdiğini ölçmek için tasarlanmıştır.

Kullanım:
1. `pip install numpy blankly pandas`
2. `python test_arbitrage_blankly.py`
"""

import time
import numpy as np
import pandas as pd
from bot.strategies.arbitrage_hedge import ArbitrageHedgeStrategy

def generate_mock_funding_rates(n_steps=1000):
    """
    Simülasyon için 3 farklı borsanın fonlama oranlarını rastgele üretir.
    MEXC: Daha volatil (ortalama +0.0005)
    Bybit: Daha stabil (ortalama 0.0)
    Bitget: Daha düşük (ortalama -0.0002)
    """
    np.random.seed(42)
    mexc_rates = np.random.normal(0.0005, 0.0003, n_steps)
    bybit_rates = np.random.normal(0.0000, 0.0001, n_steps)
    bitget_rates = np.random.normal(-0.0002, 0.0002, n_steps)

    return pd.DataFrame({
        "mexc": mexc_rates,
        "bybit": bybit_rates,
        "bitget": bitget_rates
    })

def run_stress_test():
    print("--- Fonlama Arbitrajı (Delta-Neutral) Stres Testi Başlıyor ---")
    
    # 1. Stratejiyi başlat
    strategy = ArbitrageHedgeStrategy(min_spread=0.001, convergence_threshold=0.0002)
    
    # 2. Mock veriyi al (geçmiş 1000 dönem, örneğin 1000 adet 8-saatlik periyot)
    df_rates = generate_mock_funding_rates(1000)
    
    # 3. Test Değişkenleri
    active_arbitrage = None
    balance = 10_000.0  # Başlangıç kasası
    trade_size = 5_000.0  # Her bacak için kullanılacak hacim
    
    total_trades = 0
    total_profit = 0.0
    
    start_time = time.time()
    
    for i, row in df_rates.iterrows():
        current_rates = {
            "mexc": row["mexc"],
            "bybit": row["bybit"],
            "bitget": row["bitget"]
        }
        
        # Eğer açık işlem yoksa, girmeyi dene
        if not active_arbitrage:
            result = strategy.calculate(current_rates)
            if result["signal"] == "open_arbitrage":
                active_arbitrage = result["action"]
                # Simülasyon gereği: Short yüksek olanda, Long düşük olanda açıldı
                # Fonlama maliyeti/getirisi hesaplaması bir sonraki bar tahsil edilir
                
        # Eğer açık işlem varsa, hem getiri hesapla hem de kapatma durumunu kontrol et
        else:
            short_exch = active_arbitrage["short_exchange"]
            long_exch = active_arbitrage["long_exchange"]
            
            # Fonlama geliri tahsilatı: 
            # Short pozisyonunda: rate pozitifse bize ödenir (rate * size)
            # Long pozisyonunda: rate negatifse bize ödenir (-rate * size)
            short_income = current_rates[short_exch] * trade_size
            long_income = -current_rates[long_exch] * trade_size
            
            period_profit = short_income + long_income
            total_profit += period_profit
            balance += period_profit
            
            # Kapanış kontrolü
            updates = strategy.check_updates(active_arbitrage, current_rates)
            for u in updates:
                if u["action"] == "close_arbitrage":
                    # Makas kapandı, işlemi sonlandır
                    active_arbitrage = None
                    total_trades += 1
                    break
    
    end_time = time.time()
    
    print(f"\nTest Tamamlandı! (Süre: {end_time - start_time:.4f} saniye)")
    print(f"Toplam İşlem Sayısı (Aç/Kapat Döngüsü): {total_trades}")
    print(f"Başlangıç Bakiyesi: $10,000.00")
    print(f"Bitiş Bakiyesi:     ${balance:.2f}")
    print(f"Net Fonlama Kârı:   ${total_profit:.2f}")
    print(f"Kâr Yüzdesi:        %{(total_profit/10_000)*100:.2f}")
    print("----------------------------------------------------------")

if __name__ == "__main__":
    run_stress_test()
