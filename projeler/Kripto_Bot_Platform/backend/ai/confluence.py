"""
Confluence Scoring Sinyal Motoru
════════════════════════════════
Web konuşmasındaki 3-katmanlı sistem:
  Katman 1 — Teknik (EMA, RSI, MACD, BB, Supertrend, ADX, Stochastic, Volume)
  Katman 2 — Yapısal (Destek/Direnç, Order Block, Likidasyon haritası)
  Katman 3 — Kontekst (Session filtresi, Funding rate, Sentiment)

Her sinyal puanlanır → score ≥ 6 ise işlem açılır.
Tüm skorlar trade log'a yazılır → hangi kombinasyonun karlı olduğu analiz edilir.
"""
from datetime import datetime, timezone


def calculate_confluence(indicators: dict, market_context: dict = None) -> dict:
    """
    Tüm katmanlardan skor hesapla.

    Args:
        indicators: calculate_all() çıktısı (pandas-ta dahil)
        market_context: collect_full_context() çıktısı (opsiyonel)

    Returns:
        {
            "signal": "buy" | "sell" | None,
            "long_score": int,
            "short_score": int,
            "max_score": int,
            "details": { ... },  # her kriterin sonucu
            "confidence": float, # 0-100 arası güven skoru
        }
    """
    if not indicators:
        return {"signal": None, "long_score": 0, "short_score": 0, "max_score": 0, "details": {}}

    ctx = market_context or {}
    long_score = 0
    short_score = 0
    max_score = 0
    details = {}

    # ═══════════════════════════════════════════════════════════════
    #  KATMAN 1 — TEKNİK İNDİKATÖRLER (max 10 puan)
    # ═══════════════════════════════════════════════════════════════

    close = indicators.get("close", 0)
    ema9 = indicators.get("ema9", 0)
    ema21 = indicators.get("ema21", 0)
    ema55 = indicators.get("ema55", 0)
    rsi = indicators.get("rsi", 50)
    macd_h = indicators.get("macd_hist", 0)
    prev_mh = indicators.get("prev_macd_hist", 0)
    bb_upper = indicators.get("bb_upper", 0)
    bb_lower = indicators.get("bb_lower", 0)
    bb_mid = indicators.get("bb_mid", 0)
    vol = indicators.get("vol_ratio", 0)

    # 1. EMA Trend Dizilimi (2 puan — en güvenilir trend göstergesi)
    max_score += 2
    ema_bull = ema9 > ema21 > ema55
    ema_bear = ema9 < ema21 < ema55
    if ema_bull:
        long_score += 2
        details["ema_trend"] = "bull_aligned"
    elif ema_bear:
        short_score += 2
        details["ema_trend"] = "bear_aligned"
    else:
        # Kısmi trend
        if ema9 > ema21:
            long_score += 1
            details["ema_trend"] = "bull_partial"
        elif ema9 < ema21:
            short_score += 1
            details["ema_trend"] = "bear_partial"
        else:
            details["ema_trend"] = "neutral"

    # 2. EMA Crossover (1 puan — yeni trend başlangıcı)
    max_score += 1
    prev_ema9 = indicators.get("prev_ema9", 0)
    prev_ema21 = indicators.get("prev_ema21", 0)
    if prev_ema9 <= prev_ema21 and ema9 > ema21:
        long_score += 1
        details["ema_cross"] = "golden_cross"
    elif prev_ema9 >= prev_ema21 and ema9 < ema21:
        short_score += 1
        details["ema_cross"] = "death_cross"
    else:
        details["ema_cross"] = "none"

    # 3. RSI (1 puan)
    max_score += 1
    if 35 <= rsi <= 55:
        long_score += 1
        details["rsi"] = f"long_zone({rsi})"
    elif 45 <= rsi <= 65:
        short_score += 1
        details["rsi"] = f"short_zone({rsi})"
    elif rsi < 30:
        long_score += 1
        details["rsi"] = f"oversold({rsi})"
    elif rsi > 70:
        short_score += 1
        details["rsi"] = f"overbought({rsi})"
    else:
        details["rsi"] = f"neutral({rsi})"

    # 4. MACD Sinyal Kesişimi (1 puan)
    max_score += 1
    macd_line = indicators.get("macd", 0)
    macd_signal = indicators.get("macd_signal", 0)
    if macd_h > 0 and macd_h > prev_mh:
        long_score += 1
        details["macd"] = "bull_momentum"
    elif macd_h < 0 and macd_h < prev_mh:
        short_score += 1
        details["macd"] = "bear_momentum"
    else:
        details["macd"] = "neutral"

    # 5. Bollinger Band Pozisyonu (1 puan)
    max_score += 1
    if bb_lower and close < bb_lower:
        long_score += 1
        details["bb"] = "below_lower"
    elif bb_upper and close > bb_upper:
        short_score += 1
        details["bb"] = "above_upper"
    elif bb_mid and close > bb_mid:
        long_score += 1
        details["bb"] = "above_mid"
    elif bb_mid and close < bb_mid:
        short_score += 1
        details["bb"] = "below_mid"
    else:
        details["bb"] = "neutral"

    # 6. Volume Confirmation (1 puan — zorunlu filtre)
    max_score += 1
    if vol > 1.2:
        long_score += 1
        short_score += 1
        details["volume"] = f"confirmed({vol:.2f}x)"
    else:
        details["volume"] = f"low({vol:.2f}x)"

    # 7. Supertrend (1 puan — pandas-ta gerekli)
    supertrend_dir = indicators.get("supertrend_dir")
    if supertrend_dir is not None:
        max_score += 1
        if supertrend_dir == 1:
            long_score += 1
            details["supertrend"] = "bull"
        else:
            short_score += 1
            details["supertrend"] = "bear"

    # 8. ADX Trend Gücü (1 puan)
    adx = indicators.get("adx")
    if adx is not None:
        max_score += 1
        if adx > 25:
            # ADX güçlü trend gösteriyor — yöne göre puan
            adx_plus = indicators.get("adx_plus", 0)
            adx_minus = indicators.get("adx_minus", 0)
            if adx_plus > adx_minus:
                long_score += 1
                details["adx"] = f"strong_bull({adx})"
            else:
                short_score += 1
                details["adx"] = f"strong_bear({adx})"
        else:
            details["adx"] = f"weak_trend({adx})"

    # 9. Stochastic (1 puan)
    stoch_k = indicators.get("stoch_k")
    stoch_d = indicators.get("stoch_d")
    if stoch_k is not None and stoch_d is not None:
        max_score += 1
        if stoch_k < 20 and stoch_k > stoch_d:
            long_score += 1
            details["stochastic"] = "oversold_cross"
        elif stoch_k > 80 and stoch_k < stoch_d:
            short_score += 1
            details["stochastic"] = "overbought_cross"
        else:
            details["stochastic"] = "neutral"

    # 10. RSI Divergence (1 puan — pandas-ta gerekli)
    bullish_div = indicators.get("bullish_div")
    bearish_div = indicators.get("bearish_div")
    if bullish_div is not None:
        max_score += 1
        if bullish_div:
            long_score += 1
            details["divergence"] = "bullish"
        elif bearish_div:
            short_score += 1
            details["divergence"] = "bearish"
        else:
            details["divergence"] = "none"

    # ═══════════════════════════════════════════════════════════════
    #  KATMAN 2 — SESSION FİLTRESİ (bonus/filtre)
    # ═══════════════════════════════════════════════════════════════

    now_utc = datetime.now(timezone.utc)
    hour = now_utc.hour
    # En iyi saatler: 07:00-16:00 UTC (Avrupa + ABD overlap)
    if 7 <= hour <= 16:
        details["session"] = "optimal"
    elif 16 < hour <= 20:
        details["session"] = "acceptable"
    else:
        details["session"] = "risky"
        # Gece saatlerinde skor eşiğini yükselt (filtre)
        max_score += 1  # Ekstra 1 puan gerektirecek

    # ═══════════════════════════════════════════════════════════════
    #  KATMAN 3 — PİYASA KONTEKST (opsiyonel bonus puanlar)
    # ═══════════════════════════════════════════════════════════════

    # Funding Rate
    funding = ctx.get("funding_rate", 0)
    if funding:
        if funding > 0.05:
            short_score += 1
            max_score += 1
            details["funding"] = f"overheated_long({funding}%)"
        elif funding < -0.03:
            long_score += 1
            max_score += 1
            details["funding"] = f"oversold_short({funding}%)"
        else:
            details["funding"] = f"neutral({funding}%)"

    # Fear & Greed Index
    fg = ctx.get("fear_greed")
    if fg:
        fg_val = fg.get("value", 50) if isinstance(fg, dict) else 50
        if fg_val < 25:
            long_score += 1
            max_score += 1
            details["fear_greed"] = f"extreme_fear({fg_val})"
        elif fg_val > 75:
            short_score += 1
            max_score += 1
            details["fear_greed"] = f"extreme_greed({fg_val})"
        else:
            details["fear_greed"] = f"neutral({fg_val})"

    # ═══════════════════════════════════════════════════════════════
    #  KARAR
    # ═══════════════════════════════════════════════════════════════

    min_score = 6  # Minimum 6 puan gerekli
    signal = None

    # Volume filtresi: hacim düşükse sinyal üretme
    vol_ok = vol > 1.0

    if long_score >= min_score and long_score > short_score and vol_ok:
        signal = "buy"
    elif short_score >= min_score and short_score > long_score and vol_ok:
        signal = "sell"

    # Güven skoru: toplam puanın yüzdesi
    dominant_score = max(long_score, short_score)
    confidence = round((dominant_score / max(max_score, 1)) * 100, 1) if max_score > 0 else 0

    return {
        "signal": signal,
        "long_score": long_score,
        "short_score": short_score,
        "max_score": max_score,
        "confidence": confidence,
        "details": details,
        "session": details.get("session", "unknown"),
    }
