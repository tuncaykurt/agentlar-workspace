"""
Funding Rate Arbitraj Stratejisi (Delta-Neutral)
- 3 farklı borsa (MEXC, Bybit, Bitget vb.) arasındaki fonlama oranlarını kıyaslar.
- Bir borsada çok yüksek pozitif (longlar shortlara ödüyor), diğerinde negatif (shortlar longlara ödüyor) ise:
    Yüksek olanda Short, Negatif olanda Long açılır.
- Delta-neutral (yönsüz) olduğu için fiyat hareketlerinden (büyük ölçüde) etkilenmez.
- Fonlama oranları birbirine yaklaştığında pozisyonlar kapatılır.
"""

class ArbitrageHedgeStrategy:
    def __init__(
        self, 
        min_spread: float = 0.001,  # İşleme girmek için aranan minimum fark (örn: 0.1%)
        convergence_threshold: float = 0.0002,  # İşlemi kapatmak için beklenilen yakınsama seviyesi (örn: 0.02%)
    ):
        self.min_spread = min_spread
        self.convergence_threshold = convergence_threshold

    def calculate(self, exchange_rates: dict) -> dict:
        """
        exchange_rates: Örn: {"mexc": 0.0005, "bybit": -0.0008, "bitget": 0.0001}
        Dönüş: İşlem sinyali ve hangi borsada ne yapılacağı bilgisi.
        """
        if not exchange_rates or len(exchange_rates) < 2:
            return {"signal": None, "reason": "Yeterli borsa verisi yok"}

        # En yüksek ve en düşük fonlama oranlarına sahip borsaları bul
        highest_exchange = max(exchange_rates, key=exchange_rates.get)
        lowest_exchange = min(exchange_rates, key=exchange_rates.get)

        highest_rate = exchange_rates[highest_exchange]
        lowest_rate = exchange_rates[lowest_exchange]

        spread = highest_rate - lowest_rate

        signal = None
        action = None
        
        if spread >= self.min_spread:
            signal = "open_arbitrage"
            action = {
                "short_exchange": highest_exchange,
                "short_rate": highest_rate,
                "long_exchange": lowest_exchange,
                "long_rate": lowest_rate,
                "spread": spread
            }
        elif spread <= self.convergence_threshold:
            signal = "close_arbitrage"
            action = {
                "reason": "convergence",
                "spread": spread
            }

        return {
            "signal": signal,
            "action": action,
            "spread": spread,
            "rates": exchange_rates
        }

    def check_updates(self, active_arbitrage: dict, exchange_rates: dict) -> list:
        """
        Mevcut açık arbitraj işleminin durumunu kontrol eder.
        Eğer makas (spread) convergence_threshold'un altına düşerse kapatma sinyali üretir.
        """
        if not active_arbitrage or not exchange_rates:
            return []

        highest_exchange = active_arbitrage.get("short_exchange")
        lowest_exchange = active_arbitrage.get("long_exchange")
        
        if highest_exchange in exchange_rates and lowest_exchange in exchange_rates:
            current_spread = exchange_rates[highest_exchange] - exchange_rates[lowest_exchange]
            if current_spread <= self.convergence_threshold:
                return [{"action": "close_arbitrage", "reason": "spread_converged", "spread": current_spread}]
        
        return []
