"""
Sinyal Endpoint'leri
- /signals/custom      : Frontend JS indikatörlerinden gelen sinyaller
- /signals/webhook/tv/{token} : TradingView alarm webhook'u
"""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from datetime import datetime
import json

router = APIRouter(prefix="/signals", tags=["signals"])


class CustomSignal(BaseModel):
    symbol: str
    type: str           # "buy" | "sell"
    price: float
    source: str         # indikatör adı
    reason: str = ""


@router.post("/custom")
async def post_custom_signal(sig: CustomSignal):
    """
    Frontend özel indikatöründen gelen sinyali Redis'e yaz.
    Bot engine 'custom_signal' stratejisi ile bunu okur.
    """
    try:
        from core.redis_client import get_redis
        redis = get_redis()

        payload = {
            "symbol": sig.symbol,
            "type":   sig.type,
            "price":  sig.price,
            "source": sig.source,
            "reason": sig.reason,
            "ts":     datetime.utcnow().isoformat(),
        }

        # Sembol bazlı son sinyal — bot engine buradan okur
        key = f"custom_signal:{sig.symbol.replace('/', '_').replace(':', '_')}"
        await redis.set(key, json.dumps(payload), ex=300)   # 5 dakika geçerli

        # Sinyal geçmişi (son 50)
        hist_key = f"custom_signal_history:{sig.symbol.replace('/', '_').replace(':', '_')}"
        await redis.lpush(hist_key, json.dumps(payload))
        await redis.ltrim(hist_key, 0, 49)

        return {"status": "ok", "signal": payload}

    except Exception as e:
        # Redis yoksa sessizce geç (grafik çalışmaya devam etsin)
        return {"status": "no_redis", "error": str(e)}


@router.get("/custom/{symbol}")
async def get_custom_signal(symbol: str):
    """Son özel sinyali döner."""
    try:
        from core.redis_client import get_redis
        redis = get_redis()
        key = f"custom_signal:{symbol.replace('/', '_').replace(':', '_')}"
        raw = await redis.get(key)
        if not raw:
            return {"signal": None}
        return {"signal": json.loads(raw)}
    except:
        return {"signal": None}


@router.get("/custom/{symbol}/history")
async def get_signal_history(symbol: str, limit: int = 20):
    """Sinyal geçmişini döner."""
    try:
        from core.redis_client import get_redis
        redis = get_redis()
        hist_key = f"custom_signal_history:{symbol.replace('/', '_').replace(':', '_')}"
        items = await redis.lrange(hist_key, 0, limit - 1)
        return {"history": [json.loads(i) for i in items]}
    except:
        return {"history": []}


# ─── TradingView Webhook ───────────────────────────────────────────────────────

@router.post("/webhook/tv/{token}")
async def tradingview_webhook(token: str, request: Request):
    """
    TradingView alarm webhook'u.

    TV Alarm Mesajı (JSON formatında):
    {
      "action": "{{strategy.order.action}}",   // buy | sell | long | short
      "symbol": "{{ticker}}",
      "price":  {{close}},
      "message": "{{strategy.order.comment}}"  // isteğe bağlı açıklama
    }

    Webhook URL: http://SUNUCU_IP:8000/api/signals/webhook/tv/{token}
    """
    try:
        body = await request.json()
    except Exception:
        return {"status": "error", "reason": "invalid JSON body"}

    # Action alanını normalize et
    action_raw = str(body.get("action", body.get("side", body.get("order_action", "")))).lower().strip()
    if action_raw in ("buy", "long", "open_long", "buy_market", "1"):
        sig_type = "buy"
    elif action_raw in ("sell", "short", "open_short", "sell_market", "-1"):
        sig_type = "sell"
    else:
        return {"status": "ignored", "reason": f"unrecognized action: '{action_raw}'"}

    symbol  = str(body.get("symbol", body.get("ticker", ""))).strip()
    price   = float(body.get("price", body.get("close", body.get("last", 0))) or 0)
    message = str(body.get("message", body.get("comment", body.get("alert_message", ""))))

    payload = {
        "symbol":  symbol,
        "type":    sig_type,
        "price":   price,
        "source":  "TradingView",
        "reason":  message or f"TV Alarm — {action_raw}",
        "token":   token,
        "ts":      datetime.utcnow().isoformat(),
    }

    try:
        from core.redis_client import get_redis
        redis = get_redis()

        # Token bazlı anahtar — bot engine bu token'ı izler
        await redis.set(f"tv_webhook:{token}", json.dumps(payload), ex=600)

        # Sembol bazlı custom_signal anahtarı — mevcut bot engine ile uyumlu
        if symbol:
            sym_key = f"custom_signal:{symbol.replace('/', '_').replace(':', '_')}"
            await redis.set(sym_key, json.dumps(payload), ex=300)

        # Webhook geçmişi (son 100 istek)
        await redis.lpush(f"tv_webhook_history:{token}", json.dumps(payload))
        await redis.ltrim(f"tv_webhook_history:{token}", 0, 99)

    except Exception as e:
        # Redis yoksa kaydet ama 200 dön (TradingView retry yapar aksi halde)
        pass

    return {"status": "ok", "received": {"type": sig_type, "symbol": symbol, "price": price}}


@router.get("/webhook/tv/{token}/history")
async def tv_webhook_history(token: str, limit: int = 20):
    """Token'a ait son webhook isteklerini gösterir."""
    try:
        from core.redis_client import get_redis
        redis = get_redis()
        items = await redis.lrange(f"tv_webhook_history:{token}", 0, limit - 1)
        return {"history": [json.loads(i) for i in items]}
    except:
        return {"history": []}
