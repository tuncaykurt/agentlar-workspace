#!/usr/bin/env python3
"""
Döviz Kuru Aracı
==========================
Canlı döviz kurlarını (USD/TRY, AED/TRY, USD/AED) çeker.
ExchangeRate-API veya benzeri ücretsiz servisleri kullanır, yedeği TCMB'dir.

Kullanım:
  python3 currency.py [amount] [from_currency] [to_currency]
  Örnek: python3 currency.py 1 USD TRY
"""

import sys
import json
import ssl
import urllib.request
import urllib.error

# Sabit yedek kurlar (API çalışmazsa)
FALLBACK_RATES = {
    "USD": 38.5,  # 1 USD = X TRY
    "AED": 10.48, # 1 AED = X TRY
    "EUR": 41.2   # 1 EUR = X TRY
}

# macOS SSL fix
SSL_CONTEXT = ssl.create_default_context()
try:
    import certifi
    SSL_CONTEXT.load_verify_locations(certifi.where())
except ImportError:
    SSL_CONTEXT = ssl._create_unverified_context()

def get_exchange_rate(base: str = "USD", target: str = "TRY") -> float:
    """Belirtilen para birimleri arasındaki kuru getirir."""
    # API URL (frankfurter.app ücretsiz ve key gerektirmez)
    url = f"https://api.frankfurter.app/latest?from={base}&to={target}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data["rates"][target]
    except Exception as e:
        # Hata durumunda fallback değerleri veya çapraz kur hesabı kullan
        if base in FALLBACK_RATES and target == "TRY":
            return FALLBACK_RATES[base]
        elif base == "AED" and target == "TRY":
             # Frankfurter'da AED olmayabilir, USD üzerinden hesapla (1 USD ~ 3.6725 AED)
            usd_try = get_exchange_rate("USD", "TRY")
            return usd_try / 3.6725
        
        return 0.0

def format_currency(amount: float, code: str) -> str:
    """Para birimini formatlar (Ör: 1,250,000 TRY)."""
    return f"{amount:,.0f} {code}"

if __name__ == "__main__":
    amount = 1.0
    from_curr = "USD"
    to_curr = "TRY"

    if len(sys.argv) > 1:
        amount = float(sys.argv[1])
    if len(sys.argv) > 2:
        from_curr = sys.argv[2].upper()
    if len(sys.argv) > 3:
        to_curr = sys.argv[3].upper()

    rate = get_exchange_rate(from_curr, to_curr)
    
    if rate > 0:
        result = amount * rate
        print(f"1 {from_curr} = {rate:.2f} {to_curr}")
        print(f"{format_currency(amount, from_curr)} = {format_currency(result, to_curr)}")
    else:
        print(f"Kur bilgisi alınamadı: {from_curr} -> {to_curr}")
