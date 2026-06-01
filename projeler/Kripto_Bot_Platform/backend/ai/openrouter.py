"""
OpenRouter AI İstemcisi
İki aşamalı sinyal doğrulama:
1. DeepSeek → Hızlı filtre (ucuz)
2. Claude Sonnet → Derin analiz (sadece güçlü sinyallerde)
"""
import json
import httpx
from core.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
FAST_MODEL = settings.AI_FAST_MODEL
DEEP_MODEL = settings.AI_DEEP_MODEL


async def _notify_admin_credit_exhausted():
    """OpenRouter kredisi bittiğinde admin'e push bildirim gönder ve Redis'e kaydet."""
    try:
        from core.redis_client import get_redis
        from services.push_notification import send_push
        from core.database import async_session
        from sqlalchemy import text as sql_text

        redis = get_redis()

        # Aynı uyarıyı tekrar tekrar gönderme (10 dk cooldown)
        cooldown_key = "system:alerts:openrouter_credit:cooldown"
        if await redis.get(cooldown_key):
            return
        await redis.set(cooldown_key, "1", ex=600)

        # Redis'e uyarı kaydet (admin panel okuyacak)
        import time
        await redis.set("system:alerts:openrouter_credit", json.dumps({
            "type": "openrouter_credit_exhausted",
            "message": "OpenRouter API kredisi bitti! AI analiz özellikleri devre dışı.",
            "ts": int(time.time()),
        }), ex=86400)  # 24 saat TTL

        # Admin user_id'yi bul
        async with async_session() as db:
            res = await db.execute(sql_text("SELECT id FROM users WHERE role = 'admin' LIMIT 1"))
            row = res.fetchone()
            admin_id = str(row[0]) if row else "default"

        # Push bildirim gönder
        await send_push(
            title="OpenRouter Kredi Uyarısı",
            body="OpenRouter API kredisi bitti! AI analiz özellikleri devre dışı. Lütfen kredi yükleyin.",
            data={"url": "/admin/users"},
            tag="system-openrouter",
            user_id=admin_id,
        )
        print("[OpenRouter] Admin'e kredi bitti bildirimi gönderildi")
    except Exception as e:
        print(f"[OpenRouter] Admin bildirim hatası: {e}")


async def _call(model: str, prompt: str, max_tokens: int = 600) -> dict:
    import re

    api_key = (settings.OPENROUTER_API_KEY or "").strip()
    if not api_key:
        raise Exception("OPENROUTER_API_KEY tanımlı değil")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://kriptobot.app",
        "X-Title": "KriptoBot Trading Platform",
        "Content-Type": "application/json",
    }

    # Claude için system message ile JSON zorunluluğu
    messages = []
    if "claude" in model:
        messages.append({
            "role": "system",
            "content": "You are a crypto trading analyst. Always respond with valid JSON only. No explanations, no markdown, no extra text — just the JSON object."
        })
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }
    if "deepseek" in model or "openai" in model:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(OPENROUTER_URL, headers=headers, json=payload)

        # HTTP 402 = Kredi bitti
        if r.status_code == 402:
            import asyncio
            asyncio.create_task(_notify_admin_credit_exhausted())
            raise Exception("OpenRouter API kredisi bitti (HTTP 402). Admin bilgilendirildi.")

        if not r.is_success:
            try:
                err_body = r.json()
                raise Exception(f"HTTP {r.status_code}: {err_body}")
            except Exception:
                raise Exception(f"HTTP {r.status_code}: {r.text[:300]}")

        resp = r.json()

        if "error" in resp:
            raise Exception(f"OpenRouter: {resp['error'].get('message', resp['error'])}")

        content = resp["choices"][0]["message"]["content"]

        if not content or not content.strip():
            # finish_reason kontrol
            finish = resp["choices"][0].get("finish_reason", "unknown")
            raise Exception(f"Boş yanıt (finish_reason={finish})")

        # Markdown ```json ... ``` bloğundan çıkar
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if match:
            content = match.group(1)
        else:
            match2 = re.search(r"\{.*\}", content, re.DOTALL)
            if match2:
                content = match2.group()

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise Exception(f"JSON parse hatası: {e} | İçerik: {content[:200]}")


async def quick_filter(
    symbol: str,
    side: str,
    price: float,
    rsi: float,
    macd_hist: float,
    funding_rate: float,
    volume_change_pct: float,
    fear_greed: dict = None,
    order_book: dict = None,
    mtf: dict = None,
) -> dict:
    """Aşama 1: DeepSeek hızlı filtre."""

    fg_val   = fear_greed.get("value", 50) if fear_greed else 50
    fg_label = fear_greed.get("label", "Neutral") if fear_greed else "Neutral"
    ob_signal = order_book.get("signal", "balanced") if order_book else "balanced"
    ob_ratio  = order_book.get("ratio", 0.5) if order_book else 0.5
    mtf_conf  = mtf.get("confluence", "neutral") if mtf else "neutral"
    mtf_align = mtf.get("alignment", False) if mtf else False

    prompt = f"""
Kripto futures trading asistanısın. Aşağıdaki verileri analiz et.

Sembol: {symbol} | Yön: {side.upper()} | Fiyat: ${price:,.2f}

Teknik:
- RSI: {rsi:.1f}
- MACD Histogram: {macd_hist:.4f}
- Funding Rate: {funding_rate:.4f}%
- Hacim Değişimi: {volume_change_pct:.1f}%

Piyasa Bağlamı:
- Fear & Greed: {fg_val} ({fg_label})
- Order Book: {ob_signal} (oran: {ob_ratio:.2f})
- Çoklu Zaman Dilimi: {mtf_conf} (tam uyum: {mtf_align})

Bu sinyali geçirmeli miyim? JSON:
{{"pass": true/false, "strength": 1-10, "reason": "tek cümle"}}
"""
    try:
        return await _call(FAST_MODEL, prompt, max_tokens=120)
    except Exception as e:
        return {"pass": True, "strength": 5, "reason": f"Filtre hatası: {e}"}


async def deep_analysis(
    symbol: str,
    side: str,
    price: float,
    candles: list,
    indicators: dict,
    market_context: dict,
    full_context: dict = None,
) -> dict:
    """Aşama 2: Claude derin analiz — tüm verilerle."""

    candle_summary = "\n".join([
        f"  {i+1}. A:{c[1]:.0f} Y:{c[2]:.0f} D:{c[3]:.0f} K:{c[4]:.0f} V:{c[5]:.0f}"
        for i, c in enumerate(candles[-5:])
    ])

    # Ek bağlam
    fg     = (full_context or {}).get("fear_greed", {})
    dom    = (full_context or {}).get("btc_dominance", {})
    ob     = (full_context or {}).get("order_book", {})
    whale  = (full_context or {}).get("whale", {})
    mtf    = (full_context or {}).get("mtf", {})
    news   = (full_context or {}).get("news", {})
    liq    = (full_context or {}).get("liquidations", {})

    mtf_4h  = mtf.get("timeframes", {}).get("4h", {})
    mtf_1h  = mtf.get("timeframes", {}).get("1h", {})
    mtf_15m = mtf.get("timeframes", {}).get("15m", {})

    prompt = f"""
Sen uzman bir kripto futures trader ve teknik analistisin.
Aşağıdaki kapsamlı verilere dayanarak işlem kararı ver.

═══ İŞLEM BİLGİSİ ═══
Sembol: {symbol} | Yön: {side.upper()} | Fiyat: ${price:,.2f}

═══ TEKNİK GÖSTERGELER (1s) ═══
EMA: 9={indicators.get('ema9',0):.2f} | 21={indicators.get('ema21',0):.2f} | 55={indicators.get('ema55',0):.2f}
RSI: {indicators.get('rsi',0):.1f} | MACD Hist: {indicators.get('macd_hist',0):.4f}
Bollinger: Üst={indicators.get('bb_upper',0):.0f} | Alt={indicators.get('bb_lower',0):.0f}
ATR: {indicators.get('atr',0):.2f} | Hacim Oranı: {indicators.get('vol_ratio',0):.2f}x

═══ ÇOKLU ZAMAN DİLİMİ ═══
4 Saatlik: Trend={mtf_4h.get('trend','?')} | RSI={mtf_4h.get('rsi',0):.0f} | Sinyal={mtf_4h.get('signal','yok')}
1 Saatlik:  Trend={mtf_1h.get('trend','?')} | RSI={mtf_1h.get('rsi',0):.0f} | Sinyal={mtf_1h.get('signal','yok')}
15 Dakika:  Trend={mtf_15m.get('trend','?')} | RSI={mtf_15m.get('rsi',0):.0f} | Sinyal={mtf_15m.get('signal','yok')}
Uyum: {mtf.get('confluence','neutral')} | Tam Uyum: {mtf.get('alignment',False)}

═══ PIYASA DUYGUSU ═══
Fear & Greed: {fg.get('value',50)}/100 ({fg.get('label','Neutral')}) | Dünden: {fg.get('change',0):+d}
BTC Dominance: %{dom.get('btc_dominance',50):.1f} ({dom.get('signal','neutral')})

═══ ORDER BOOK ═══
Alış Baskısı: {ob.get('ratio',0.5):.2f} | Durum: {ob.get('signal','balanced')}
Spread: ${ob.get('spread',0):.2f}

═══ WHALE HAREKETİ ═══
Tespit: {'Evet' if whale.get('whale_detected') else 'Hayır'}
Alım: {whale.get('whale_buys',0)} işlem (${whale.get('whale_buy_volume',0):,.0f})
Satım: {whale.get('whale_sells',0)} işlem (${whale.get('whale_sell_volume',0):,.0f})
Sinyal: {whale.get('signal','neutral')}

═══ FUTURES BAĞLAMI ═══
Funding Rate: {market_context.get('funding_rate',0):.4f}%
24s Hacim Değişimi: {market_context.get('volume_change',0):.1f}%

═══ LİKİDASYON (Son 24s) ═══
Long Tasfiye: {liq.get('long_liq_count',0)} işlem (${liq.get('long_liq_volume',0):,.0f})
Short Tasfiye: {liq.get('short_liq_count',0)} işlem (${liq.get('short_liq_volume',0):,.0f})
Sinyal: {liq.get('signal','neutral')}

═══ HABER SENTİMENT ═══
Skor: {news.get('sentiment_score',50)}/100 ({news.get('signal','neutral')})
Bullish Haber: {news.get('bullish_count',0)} | Bearish Haber: {news.get('bearish_count',0)}
{"Son Haber: " + news['news'][0]['title'] if news.get('news') else "Haber verisi yok"}

═══ SON 5 MUM (1s) ═══
{candle_summary}

═══ ANALİZ GÖREVİ ═══
Tüm verileri birlikte değerlendirerek:
1. {side.upper()} sinyalini onayla veya reddet
2. Güven skorunu belirle (0-100)
3. ATR bazlı stop-loss ve take-profit hesapla
4. Risk/Ödül oranını değerlendir (minimum 2:1 olmalı)

JSON formatında cevap ver:
{{
  "approved": true/false,
  "confidence": 0-100,
  "stop_loss": fiyat,
  "take_profit": fiyat,
  "risk_reward": oran,
  "risk_level": "low/medium/high",
  "analysis": "3-4 cümle kapsamlı analiz",
  "key_factors": ["en önemli 3 faktör"],
  "warnings": ["varsa uyarılar"]
}}
"""
    try:
        return await _call(DEEP_MODEL, prompt, max_tokens=1000)
    except Exception as e:
        return {
            "approved": True, "confidence": 50,
            "stop_loss": None, "take_profit": None,
            "risk_reward": 2.0, "risk_level": "medium",
            "analysis": f"AI analiz hatası: {e}",
            "key_factors": [], "warnings": [],
        }
