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


def clamp_tp_sl(ai_tp: float, ai_sl: float, leverage: int, coin_atr_pct: float = None) -> tuple:
    """
    TP/SL'yi kaldıraç ve coin volatilitesine göre dinamik optimize et.

    Felsefe (v2 — Daha Agresif & Karlı):
    - TP: Coin'in gerçek ATR kapasitesinin %70-85'ini hedefle → ulaşılabilir ama yeterli kar
    - SL: ATR'nin %40-50'si → gürültü filtrelenir ama SL çok geniş değil
    - R:R minimum 1.5:1 → her kazanç 1.5 kaybı karşılar
    - Tasfiyeden güvenli → asla likidasyon
    - Düşük ATR coinlerde daha sıkı, yüksek ATR'de daha geniş

    Args:
        ai_tp: AI'ın önerdiği TP% (veya kullanıcı ayarı)
        ai_sl: AI'ın önerdiği SL%
        leverage: Kullanılacak kaldıraç
        coin_atr_pct: Coin'in ATR% değeri (gerçek volatilite). None ise sadece kaldıraç bazlı.

    Returns:
        (tp_pct, sl_pct) — optimize edilmiş değerler
    """
    liq_dist = 100.0 / max(1, leverage)

    # ── Tasfiye güvenlik sınırları (kesin) ──
    hard_max_sl = round(liq_dist * 0.40, 4)  # Tasfiyenin max %40'ı (daha sıkı SL)
    hard_max_tp = round(liq_dist * 0.80, 4)  # Tasfiyenin max %80'i (daha geniş TP)
    hard_min_sl = max(0.05, round(liq_dist * 0.06, 4))
    hard_min_tp = max(0.10, round(liq_dist * 0.15, 4))

    tp, sl = ai_tp, ai_sl

    # ── ATR-bazlı dinamik optimizasyon ──
    if coin_atr_pct and coin_atr_pct > 0:
        # ATR büyüklüğüne göre katsayı ayarla
        # Düşük ATR → daha yakın hedef (volatilite düşük, büyük hareket zor)
        # Yüksek ATR → daha geniş hedef (volatilite yüksek, büyük hareket kolay)
        if coin_atr_pct < 0.3:
            # Çok düşük volatilite — yeterli hareket yok, dar hedef
            tp_mult = 0.70
            sl_mult = 0.45
        elif coin_atr_pct < 0.8:
            # Orta-düşük volatilite — dengeli
            tp_mult = 0.75
            sl_mult = 0.45
        elif coin_atr_pct < 1.5:
            # Normal volatilite — standart
            tp_mult = 0.80
            sl_mult = 0.48
        elif coin_atr_pct < 3.0:
            # Yüksek volatilite — geniş hedef
            tp_mult = 0.85
            sl_mult = 0.50
        else:
            # Çok yüksek volatilite — maksimum hareket potansiyeli
            tp_mult = 0.90
            sl_mult = 0.55

        target_tp = round(coin_atr_pct * tp_mult, 4)
        target_sl = round(coin_atr_pct * sl_mult, 4)

        # TP: AI ve ATR hedefinin BÜYÜK olanı (daha geniş TP = daha çok kar)
        tp = max(ai_tp, target_tp, hard_min_tp)

        # SL: ATR hedefi veya AI — AMA çok geniş olmamalı
        sl_floor = max(coin_atr_pct * 0.25, hard_min_sl)  # Minimum nefes payı
        sl = max(min(ai_sl, target_sl), sl_floor)

    # ── Tasfiye güvenliği (kesin sınır) ──
    tp = max(hard_min_tp, min(tp, hard_max_tp))
    sl = max(hard_min_sl, min(sl, hard_max_sl))

    # ── R:R minimum 1.5:1 — her kazanç 1.5 kaybı karşılasın ──
    if tp <= sl * 1.5:
        tp = round(sl * 1.6, 4)
        if tp > hard_max_tp:
            # TP sığmıyorsa SL'yi küçült
            sl = round(hard_max_tp / 1.6, 4)
            tp = hard_max_tp

    return round(tp, 4), round(sl, 4)


def _build_exit_strategy_section(bot_config: dict = None) -> str:
    """Bot ayarlarına göre AI'a hangi exit stratejilerini kullanabileceğini bildir."""
    cfg = bot_config or {}
    hedge_on = cfg.get("hedge_enabled", False)
    trailing_on = cfg.get("trailing_enabled", False)

    lines = ["Her seçim için ÇIKIŞ STRATEJİSİ belirle:"]
    lines.append('- "normal_tp_sl": Sabit TP/SL ile riski sınırla (HER ZAMAN kullanılabilir)')

    if trailing_on:
        activate = cfg.get("trailing_activate_pct", 0.3)
        callback = cfg.get("trailing_callback_pct", 0.15)
        lines.append(f'- "trailing": Güçlü trend + yüksek ADX (>30) → trailing stop (aktivasyon: %{activate}, geri çekilme: %{callback})')
    else:
        lines.append('- "trailing": ❌ KAPALI — kullanıcı trailing stop\'u devre dışı bıraktı, BU STRATEJİYİ SEÇME!')

    if hedge_on:
        h_tp = cfg.get("hedge_tp_pct", 0.4)
        h_sl = cfg.get("hedge_sl_pct", 0.2)
        lines.append(f'- "hedge": Çift yönlü hedge (TP: %{h_tp}, SL: %{h_sl}) — yön belirsiz ama hareket kesin olduğunda')
    else:
        lines.append('- "hedge": ❌ KAPALI — kullanıcı hedge işlemi devre dışı bıraktı, BU STRATEJİYİ SEÇME!')

    # TP/SL sınırları
    tp_pct = cfg.get("tp_pct", 1.5)
    sl_pct = cfg.get("sl_pct", 0.8)
    lines.append(f'\nKullanıcı TP/SL ayarları: Max TP=%{tp_pct}, Max SL=%{sl_pct}')
    lines.append('Bu değerleri AŞMA — kaldıraca göre daha da daraltılabilir.')

    return "\n".join(lines)


def build_ai_prompt(coins: list[dict], active_positions: list[str] = None,
                    leverage_range: tuple = None, max_selections: int = 3,
                    past_performance: dict = None,
                    bot_config: dict = None) -> str:
    """
    AI coin seçimi için kapsamlı prompt oluştur.
    Tüm coin verilerini analiz ederek en iyi fırsatları belirler.
    leverage_range: (min, max) kaldıraç aralığı
    """
    active_str = ", ".join(active_positions) if active_positions else "Yok"
    min_lev = leverage_range[0] if leverage_range else 3
    max_lev = leverage_range[1] if leverage_range else 75

    # Coin verilerini tablo formatında hazırla
    def _v(val, default=0):
        """None-safe: dict.get() key varsa None dönebilir, bunu yakala."""
        return default if val is None else val
        
    def _t(dir_val):
        """Trend direction to arrow."""
        return '↑' if dir_val==1 else '↓' if dir_val==-1 else '—'

    coin_rows = []
    for c in coins:
        mtf = c.get("mtf", {})
        m5 = mtf.get("5m", {})
        m15 = mtf.get("15m", {})
        h4 = mtf.get("4h", {})
        
        mtf_str = (f"5m[{_t(m5.get('trend'))} R:{_v(m5.get('rsi'))}] "
                   f"15m[{_t(m15.get('trend'))} R:{_v(m15.get('rsi'))}] "
                   f"4h[{_t(h4.get('trend'))} R:{_v(h4.get('rsi'))}]")

        news_list = c.get("news", [])
        news_str = " | Haberler: " + " / ".join(news_list) if news_list else ""
        
        ls = c.get("ls_ratio")
        ls_str = f"L/S:{ls.get('long_pct')}%-{ls.get('short_pct')}%" if ls else "L/S:?"

        liq = c.get("liquidations", {})
        liq_total = liq.get('total_usd', 0) / 1000
        liq_str = f"Liq:${liq_total:.1f}K({liq.get('signal', '?')})" if liq_total > 0 else "Liq:$0"

        coin_rows.append(
            f"  {c.get('base','?'):>8} | "
            f"${_v(c.get('price')):>12,.4f} | "
            f"{_v(c.get('price_change_24h')):>+7.2f}% | "
            f"1h Trend:{_t(c.get('supertrend_dir'))} | "
            f"1h RSI:{_v(c.get('rsi_14')):>5.1f} | "
            f"MTF: {mtf_str} | "
            f"{ls_str} | "
            f"{liq_str} | "
            f"ATR%:{_v(c.get('atr_pct')):>6.3f} | "
            f"ADX:{_v(c.get('adx')):>5.1f} | "
            f"Vol:{_v(c.get('volume_ratio')):>4.1f}x | "
            f"MACD:{_v(c.get('macd_hist')):>+10.6f} | "
            f"BB:[{_v(c.get('bb_lower')):>.2f}-{_v(c.get('bb_upper')):>.2f}]{news_str}"
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

    # ── Geçmiş performans özeti ──
    perf_section = ""
    if past_performance:
        total = past_performance.get("total", 0)
        wins = past_performance.get("wins", 0)
        losses = past_performance.get("losses", 0)
        win_rate = past_performance.get("win_rate", 0)
        avg_win = past_performance.get("avg_win_pct", 0)
        avg_loss = past_performance.get("avg_loss_pct", 0)
        total_pnl = past_performance.get("total_pnl_pct", 0)

        # Strateji bazlı performans
        strat_perf = past_performance.get("by_strategy", {})
        strat_lines = []
        for strat_name, sp in strat_perf.items():
            strat_lines.append(
                f"  {strat_name}: {sp.get('count', 0)} işlem, "
                f"Kazanma: %{sp.get('win_rate', 0):.0f}, "
                f"Ort Kâr: %{sp.get('avg_pnl', 0):+.2f}"
            )

        # Son kapanan işlemler (öğrenme)
        recent_lines = []
        for rt in past_performance.get("recent_trades", []):
            result_emoji = "+" if rt.get("pnl_pct", 0) >= 0 else ""
            recent_lines.append(
                f"  {rt.get('coin','?')} {rt.get('direction','?').upper()} "
                f"Lev:{rt.get('leverage','?')}x → {result_emoji}{rt.get('pnl_pct', 0):.2f}% "
                f"({rt.get('exit_reason','?')}) Strateji:{rt.get('strategy','?')}"
            )

        # En çok kazandıran/kaybettiren coinler
        best_coins = past_performance.get("best_coins", [])
        worst_coins = past_performance.get("worst_coins", [])

        perf_section = f"""
═══════════════════════════════════════════════════════════════
              GEÇMİŞ İŞLEM PERFORMANSI (ÖĞRENİM VERİSİ)
═══════════════════════════════════════════════════════════════
Toplam: {total} işlem | Kazanma: {wins} | Kayıp: {losses} | Oran: %{win_rate:.0f}
Ort Kazanç: %{avg_win:+.2f} | Ort Kayıp: %{avg_loss:+.2f} | Net PnL: %{total_pnl:+.2f}

Çıkış Stratejisi Bazlı Performans:
{chr(10).join(strat_lines) if strat_lines else '  Henüz veri yok'}

En İyi Coinler: {', '.join(best_coins) if best_coins else 'Henüz veri yok'}
En Kötü Coinler: {', '.join(worst_coins) if worst_coins else 'Henüz veri yok'}

Son Kapanan İşlemler:
{chr(10).join(recent_lines) if recent_lines else '  Henüz veri yok'}

⚠️ GEÇMİŞTEN ÖĞREN:
- Hangi exit stratejisi (trailing/normal_tp_sl/hedge) hangi piyasa koşulunda daha iyi performans gösterdi?
- Kaybedilen işlemlerde ortak patern ne? Aynı hatayı tekrarlama!
- Kazanan coinleri benzer koşullarda tekrar değerlendir
- Trailing stop güçlü trendlerde, normal TP/SL yatay piyasalarda daha iyi çalışır
"""

    return f"""Sen dünyanın en iyi kripto futures traderısın. Görevin: aşağıdaki tüm coinleri analiz ederek
en yüksek kâr potansiyeline sahip EN FAZLA {max_selections} coin seç ve işlem yönü belirle. {max_selections}'den fazla seçme!

{_build_exit_strategy_section(bot_config)}

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
{perf_section}
═══════════════════════════════════════════════════════════════
                    TÜM COİN VERİLERİ
     Coin |        Fiyat |   24h%  | 1h Trend | 1h RSI | MTF: 5m, 15m, 4h (Trend+RSI) | L/S Oranı | Likidasyon |  ATR%  |  ADX  | Hacim | MACD Hist | Bollinger Bandı
{coin_table}

═══════════════════════════════════════════════════════════════
              ANALİZ ÇERÇEVEN (BUNLARIN HEPSİNİ KULLAN)
═══════════════════════════════════════════════════════════════

1. ÇOKLU ZAMAN DİLİMİ (MTF) ANALİZİ:
   - 4h Trend ile 1h Trend aynı yönde mi? (Büyük resim konfirmasyonu)
   - 5m ve 15m RSI aşırı alım/satımda mı? (Kısa vadeli mükemmel giriş noktası)
   - 1h Trend yukarıyken 15m RSI diplerdeyse (pullback), harika bir LONG fırsatıdır.
   - Farklı zaman dilimlerinde zıtlıklar varsa (4h bullish, 15m bearish) temkinli ol.

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

5. FUNDING RATE, L/S RATIO, LİKİDASYON & SENTİMENT ANALİZİ:
   - Funding Rate: Negatif = short kalabalık (long squeeze potansiyeli)
   - Funding Rate: Pozitif ve yüksek (>0.05%) = long kalabalık (short squeeze potansiyeli)
   - Long/Short Oranı (L/S): Eğer Long %65'in üzerindeyse piyasa aşırı iyimserdir, balinalar onları likide etmek için aşağı vurabilir (Short fırsatı). Short %65'in üzerindeyse tam tersi (Long fırsatı).
   - Likidasyon (Liq): 'shorts_liquidated' sinyali varsa büyük bir short pozisyonu patlatılmış demektir, fiyat fırlayabilir (Short Squeeze). 'longs_liquidated' varsa tam tersi.
   - Fear & Greed: <25 = Aşırı korku → kontrarian alım fırsatı
   - Haberler (Varsa): Olumlu gelişmeler (ortaklık, listeleme) hacimle destekleniyorsa LONG fırsatı. Kötü haberler varsa (hack, dava) grafiği iyi olsa bile pas geç.

6. RİSK DEĞERLENDİRMESİ & KALDIRAC:
   - Kaldıraç ARALIGI: Minimum {min_lev}x — Maksimum {max_lev}x
   - ANCAK her coinin borsadaki max kaldıracını (Lev sütunu) AŞMA!
   - Volatiliteye göre kaldıraç seç: Yüksek ATR% → düşük kaldıraç, düşük ATR% → yüksek kaldıraç
   - ATR% > 2 → max {min(max_lev, 15)}x | ATR% 1-2 → max {min(max_lev, 30)}x | ATR% < 0.5 → {max_lev}x'e kadar
   - ATR% çok düşük (< 0.2%) coin → İŞLEM AÇMA, yeterli hareket yok
   - Kayıp senaryosu: SL nereye konulmalı, risk/ödül oranı ne?
   - Açık pozisyonlarla korelasyon: Aynı yönde çok pozisyon riskli

   ⚠️ KRİTİK — TP/SL STRATEJİSİ (ATR + KALDIRAC BAZLI):

   TEMEL PRENSİP: TP coin'in gerçek hareket kapasitesine (ATR%) yakın olmalı!
   Çok uzak TP = asla ulaşılmaz, SL tetiklenir. Yakın TP = daha çok win!

   FORMÜL (ATR bazlı — BUNU KULLAN):
     tp_suggestion_pct ≈ coin'in ATR% × 0.55   (yarım ATR = 1-2 mumda ulaşılır)
     sl_suggestion_pct ≈ coin'in ATR% × 0.70   (gürültüyü tolere eder)

   GÜVENLİK SINIRI (tasfiye mesafesi = 100 / kaldıraç):
     TP hiçbir zaman tasfiye mesafesinin %75'ini geçmemeli
     SL hiçbir zaman tasfiye mesafesinin %45'ini geçmemeli

   ÖRNEKLER (ATR'ye göre):
   | Coin ATR% | Kaldıraç | İdeal TP%  | İdeal SL%  | Neden?                    |
   |-----------|----------|------------|------------|---------------------------|
   | 0.3%      | 50x      | 0.17%      | 0.21%      | Düşük vol → dar hedef     |
   | 0.8%      | 25x      | 0.44%      | 0.56%      | Orta vol → orta hedef     |
   | 1.5%      | 20x      | 0.83%      | 1.05%      | Yüksek vol → geniş hedef  |
   | 2.5%      | 10x      | 1.38%      | 1.75%      | Çok vol → en geniş hedef  |

   ÖNEMLİ:
   - ATR% düşük coin → düşük kaldıraç kullan (hareket yok = kazanç yok)
   - ATR% yüksek coin → yüksek kaldıraç tehlikeli (çok volatil)
   - Her zaman TP > SL olsun (R:R ≥ 1.2)
   - tp_suggestion_pct ve sl_suggestion_pct'yi HER ZAMAN coin'in ATR%'sine göre ayarla!

7. EXIT STRATEGY (ÇIKIŞ STRATEJİSİ) SEÇİMİ:
   - normal_tp_sl: Standart trend kırılımlarında kullan.
   - trailing: Güçlü bir momentum yakaladıysan (ADX > 30 ve Volüm Yüksek) kârı sonuna kadar sürmek için seç.
   - hedge: Piyasa çok kararsızsa (F&G 45-55 arası, L/S oranı %50'lerdeyse) ve yön belli değilse her iki yöne de pozisyon açmak için seç.
   * ÖNEMLİ HEDGE KURALI: Eğer 'hedge' seçersen, sistem sermaye verimliliği için borsa limitlerindeki MAX KALDIRACI (örn: 100x-200x) kullanacaktır! Bu yüzden hedge seçtiğinde TP ve SL oranlarını dar tutmalısın.

8. DİNAMİK KALDIRAÇ (LEVERAGE) BELİRLEME METRİKLERİ:
   - Hedge harici işlemlerde kaldıracı piyasa koşullarına göre sen belirle (5x - 50x arası).
   - Volatilite (ATR) Yüksekse: Düşük kaldıraç (5x - 10x) kullan ki iğnelerde likide olma.
   - Volatilite Düşük ama Trend Güçlüyse (ADX > 25): Yüksek kaldıraç (20x - 50x) kullanabilirsin.
   - Haber (News) Kaynaklı İşlemlerde: Ani hareketler olacağı için risk yönetimi adına 10x - 15x bandını geçme.
   - ⚠️ Yukarıda KAPALI olarak işaretlenen stratejileri KESİNLİKLE SEÇME!
   - Geçmiş performanstan öğren: hangi strateji hangi koşulda daha başarılı oldu?

9. ZAMANLAMA ANALİZİ:
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
- Max {max_selections} coin seç (kalite > miktar)
- HER İŞLEM İÇİN exit_strategy BELİRLE (trailing / normal_tp_sl / hedge)
- Hedge seçersen: aynı coin üzerinde hem long hem short açılacak, TP/SL hedge'e uygun olsun

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
      "leverage_suggestion": 10,
      "entry_reason": "Neden bu coin ve bu yön — teknik nedenler",
      "risk_factors": "Dikkat edilmesi gerekenler",
      "tp_suggestion_pct": 2.5,
      "sl_suggestion_pct": 1.0,
      "exit_strategy": "trailing|normal_tp_sl|hedge",
      "exit_reason": "Bu çıkış stratejisini neden seçtin — 1 cümle",
      "trailing_callback_pct": 0.1,
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
