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

    # MACD histogram (momentum değişimi)
    macd_hist = coin.get("macd_hist")
    if macd_hist is not None:
        if abs(macd_hist) > 0:
            # Histogram yönü trend ile uyumlu → ekstra skor
            if macd_hist > 0 and coin.get("supertrend_dir") == 1:
                score += 8  # bullish momentum + bullish trend
            elif macd_hist < 0 and coin.get("supertrend_dir") == -1:
                score += 8  # bearish momentum + bearish trend
            elif abs(macd_hist) > 0:
                score += 3  # en azından momentum var

    # Bollinger Band pozisyonu (fiyat banda yakınsa fırsat)
    bb_upper = coin.get("bb_upper")
    bb_lower = coin.get("bb_lower")
    price = coin.get("price", 0)
    if bb_upper and bb_lower and price > 0:
        bb_width = bb_upper - bb_lower
        if bb_width > 0:
            bb_pct = (price - bb_lower) / bb_width  # 0=alt band, 1=üst band
            if bb_pct < 0.1:
                score += 10  # Alt banda çok yakın → long fırsatı
            elif bb_pct < 0.2:
                score += 5
            elif bb_pct > 0.9:
                score += 10  # Üst banda çok yakın → short fırsatı
            elif bb_pct > 0.8:
                score += 5
            # Squeeze tespiti (dar band = patlama potansiyeli)
            if price > 0 and (bb_width / price * 100) < 1.0:
                score += 7  # Bollinger squeeze

    # Funding rate (negatif = short kalabalık → long fırsatı, pozitif = long kalabalık → short fırsatı)
    funding = coin.get("funding_rate")
    if funding is not None:
        if abs(funding) > 0.05:
            score += 10  # aşırı funding = yakında dönüş
        elif abs(funding) > 0.02:
            score += 5

    # Fear & Greed endeksi (aşırı korku = alım, aşırı açgözlülük = satım fırsatı)
    fg = coin.get("fear_greed")
    if fg is not None:
        if fg <= 20 or fg >= 80:
            score += 8  # aşırı bölgeler
        elif fg <= 30 or fg >= 70:
            score += 4

    return round(score, 2)


def build_ai_prompt(coins: list[dict], active_positions: list[str] = None) -> str:
    """
    AI coin seçimi için kapsamlı prompt oluştur.
    Tüm coin verilerini analiz ederek en iyi fırsatları belirler.
    """
    active_str = ", ".join(active_positions) if active_positions else "Yok"

    # Coin verilerini tablo formatında hazırla
    def _v(val, default=0):
        """None-safe: dict.get() key varsa None dönebilir, bunu yakala."""
        return default if val is None else val

    coin_rows = []
    for c in coins:
        coin_rows.append(
            f"  {c.get('base','?'):>8} | "
            f"${_v(c.get('price')):>12,.4f} | "
            f"{_v(c.get('price_change_24h')):>+7.2f}% | "
            f"RSI:{_v(c.get('rsi_14')):>5.1f} | "
            f"ATR%:{_v(c.get('atr_pct')):>6.3f} | "
            f"ADX:{_v(c.get('adx')):>5.1f} | "
            f"Trend:{'↑' if c.get('supertrend_dir')==1 else '↓' if c.get('supertrend_dir')==-1 else '—'} | "
            f"Vol:{_v(c.get('volume_ratio')):>4.1f}x | "
            f"EMA200:{_v(c.get('ema200_dist')):>+7.2f}% | "
            f"MACD:{_v(c.get('macd_hist')):>+10.6f} | "
            f"BB:[{_v(c.get('bb_lower')):>.2f}-{_v(c.get('bb_upper')):>.2f}] | "
            f"Fund:{_v(c.get('funding_rate'), 0):>+.4f}% | "
            f"Lev:{c.get('max_leverage') or '?'}x"
        )
    coin_table = "\n".join(coin_rows)

    # Piyasa genel durumu
    bullish_count = sum(1 for c in coins if c.get("supertrend_dir") == 1)
    bearish_count = sum(1 for c in coins if c.get("supertrend_dir") == -1)
    rsi_vals = [c["rsi_14"] for c in coins if c.get("rsi_14") is not None]
    avg_rsi = sum(rsi_vals) / max(1, len(rsi_vals)) if rsi_vals else 50.0
    oversold = [c["base"] for c in coins if c.get("rsi_14") and c["rsi_14"] < 30]
    overbought = [c["base"] for c in coins if c.get("rsi_14") and c["rsi_14"] > 70]
    high_vol = [c["base"] for c in coins if c.get("volume_ratio") and c["volume_ratio"] > 2]
    strong_trend = [c["base"] for c in coins if c.get("adx") and c["adx"] > 30]

    # Yeni metrikler
    fear_greed = next((c["fear_greed"] for c in coins if c.get("fear_greed") is not None), None)
    fg_label = "?"
    if fear_greed is not None:
        if fear_greed <= 25: fg_label = f"{fear_greed} (Aşırı Korku → ALIM fırsatı)"
        elif fear_greed <= 45: fg_label = f"{fear_greed} (Korku)"
        elif fear_greed <= 55: fg_label = f"{fear_greed} (Nötr)"
        elif fear_greed <= 75: fg_label = f"{fear_greed} (Açgözlülük)"
        else: fg_label = f"{fear_greed} (Aşırı Açgözlülük → SATIŞ sinyali)"

    neg_funding = [c["base"] for c in coins if c.get("funding_rate") is not None and c["funding_rate"] < -0.02]
    pos_funding = [c["base"] for c in coins if c.get("funding_rate") is not None and c["funding_rate"] > 0.05]

    return f"""Sen dünyanın en iyi kripto futures traderısın. Görevin: aşağıdaki tüm coinleri analiz ederek
en yüksek kâr potansiyeline sahip 1-3 coin seç ve işlem yönü belirle.

═══════════════════════════════════════════════════════════════
                    PIYASA GENEL DURUMU
═══════════════════════════════════════════════════════════════
Toplam Coin: {len(coins)}
Bullish: {bullish_count} | Bearish: {bearish_count}
Ortalama RSI: {avg_rsi:.1f}
Fear & Greed Index: {fg_label}
Aşırı Satım (RSI<30): {', '.join(oversold) if oversold else 'Yok'}
Aşırı Alım (RSI>70): {', '.join(overbought) if overbought else 'Yok'}
Yüksek Hacim (>2x): {', '.join(high_vol) if high_vol else 'Yok'}
Güçlü Trend (ADX>30): {', '.join(strong_trend) if strong_trend else 'Yok'}
Negatif Funding (short kalabalık): {', '.join(neg_funding) if neg_funding else 'Yok'}
Yüksek Funding (long kalabalık): {', '.join(pos_funding) if pos_funding else 'Yok'}
Mevcut Açık Pozisyonlar: {active_str}

═══════════════════════════════════════════════════════════════
                    TÜM COİN VERİLERİ
═══════════════════════════════════════════════════════════════
     Coin |        Fiyat |   24h%  |  RSI  |  ATR%  |  ADX  | Trend | Hacim | EMA200 Mesafe | MACD Hist  | Bollinger Bandı | Funding | Kaldıraç
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

5. FUNDING RATE & SENTİMENT ANALİZİ:
   - Funding Rate: Negatif = short kalabalık (long squeeze potansiyeli)
   - Funding Rate: Pozitif ve yüksek (>0.05%) = long kalabalık (short squeeze potansiyeli)
   - Fear & Greed: <25 = Aşırı korku → kontrarian alım fırsatı
   - Fear & Greed: >75 = Aşırı açgözlülük → risk yüksek, dikkatli ol
   - Funding + RSI birlikte değerlendir: negatif funding + oversold = güçlü long sinyal

6. RİSK DEĞERLENDİRMESİ:
   - Kaldıraç uygunluğu: Volatiliteye göre kaldıraç seç
   - Kayıp senaryosu: SL nereye konulmalı, risk/ödül oranı ne?
   - Açık pozisyonlarla korelasyon: Aynı yönde çok pozisyon riskli

7. ZAMANLAMA ANALİZİ:
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
    """Manuel modda işlem yönü belirle — trend, RSI, EMA200 ve funding rate ile."""
    if criteria.trade_direction in ("long", "short"):
        return criteria.trade_direction

    # auto: çoklu sinyal ile karar ver
    trend = coin.get("supertrend_dir")
    rsi = coin.get("rsi_14", 50)
    ema_dist = coin.get("ema200_dist", 0)
    funding = coin.get("funding_rate")

    # Puanlama sistemi: pozitif = long, negatif = short
    direction_score = 0

    # Trend sinyali
    if trend == 1:
        direction_score += 2
    elif trend == -1:
        direction_score -= 2

    # EMA200 pozisyonu
    if ema_dist and ema_dist > 0:
        direction_score += 1
    elif ema_dist and ema_dist < 0:
        direction_score -= 1

    # RSI aşırı bölgeleri
    if rsi and rsi < 30:
        direction_score += 2  # oversold → long fırsatı
    elif rsi and rsi > 70:
        direction_score -= 2  # overbought → short fırsatı

    # Funding rate (kontrarian sinyal)
    if funding is not None:
        if funding < -0.03:
            direction_score += 2  # aşırı negatif funding = short kalabalık → long squeeze potansiyeli
        elif funding < -0.01:
            direction_score += 1
        elif funding > 0.05:
            direction_score -= 2  # aşırı pozitif funding = long kalabalık → short squeeze potansiyeli
        elif funding > 0.02:
            direction_score -= 1

    return "long" if direction_score >= 0 else "short"
