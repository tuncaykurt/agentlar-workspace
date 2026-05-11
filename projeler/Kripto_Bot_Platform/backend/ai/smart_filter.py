"""
AI Destekli Akıllı Filtre Servisi
OpenRouter üzerinden AI modelleri kullanarak sinyalleri analiz eder.

Modeller:
- DeepSeek Chat: Hızlı analiz, pattern recognition (ucuz, hızlı)
- Perplexity Sonar Pro: İnternet araştırması, güncel haber analizi (online)
"""
import json
from datetime import datetime, timedelta
from ai.openrouter import _call
from core.config import settings

FAST = settings.AI_FAST_MODEL          # deepseek — hızlı, ucuz
SEARCH = settings.AI_SEARCH_MODEL      # perplexity — internet araştırması


async def ai_news_analysis(symbol: str, signal_type: str, upcoming_events: list[dict]) -> dict:
    """
    Haber Filtresi — AI ile ekonomik olayların kripto etkisini analiz eder.
    Perplexity (internet erişimli) kullanır: güncel haber + takvim analizi.
    """
    coin = symbol.split("/")[0]  # ETH/USDT:USDT → ETH

    events_text = ""
    if upcoming_events:
        for ev in upcoming_events[:5]:
            events_text += f"  - {ev.get('title','')} ({ev.get('country','')}) | Etki: {ev.get('impact','')} | {ev.get('minutes_until',0)} dk sonra\n"
    else:
        events_text = "  Yaklaşan önemli ekonomik olay yok.\n"

    prompt = f"""Sen kripto piyasa analisti ve risk yöneticisisin.

Şu an {coin} için bir {signal_type.upper()} sinyali geldi. Fiyat üzerinde etkisi olabilecek güncel gelişmeleri analiz et.

═══ EKONOMİK TAKVİM (Yaklaşan Olaylar) ═══
{events_text}

═══ GÖREV ═══
1. Bu olayların {coin} fiyatı üzerindeki olası etkisini değerlendir
2. Şu an piyasada {signal_type.upper()} pozisyon açmak uygun mu?
3. Güncel kripto piyasa ortamını değerlendir (volatilite, trend, sentiment)

JSON formatında cevap ver:
{{
  "should_block": true/false,
  "risk_level": "low/medium/high/critical",
  "reason": "2-3 cümle Türkçe açıklama",
  "news_summary": "Güncel piyasa durumu ve haberlerin 1 cümlelik özeti",
  "confidence": 0-100
}}"""

    try:
        result = await _call(SEARCH, prompt, max_tokens=400)
        return {
            "should_block": result.get("should_block", False),
            "risk_level": result.get("risk_level", "medium"),
            "reason": result.get("reason", ""),
            "news_summary": result.get("news_summary", ""),
            "confidence": result.get("confidence", 50),
        }
    except Exception as e:
        return {
            "should_block": False,
            "risk_level": "unknown",
            "reason": f"AI haber analizi hatası: {str(e)[:100]}",
            "news_summary": "",
            "confidence": 0,
        }


async def ai_self_learning_analysis(
    symbol: str,
    signal_type: str,
    price: float,
    rsi: float | None,
    atr: float | None,
    ema200_dist: float | None,
    past_signals: list[dict],
    current_hour_utc: int,
) -> dict:
    """
    Öz-Öğrenme Filtresi — Geçmiş sinyallerden pattern çıkarır.
    DeepSeek (hızlı) kullanır.

    past_signals: Son 100 sinyalin listesi:
    [{action, signal_type, price, tp_price, sl_price, outcome, rsi_14,
      volatility_atr, ema200_dist, created_at, duration_minutes,
      max_price_in_range, min_price_in_range}]
    """
    if len(past_signals) < 5:
        return {
            "should_block": False,
            "reason": "Yeterli geçmiş sinyal yok (min 5)",
            "patterns": {},
            "confidence": 0,
        }

    # Saat bazında başarı oranı
    hour_stats = {}
    for s in past_signals:
        if s.get("outcome") not in ("tp_hit", "sl_hit"):
            continue
        try:
            h = datetime.fromisoformat(s["created_at"]).hour
        except Exception:
            continue
        if h not in hour_stats:
            hour_stats[h] = {"tp": 0, "sl": 0}
        if s["outcome"] == "tp_hit":
            hour_stats[h]["tp"] += 1
        else:
            hour_stats[h]["sl"] += 1

    hour_text = ""
    for h in sorted(hour_stats.keys()):
        st = hour_stats[h]
        total = st["tp"] + st["sl"]
        wr = round(st["tp"] / total * 100) if total > 0 else 0
        hour_text += f"  {h:02d}:00 UTC → {st['tp']}W/{st['sl']}L (WR: %{wr}) [{total} işlem]\n"

    # RSI bazında başarı
    rsi_stats = {"low": {"tp": 0, "sl": 0}, "mid": {"tp": 0, "sl": 0}, "high": {"tp": 0, "sl": 0}}
    for s in past_signals:
        if s.get("outcome") not in ("tp_hit", "sl_hit") or not s.get("rsi_14"):
            continue
        r = float(s["rsi_14"])
        bucket = "low" if r < 35 else "high" if r > 65 else "mid"
        if s["outcome"] == "tp_hit":
            rsi_stats[bucket]["tp"] += 1
        else:
            rsi_stats[bucket]["sl"] += 1

    rsi_text = ""
    for zone, label in [("low", "RSI < 35 (aşırı satım)"), ("mid", "RSI 35-65 (nötr)"), ("high", "RSI > 65 (aşırı alım)")]:
        st = rsi_stats[zone]
        total = st["tp"] + st["sl"]
        if total > 0:
            wr = round(st["tp"] / total * 100)
            rsi_text += f"  {label} → {st['tp']}W/{st['sl']}L (WR: %{wr})\n"

    # Sinyal yönü bazında başarı
    dir_stats = {"buy": {"tp": 0, "sl": 0}, "sell": {"tp": 0, "sl": 0}}
    for s in past_signals:
        if s.get("outcome") not in ("tp_hit", "sl_hit"):
            continue
        d = s.get("signal_type", "buy")
        if s["outcome"] == "tp_hit":
            dir_stats[d]["tp"] += 1
        else:
            dir_stats[d]["sl"] += 1

    dir_text = ""
    for d in ("buy", "sell"):
        st = dir_stats[d]
        total = st["tp"] + st["sl"]
        if total > 0:
            wr = round(st["tp"] / total * 100)
            dir_text += f"  {d.upper()} → {st['tp']}W/{st['sl']}L (WR: %{wr})\n"

    # Son 15 sinyalin trend analizi
    recent_15 = [s for s in past_signals if s.get("outcome") in ("tp_hit", "sl_hit")][-15:]
    recent_text = ""
    for s in recent_15:
        recent_text += f"  {s.get('signal_type','?').upper()} @ ${s.get('price',0):.2f} | RSI:{s.get('rsi_14','?')} | Sonuç:{s.get('outcome','?')} | Max:{s.get('max_price_in_range','?')} Min:{s.get('min_price_in_range','?')}\n"

    # Fiyat aralığı analizi (max/min spread)
    range_text = ""
    for s in past_signals:
        if s.get("max_price_in_range") and s.get("min_price_in_range") and s.get("price"):
            p = float(s["price"])
            mx = float(s["max_price_in_range"])
            mn = float(s["min_price_in_range"])
            if p > 0:
                up_pct = round((mx - p) / p * 100, 2)
                down_pct = round((p - mn) / p * 100, 2)
                range_text += f"  {s.get('signal_type','?').upper()} @ ${p:.0f} → Yukarı: %{up_pct} | Aşağı: %{down_pct} | Sonuç: {s.get('outcome','?')}\n"

    total_signals = len([s for s in past_signals if s.get("outcome") in ("tp_hit", "sl_hit")])
    total_tp = len([s for s in past_signals if s.get("outcome") == "tp_hit"])
    total_sl = len([s for s in past_signals if s.get("outcome") == "sl_hit"])
    overall_wr = round(total_tp / total_signals * 100) if total_signals > 0 else 0

    prompt = f"""Sen kripto trading veri analistisin. Geçmiş sinyal verilerini analiz ederek mevcut sinyal hakkında karar ver.

═══ MEVCUT SİNYAL ═══
Sembol: {symbol} | Yön: {signal_type.upper()} | Fiyat: ${price:,.2f}
RSI: {rsi or '?'} | ATR: {atr or '?'} | EMA200 Mesafe: {ema200_dist or '?'}%
Şu anki saat: {current_hour_utc:02d}:00 UTC

═══ GENEL PERFORMANS ({total_signals} sinyal) ═══
Genel Win Rate: %{overall_wr} ({total_tp}W/{total_sl}L)

═══ SAAT BAZLI BAŞARI ═══
{hour_text or '  Yeterli veri yok'}

═══ RSI BAZLI BAŞARI ═══
{rsi_text or '  Yeterli veri yok'}

═══ YÖN BAZLI BAŞARI ═══
{dir_text or '  Yeterli veri yok'}

═══ SON 15 SİNYAL (trend analizi) ═══
{recent_text or '  Yeterli veri yok'}

═══ FİYAT ARALIĞI ANALİZİ (sinyal sonrası hareket) ═══
{range_text or '  Yeterli veri yok'}

═══ ANALİZ GÖREVİ ═══
Yukarıdaki verilere dayanarak:
1. Bu saat diliminde ({current_hour_utc:02d}:00) {signal_type.upper()} sinyalleri tarihsel olarak başarılı mı?
2. Mevcut RSI ({rsi or '?'}) seviyesinde geçmiş başarı oranı nasıl?
3. Son sinyallerde bir kayıp/kazanç serisi (streak) var mı? Trend ne yönde?
4. Fiyat hareketlerinin aralığı (spread) bu sinyal türü için tipik mi?
5. Bu koşullarda sinyal işleme alınmalı mı?

JSON formatında cevap ver:
{{
  "should_block": true/false,
  "confidence": 0-100,
  "reason": "3-4 cümle Türkçe detaylı analiz (hangi pattern'ları gördüğünü açıkla)",
  "patterns": {{
    "hour_favorable": true/false,
    "rsi_favorable": true/false,
    "direction_favorable": true/false,
    "recent_trend": "winning/losing/mixed",
    "risk_level": "low/medium/high"
  }},
  "suggestion": "Kısa öneri (ör: 'Bu saat diliminde sell sinyalleri %30 başarılı, dikkatli ol')"
}}"""

    try:
        result = await _call(FAST, prompt, max_tokens=600)
        return {
            "should_block": result.get("should_block", False),
            "confidence": result.get("confidence", 50),
            "reason": result.get("reason", ""),
            "patterns": result.get("patterns", {}),
            "suggestion": result.get("suggestion", ""),
        }
    except Exception as e:
        return {
            "should_block": False,
            "confidence": 0,
            "reason": f"AI öz-öğrenme analizi hatası: {str(e)[:100]}",
            "patterns": {},
            "suggestion": "",
        }


async def ai_trend_volatility_analysis(
    symbol: str,
    signal_type: str,
    price: float,
    rsi: float | None,
    atr: float | None,
    ema200_val: float | None,
    ema200_dist: float | None,
    recent_candles: list | None,
) -> dict:
    """
    Trend + Volatilite birleşik AI analizi.
    DeepSeek (hızlı) kullanır.
    """
    candle_text = ""
    if recent_candles and len(recent_candles) >= 5:
        for i, c in enumerate(recent_candles[-10:]):
            body_pct = round(abs(c[4] - c[1]) / c[1] * 100, 3) if c[1] > 0 else 0
            direction = "▲" if c[4] > c[1] else "▼"
            candle_text += f"  {direction} O:{c[1]:.0f} H:{c[2]:.0f} L:{c[3]:.0f} C:{c[4]:.0f} V:{c[5]:.0f} (body: %{body_pct})\n"

    prompt = f"""Sen teknik analiz uzmanısın. Trend ve volatilite durumunu değerlendir.

═══ SİNYAL ═══
{symbol} | {signal_type.upper()} | Fiyat: ${price:,.2f}

═══ İNDİKATÖRLER ═══
RSI(14): {rsi or '?'}
ATR: {atr or '?'}
EMA200: {ema200_val or '?'} (mesafe: {ema200_dist or '?'}%)
Fiyat {'ÜSTÜNDE' if ema200_val and price > ema200_val else 'ALTINDA'} EMA200

═══ SON 10 MUM ═══
{candle_text or '  Mum verisi yok'}

═══ ANALİZ ═══
1. Trend yönü ve gücü nedir?
2. Volatilite mevcut sinyal için uygun mu (çok yüksek = tehlikeli, çok düşük = yetersiz hareket)?
3. {signal_type.upper()} sinyali trend ile uyumlu mu?
4. RSI aşırı bölgelerde mi?

JSON cevap ver:
{{
  "should_block": true/false,
  "trend_direction": "bullish/bearish/sideways",
  "trend_strength": "strong/moderate/weak",
  "volatility_level": "low/normal/high/extreme",
  "trend_aligned": true/false,
  "reason": "2-3 cümle Türkçe açıklama",
  "confidence": 0-100
}}"""

    try:
        result = await _call(FAST, prompt, max_tokens=400)
        return {
            "should_block": result.get("should_block", False),
            "trend_direction": result.get("trend_direction", "sideways"),
            "trend_strength": result.get("trend_strength", "moderate"),
            "volatility_level": result.get("volatility_level", "normal"),
            "trend_aligned": result.get("trend_aligned", True),
            "reason": result.get("reason", ""),
            "confidence": result.get("confidence", 50),
        }
    except Exception as e:
        return {
            "should_block": False,
            "trend_direction": "unknown",
            "trend_strength": "unknown",
            "volatility_level": "unknown",
            "trend_aligned": True,
            "reason": f"AI trend analizi hatası: {str(e)[:100]}",
            "confidence": 0,
        }
