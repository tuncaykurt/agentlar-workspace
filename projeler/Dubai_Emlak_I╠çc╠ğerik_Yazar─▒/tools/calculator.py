#!/usr/bin/env python3
"""
Dubai Gayrimenkul Yatırım Hesap Makinesi
=========================================
[MÜŞTERİ_ADI] içerik ekibi için yatırım senaryosu hesaplamaları.

Varsayılan Metrikler:
  - Yıllık değer artışı: İlk 3 yıl %8, sonraki yıllar %7
  - Kira getirisi (ROI): %7 (ilgili yılın ev değerinin %7'si)
  - Mortgage faizi: %4.5 (varsayılan)
  - Mortgage vadesi: 20 yıl (varsayılan)

Kullanım:
  python3 calculator.py
  → Örnek senaryo ile çalışır ve Markdown tablosu basar.
"""

import math
import sys
import os

# Mevcut dizinden currency modülünü import et
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    from currency import get_exchange_rate
except ImportError:
    def get_exchange_rate(base, target): return 38.5 if target == "TRY" else 1.0

# ── Varsayılan Parametreler ──────────────────────────────────

DEFAULT_APPRECIATION_EARLY = 0.08   # İlk 3 yıl: %8
DEFAULT_APPRECIATION_LATE  = 0.07   # Sonraki yıllar: %7
EARLY_YEARS = 3                     # İlk kaç yıl yüksek artış
DEFAULT_ROI = 0.07                  # Yıllık kira getirisi: %7
DEFAULT_MORTGAGE_RATE = 0.045       # Mortgage faizi: %4.5
DEFAULT_MORTGAGE_YEARS = 20         # Mortgage vadesi: 20 yıl

# Döviz Kuru (Canlı alınamazsa fallback)
USD_TRY_RATE = get_exchange_rate("USD", "TRY")

def format_money(amount: float, currency: str = "USD") -> str:
    """Para birimini formatlar (Ör: $1,250,000 veya 48,000,000 ₺)."""
    if currency == "USD":
        return f"${amount:,.0f}"
    elif currency == "TRY":
        return f"{amount:,.0f} ₺"
    return f"{amount:,.0f} {currency}"

def format_dual_currency(amount_usd: float) -> str:
    """Hem USD hem TRY değerini döndürür."""
    amount_try = amount_usd * USD_TRY_RATE
    return f"{format_money(amount_usd, 'USD')} ({format_money(amount_try, 'TRY')})"


# ── Temel Hesaplama Fonksiyonları ────────────────────────────

def monthly_mortgage_payment(principal: float,
                              annual_rate: float = DEFAULT_MORTGAGE_RATE,
                              years: int = DEFAULT_MORTGAGE_YEARS) -> float:
    """Aylık mortgage taksidini hesapla (annuity formülü).

    Args:
        principal: Mortgage anaparası (USD)
        annual_rate: Yıllık faiz oranı (0.045 = %4.5)
        years: Vade (yıl)

    Returns:
        Aylık taksit tutarı (USD)
    """
    if principal <= 0:
        return 0.0
    monthly_rate = annual_rate / 12
    n_payments = years * 12
    if monthly_rate == 0:
        return principal / n_payments
    payment = principal * (monthly_rate * (1 + monthly_rate) ** n_payments) / \
              ((1 + monthly_rate) ** n_payments - 1)
    return round(payment, 2)


def property_value_projection(initial_value: float,
                               years: int,
                               early_rate: float = DEFAULT_APPRECIATION_EARLY,
                               late_rate: float = DEFAULT_APPRECIATION_LATE,
                               early_years: int = EARLY_YEARS) -> list[dict]:
    """Yıldan yıla gayrimenkul değer projeksiyonu.

    Args:
        initial_value: Başlangıç ev fiyatı (USD)
        years: Toplam projeksiyon yılı
        early_rate: İlk dönem yıllık değer artışı
        late_rate: Sonraki dönem yıllık değer artışı
        early_years: İlk dönemin kaç yıl süreceği

    Returns:
        Her yıl için {year, value, appreciation_rate, appreciation_amount} listesi
    """
    projections = []
    current_value = initial_value
    for y in range(1, years + 1):
        rate = early_rate if y <= early_years else late_rate
        appreciation = current_value * rate
        current_value += appreciation
        projections.append({
            "year": y,
            "value": round(current_value, 0),
            "appreciation_rate": rate,
            "appreciation_amount": round(appreciation, 0),
        })
    return projections


def annual_rental_income(property_value: float,
                          roi: float = DEFAULT_ROI) -> dict:
    """Yıllık ve aylık kira gelirini hesapla.

    Args:
        property_value: Evin güncel değeri (USD)
        roi: Yıllık kira getirisi oranı (0.07 = %7)

    Returns:
        {yearly, monthly} kira geliri
    """
    yearly = property_value * roi
    return {
        "yearly": round(yearly, 0),
        "monthly": round(yearly / 12, 0),
    }


def investment_scenario(
    property_price: float,
    downpayment_pct: float = 0.20,
    construction_years: int = 3,
    construction_payment_pct: float = 0.40,
    start_year: int = 2025,
    mortgage_rate: float = DEFAULT_MORTGAGE_RATE,
    mortgage_years: int = DEFAULT_MORTGAGE_YEARS,
    early_appreciation: float = DEFAULT_APPRECIATION_EARLY,
    late_appreciation: float = DEFAULT_APPRECIATION_LATE,
    roi: float = DEFAULT_ROI,
) -> dict:
    """Tam yatırım senaryosu hesapla.

    Args:
        property_price: Daire fiyatı (USD)
        downpayment_pct: Peşinat yüzdesi (0.20 = %20)
        construction_years: İnşaat süresi (yıl)
        construction_payment_pct: İnşaat sürecinde ödenen yüzde (peşinat dahil değil)
        start_year: Başlangıç yılı
        mortgage_rate: Mortgage faiz oranı
        mortgage_years: Mortgage vadesi
        early_appreciation: İlk 3 yıl değer artışı
        late_appreciation: Sonraki yıllar değer artışı
        roi: Kira getirisi oranı

    Returns:
        Detaylı yatırım senaryosu dict
    """
    # Peşinat
    downpayment = property_price * downpayment_pct
    remaining_after_down = property_price - downpayment

    # İnşaat taksitleri (peşinat sonrası, teslime kadar)
    construction_total = property_price * construction_payment_pct
    yearly_construction = construction_total / construction_years if construction_years > 0 else 0

    # Teslimde kalan (mortgage olacak kısım)
    total_paid_before_delivery = downpayment + construction_total
    mortgage_principal = property_price - total_paid_before_delivery

    # Aylık mortgage
    monthly_mortgage = monthly_mortgage_payment(mortgage_principal, mortgage_rate, mortgage_years)
    yearly_mortgage = monthly_mortgage * 12

    # Değer projeksiyonu (peşinat yılından itibaren)
    total_projection_years = construction_years + 1  # +1 for delivery year
    projections = property_value_projection(
        property_price, total_projection_years,
        early_appreciation, late_appreciation
    )

    # Ödeme tablosu
    payment_schedule = []
    cumulative_paid = 0

    # Peşinat yılı
    cumulative_paid += downpayment
    payment_schedule.append({
        "year": start_year,
        "payment_type": f"Peşinat (%{int(downpayment_pct*100)})",
        "amount": round(downpayment, 0),
        "cumulative": round(cumulative_paid, 0),
        "cumulative_pct": round(cumulative_paid / property_price * 100, 2),
        "property_value": property_price,
    })

    # İnşaat taksitleri
    for i in range(construction_years):
        cumulative_paid += yearly_construction
        year_idx = i  # 0-indexed for projections (peşinat yılı = year 1 of projection)
        prop_value = projections[i]["value"] if i < len(projections) else projections[-1]["value"]
        payment_schedule.append({
            "year": start_year + 1 + i,
            "payment_type": "İnşaat taksiti",
            "amount": round(yearly_construction, 0),
            "cumulative": round(cumulative_paid, 0),
            "cumulative_pct": round(cumulative_paid / property_price * 100, 2),
            "property_value": round(prop_value, 0),
        })

    # Teslim
    delivery_year = start_year + construction_years
    delivery_value = projections[construction_years - 1]["value"] if projections else property_price
    # Son yıl yarısında teslim durumu için bir ara değer
    half_year_appreciation = delivery_value * (early_appreciation if construction_years <= EARLY_YEARS else late_appreciation) * 0.5
    delivery_value_at_handover = round(delivery_value + half_year_appreciation, 0)

    cumulative_paid += mortgage_principal
    payment_schedule.append({
        "year": f"{delivery_year} ortası",
        "payment_type": f"Teslimde ödenecek (kalan %{int((1 - downpayment_pct - construction_payment_pct)*100)})",
        "amount": round(mortgage_principal, 0),
        "cumulative": round(cumulative_paid, 0),
        "cumulative_pct": 100.0,
        "property_value": delivery_value_at_handover,
    })

    # Kira geliri (teslim sonrası)
    rental = annual_rental_income(delivery_value_at_handover, roi)

    # Net aylık gelir
    monthly_net = rental["monthly"] - monthly_mortgage

    # Toplam değer artışı
    value_gain = delivery_value_at_handover - property_price

    return {
        "parameters": {
            "property_price": property_price,
            "downpayment_pct": downpayment_pct,
            "construction_years": construction_years,
            "construction_payment_pct": construction_payment_pct,
            "start_year": start_year,
            "mortgage_rate": mortgage_rate,
            "mortgage_years": mortgage_years,
            "roi": roi,
        },
        "payment_schedule": payment_schedule,
        "delivery": {
            "year": delivery_year,
            "estimated_value": delivery_value_at_handover,
            "value_gain": round(value_gain, 0),
        },
        "mortgage": {
            "principal": round(mortgage_principal, 0),
            "monthly_payment": monthly_mortgage,
            "yearly_payment": round(yearly_mortgage, 0),
            "rate": mortgage_rate,
            "years": mortgage_years,
        },
        "rental": {
            "yearly_gross": rental["yearly"],
            "monthly_gross": rental["monthly"],
            "monthly_net": round(monthly_net, 0),
            "yearly_net": round(monthly_net * 12, 0),
        },
        "summary": {
            "total_cash_invested": round(downpayment + construction_total, 0),
            "mortgage_principal": round(mortgage_principal, 0),
            "delivery_value": delivery_value_at_handover,
            "value_gain_usd": round(value_gain, 0),
            "monthly_net_income": round(monthly_net, 0),
        },
    }


# ── Markdown Tablo Formatı ───────────────────────────────────

def format_payment_table(scenario: dict) -> str:
    """Yatırım senaryosunu Markdown tablosuna çevir (referans formatta)."""
    lines = []
    schedule = scenario["payment_schedule"]

    # Ana ödeme tablosu
    lines.append("| **Yıl** | **Ödeme Tipi** | **Tutar (USD)** | **Toplam Ödenen (USD)** | **Toplam Ödeme (%)** | **Daire Değeri (USD)** |")
    lines.append("| --- | --- | --- | --- | --- | --- |")

    for row in schedule:
        lines.append(
            f"| **{row['year']}** | {row['payment_type']} | "
            f"{row['amount']:,.0f} | {row['cumulative']:,.0f} | "
            f"{row['cumulative_pct']:.2f}% | {row['property_value']:,.0f} |"
        )

    # Boş satır
    lines.append("|  |  |  |  |  |  |")

    # Özet satırları
    rental = scenario["rental"]
    mortgage = scenario["mortgage"]

    lines.append(
        f"| **Özet** | Yıllık Brüt Kira (ROI %{int(scenario['parameters']['roi']*100)}) | "
        f"{rental['yearly_gross']:,.0f} | Aylık ≈ {rental['monthly_gross']:,.0f} |  |  |"
    )
    lines.append(
        f"| **Özet** | Yıllık Mortgage Ödemesi ({mortgage['years']}y, %{mortgage['rate']*100:.1f}) | "
        f"{mortgage['yearly_payment']:,.0f} | Aylık ≈ {mortgage['monthly_payment']:,.0f} |  |  |"
    )
    lines.append(
        f"| **Özet** | Yıllık Net (Kira − Mortgage) | "
        f"{rental['yearly_net']:,.0f} | Aylık ≈ {rental['monthly_net']:,.0f} |  |  |"
    )

    return "\n".join(lines)


def format_summary(scenario: dict) -> str:
    """Yatırım senaryosunun özetini Markdown formatında döndür."""
    s = scenario["summary"]
    d = scenario["delivery"]
    m = scenario["mortgage"]
    p = scenario["parameters"]

    lines = [
        f"**Gayrimenkul Fiyatı:** {format_dual_currency(p['property_price'])}",
        f"**Peşinat:** {format_dual_currency(p['property_price'] * p['downpayment_pct'])} (%{int(p['downpayment_pct']*100)})",
        f"**Toplam Nakit Yatırım:** {format_dual_currency(s['total_cash_invested'])}",
        f"**Mortgage Anaparası:** {format_dual_currency(m['principal'])} ({m['years']} yıl, %{m['rate']*100:.1f} faiz)",
        f"**Teslim Yılı Tahmini Değer:** {format_dual_currency(d['estimated_value'])}",
        f"**Değer Artışı Kazancı:** {format_dual_currency(d['value_gain'])}",
        f"**Aylık Net Gelir:** {format_dual_currency(s['monthly_net_income'])}",
    ]
    return "\n".join(lines)


# ── Ana Çalıştırma ───────────────────────────────────────────

def run_scenario_from_args():
    """Komut satırından veya varsayılan parametrelerle senaryo çalıştır."""

    # Varsayılan test senaryosu (Script #001 ile uyumlu)
    params = {
        "property_price": 540_000,
        "downpayment_pct": 0.20,
        "construction_years": 3,
        "construction_payment_pct": 0.40,
        "start_year": 2025,
    }

    # Komut satırı argümanları (opsiyonel)
    if len(sys.argv) > 1:
        try:
            params["property_price"] = float(sys.argv[1])
        except ValueError:
            pass
    if len(sys.argv) > 2:
        try:
            params["downpayment_pct"] = float(sys.argv[2]) / 100
        except ValueError:
            pass
    if len(sys.argv) > 3:
        try:
            params["construction_years"] = int(sys.argv[3])
        except ValueError:
            pass
    if len(sys.argv) > 4:
        try:
            params["start_year"] = int(sys.argv[4])
        except ValueError:
            pass

    scenario = investment_scenario(**params)

    print("=" * 60)
    print("  DUBAI GAYRİMENKUL YATIRIM HESAP MAKİNESİ")
    print("=" * 60)
    print()
    print(format_summary(scenario))
    print()
    print("### Ödeme Tablosu")
    print()
    print(format_payment_table(scenario))
    print()
    print("---")
    print(f"*Yıllık değer artışı: İlk {EARLY_YEARS} yıl %{int(DEFAULT_APPRECIATION_EARLY*100)}, "
          f"sonrası %{int(DEFAULT_APPRECIATION_LATE*100)}. "
          f"ROI %{int(DEFAULT_ROI*100)} olarak hesaplanmıştır.*")

    # JSON çıktısı da döndür (programatik kullanım için)
    return scenario


if __name__ == "__main__":
    result = run_scenario_from_args()
