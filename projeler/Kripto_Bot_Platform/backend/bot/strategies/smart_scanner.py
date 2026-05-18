"""
Smart Scanner Bot — Otomatik Coin Seçimi + İşlem Açma

İki mod:
1. Manuel Kriter Modu: Kullanıcı tanımlı filtreler (RSI, trend, volume, ADX vb.)
2. AI Karar Modu: Tüm göstergeleri analiz eden yapay zeka ile coin seçimi

Akış:
- coin_snapshots tablosundan tüm zero-fee coinleri oku
- Filtreleme/Skor → en iyi coin(ler)i seç
- Seçilen coin(ler) için işlem aç
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ManualCriteria:
    """Kullanıcı tanımlı seçim kriterleri."""
    # ── Trend Filtreleri ──
    trend_filter: str = "any"          # "bullish", "bearish", "any"
    min_adx: float = 0                  # Minimum ADX (trend gücü, 0=kapalı)
    ema200_position: str = "any"        # "above" (fiyat>EMA200), "below", "any"

    # ── RSI Filtreleri ──
    rsi_min: float = 0                  # Min RSI (0=kapalı)
    rsi_max: float = 100                # Max RSI (100=kapalı)
    rsi_zone: str = "any"               # "oversold"(<30), "overbought"(>70), "neutral"(30-70), "any"

    # ── Volatilite Filtreleri ──
    min_atr_pct: float = 0              # Min ATR% (0=kapalı)
    max_atr_pct: float = 100            # Max ATR%
    min_price_change_24h: float = -100  # Min 24h değişim %
    max_price_change_24h: float = 100   # Max 24h değişim %

    # ── Hacim Filtreleri ──
    min_volume_ratio: float = 0         # Min hacim oranı (0=kapalı)

    # ── Kaldıraç Filtresi ──
    min_leverage: int = 0               # Min kaldıraç (0=kapalı)

    # ── Sıralama ──
    sort_by: str = "score"              # "rsi", "atr_pct", "volume_ratio", "adx", "price_change_24h", "score"
    sort_dir: str = "desc"              # "asc", "desc"
    max_coins: int = 3                  # Aynı anda max kaç coin

    # ── İşlem Yönü ──
    trade_direction: str = "auto"       # "long", "short", "auto" (trende göre)


def score_coin_manual(coin: dict, criteria: ManualCriteria) -> Optional[float]:
    """
    Manuel kriterlere göre coin'i filtrele ve skorla.
    None dönerse = filtreden geçemedi.
    """
    # ── Trend filtresi ──
    if criteria.trend_filter == "bullish" and coin.get("supertrend_dir") != 1:
        return None
    if criteria.trend_filter == "bearish" and coin.get("supertrend_dir") != -1:
        return None

    # ── EMA200 pozisyon filtresi ──
    ema_dist = coin.get("ema200_dist")
    if criteria.ema200_position == "above" and (ema_dist is None or ema_dist <= 0):
        return None
    if criteria.ema200_position == "below" and (ema_dist is None or ema_dist >= 0):
        return None

    # ── RSI filtresi ──
    rsi = coin.get("rsi_14")
    if rsi is not None:
        if rsi < criteria.rsi_min or rsi > criteria.rsi_max:
            return None
        if criteria.rsi_zone == "oversold" and rsi >= 30:
            return None
        if criteria.rsi_zone == "overbought" and rsi <= 70:
            return None
        if criteria.rsi_zone == "neutral" and (rsi < 30 or rsi > 70):
            return None
    elif criteria.rsi_zone != "any":
        return None

    # ── ADX filtresi ──
    adx = coin.get("adx")
    if criteria.min_adx > 0 and (adx is None or adx < criteria.min_adx):
        return None

    # ── ATR% filtresi ──
    atr_pct = coin.get("atr_pct")
    if atr_pct is not None:
        if atr_pct < criteria.min_atr_pct or atr_pct > criteria.max_atr_pct:
            return None
    elif criteria.min_atr_pct > 0:
        return None

    # ── 24h değişim filtresi ──
    change = coin.get("price_change_24h")
    if change is not None:
        if change < criteria.min_price_change_24h or change > criteria.max_price_change_24h:
            return None

    # ── Hacim oranı filtresi ──
    vol = coin.get("volume_ratio")
    if criteria.min_volume_ratio > 0 and (vol is None or vol < criteria.min_volume_ratio):
        return None

    # ── Kaldıraç filtresi ──
    lev = coin.get("max_leverage")
    if criteria.min_leverage > 0 and (lev is None or lev < criteria.min_leverage):
        return None

    # ── Skor hesapla (0-100) ──
    score = 50.0  # başlangıç

    # Trend uyumu bonusu
    if coin.get("supertrend_dir") == 1:
        score += 10
    elif coin.get("supertrend_dir") == -1:
        score += 5  # bearish de fırsat olabilir (short)

    # ADX gücü (25+ güçlü trend)
    if adx:
        if adx > 40:
            score += 15
        elif adx > 25:
            score += 10
        elif adx > 15:
            score += 5

    # RSI fırsat bölgeleri
    if rsi:
        if rsi < 25:
            score += 15  # çok aşırı satım
        elif rsi < 30:
            score += 10
        elif rsi > 75:
            score += 10  # short fırsatı
        elif rsi > 70:
            score += 5

    # Hacim spike
    if vol:
        if vol > 3:
            score += 15
        elif vol > 2:
            score += 10
        elif vol > 1.5:
            score += 5

    # ATR% (volatilite = fırsat)
    if atr_pct:
        if atr_pct > 1.5:
            score += 10
        elif atr_pct > 0.5:
            score += 5

    # EMA200 mesafe (trend onayı)
    if ema_dist:
        abs_dist = abs(ema_dist)
        if abs_dist > 5:
            score += 5  # güçlü trend
        elif abs_dist < 1:
            score += 8  # EMA200'e yakın = potansiyel dönüş

    return round(score, 2)


def build_ai_prompt(coins: list[dict], active_positions: list[str] = None) -> str:
    """
    AI coin seçimi için kapsamlı prompt oluştur.
    Tüm coin verilerini analiz ederek en iyi fırsatları belirler.
    """
    active_str = ", ".join(active_positions) if active_positions else "Yok"

    # Coin verilerini tablo formatında hazırla
    coin_rows = []
    for c in coins:
        coin_rows.append(
            f"  {c.get('base','?'):>8} | "
            f"${c.get('price',0):>12,.4f} | "
            f"{c.get('price_change_24h',0):>+7.2f}% | "
            f"RSI:{c.get('rsi_14',0):>5.1f} | "
            f"ATR%:{c.get('atr_pct',0):>6.3f} | "
            f"ADX:{c.get('adx',0):>5.1f} | "
            f"Trend:{'↑' if c.get('supertrend_dir')==1 else '↓' if c.get('supertrend_dir')==-1 else '—'} | "
            f"Vol:{c.get('volume_ratio',0):>4.1f}x | "
            f"EMA200:{c.get('ema200_dist',0):>+7.2f}% | "
            f"MACD:{c.get('macd_hist',0):>+10.6f} | "
            f"BB:[{c.get('bb_lower',0):>.2f}-{c.get('bb_upper',0):>.2f}] | "
            f"Lev:{c.get('max_leverage','?')}x"
        )
    coin_table = "\n".join(coin_rows)

    # Piyasa genel durumu
    bullish_count = sum(1 for c in coins if c.get("supertrend_dir") == 1)
    bearish_count = sum(1 for c in coins if c.get("supertrend_dir") == -1)
    avg_rsi = sum(c.get("rsi_14", 50) for c in coins if c.get("rsi_14")) / max(1, sum(1 for c in coins if c.get("rsi_14")))
    oversold = [c["base"] for c in coins if c.get("rsi_14") and c["rsi_14"] < 30]
    overbought = [c["base"] for c in coins if c.get("rsi_14") and c["rsi_14"] > 70]
    high_vol = [c["base"] for c in coins if c.get("volume_ratio") and c["volume_ratio"] > 2]
    strong_trend = [c["base"] for c in coins if c.get("adx") and c["adx"] > 30]

    return f"""Sen dünyanın en iyi kripto futures traderısın. Görevin: aşağıdaki tüm coinleri analiz ederek
en yüksek kâr potansiyeline sahip 1-3 coin seç ve işlem yönü belirle.

═══════════════════════════════════════════════════════════════
                    PIYASA GENEL DURUMU
═══════════════════════════════════════════════════════════════
Toplam Coin: {len(coins)}
Bullish: {bullish_count} | Bearish: {bearish_count}
Ortalama RSI: {avg_rsi:.1f}
Aşırı Satım (RSI<30): {', '.join(oversold) if oversold else 'Yok'}
Aşırı Alım (RSI>70): {', '.join(overbought) if overbought else 'Yok'}
Yüksek Hacim (>2x): {', '.join(high_vol) if high_vol else 'Yok'}
Güçlü Trend (ADX>30): {', '.join(strong_trend) if strong_trend else 'Yok'}
Mevcut Açık Pozisyonlar: {active_str}

═══════════════════════════════════════════════════════════════
                    TÜM COİN VERİLERİ
═══════════════════════════════════════════════════════════════
     Coin |        Fiyat |   24h%  |  RSI  |  ATR%  |  ADX  | Trend | Hacim | EMA200 Mesafe | MACD Hist  | Bollinger Bandı | Kaldıraç
{coin_table}

═══════════════════════════════════════════════════════════════
              ANALİZ ÇERÇEVEN (BUNLARIN HEPSİNİ KULLAN)
═══════════════════════════════════════════════════════════════

1. MOMENTUM ANALİZİ:
   - RSI divergence: Fiyat düşerken RSI yükseliyor mu? (bullish divergence)
   - RSI aşırı bölgeler: <25 veya >75 → güçlü geri dönüş potansiyeli
   - MACD histogram yön değişimi: pozitiften negatife veya tersi
   - Hacim konfirmasyonu: Fiyat hareketi + yüksek hacim = güvenilir sinyal

2. TREND ANALİZİ:
   - Supertrend yönü: Trend değişimi yeni mi yoksa eski mi?
   - ADX gücü: <20 zayıf, 20-25 orta, 25-40 güçlü, >40 çok güçlü
   - EMA200 mesafesi: Fiyat EMA200'e yaklaşıyor mu uzaklaşıyor mu?
   - EMA200 cross potansiyeli: Fiyat EMA200'e %1 içinde mi?

3. VOLATİLİTE ANALİZİ:
   - ATR%: Yüksek ATR = büyük hareket potansiyeli
   - Bollinger Band pozisyonu: Fiyat banda yakın mı? Squeeze var mı?
   - 24h değişim vs ATR: Büyük hareket olmuş mu yoksa potansiyel mi?

4. KORELASYON ANALİZİ:
   - Çoğu coin aynı yönde mi? → Piyasa geneli hareketi
   - Farklı yönde giden coinler → Coin-spesifik fırsat
   - Sektör bazlı hareket: DeFi, Layer1, Meme coinler ayrı analiz et

5. RİSK DEĞERLENDİRMESİ:
   - Kaldıraç uygunluğu: Volatiliteye göre kaldıraç seç
   - Kayıp senaryosu: SL nereye konulmalı, risk/ödül oranı ne?
   - Açık pozisyonlarla korelasyon: Aynı yönde çok pozisyon riskli

6. ZAMANLAMA ANALİZİ:
   - Momentum zirve/dip noktasında mı?
   - Hacim spike'ı var mı? (haber etkisi olabilir)
   - Trend başlangıcı mı yoksa sonu mu?

═══════════════════════════════════════════════════════════════
                     KARAR VER
═══════════════════════════════════════════════════════════════

Kurallar:
- Zaten açık pozisyonu olan coinleri SEÇME
- Sadece güçlü, net fırsatları seç (emin değilsen "seçim yok" de)
- Risk/ödül oranı minimum 1.5:1 olmalı
- En az 2 farklı analiz katmanı aynı yönü desteklemeli
- Max 3 coin seç (kalite > miktar)

JSON formatında yanıt ver:
{{
  "market_regime": "bullish|bearish|sideways|volatile",
  "market_analysis": "Genel piyasa durumu hakkında 1-2 cümle",
  "selections": [
    {{
      "coin": "BTC",
      "symbol": "BTC/USDT:USDT",
      "direction": "long|short",
      "confidence": 75,
      "leverage_suggestion": 5,
      "entry_reason": "Neden bu coin ve bu yön — teknik nedenler",
      "risk_factors": "Dikkat edilmesi gerekenler",
      "tp_suggestion_pct": 2.5,
      "sl_suggestion_pct": 1.0,
      "priority": 1
    }}
  ],
  "skipped_reason": "Hiç coin seçilmediyse neden"
}}

Eğer hiç güvenilir fırsat yoksa selections boş array olsun ve skipped_reason yaz.
"""


def determine_trade_direction(coin: dict, criteria: ManualCriteria) -> str:
    """Manuel modda işlem yönü belirle."""
    if criteria.trade_direction in ("long", "short"):
        return criteria.trade_direction

    # auto: trende göre karar ver
    trend = coin.get("supertrend_dir")
    rsi = coin.get("rsi_14", 50)
    ema_dist = coin.get("ema200_dist", 0)

    # Güçlü sinyaller
    if trend == 1 and ema_dist and ema_dist > 0:
        return "long"  # bullish trend + EMA200 üzerinde
    if trend == -1 and ema_dist and ema_dist < 0:
        return "short"  # bearish trend + EMA200 altında

    # RSI bazlı
    if rsi and rsi < 30:
        return "long"   # oversold → long
    if rsi and rsi > 70:
        return "short"  # overbought → short

    # Trend yönü
    if trend == 1:
        return "long"
    if trend == -1:
        return "short"

    return "long"  # default
