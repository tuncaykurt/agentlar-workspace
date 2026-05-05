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

# Bilinen CCXT futures sembol dönüşüm tablosu
_TV_SYMBOL_MAP = {
    # BTC varyantları
    "BTCUSDT": "BTC/USDT:USDT", "BTCUSD": "BTC/USDT:USDT", "BTC": "BTC/USDT:USDT",
    "BTCUSDTPERP": "BTC/USDT:USDT", "BTCPERP": "BTC/USDT:USDT",
    # ETH
    "ETHUSDT": "ETH/USDT:USDT", "ETHUSD": "ETH/USDT:USDT",
    # SOL
    "SOLUSDT": "SOL/USDT:USDT", "SOLUSD": "SOL/USDT:USDT",
    # BNB
    "BNBUSDT": "BNB/USDT:USDT",
    # XRP
    "XRPUSDT": "XRP/USDT:USDT",
    # ADA
    "ADAUSDT": "ADA/USDT:USDT",
    # DOGE
    "DOGEUSDT": "DOGE/USDT:USDT",
    # AVAX
    "AVAXUSDT": "AVAX/USDT:USDT",
    # ARB
    "ARBUSDT": "ARB/USDT:USDT",
    # OP
    "OPUSDT": "OP/USDT:USDT",
    # LINK
    "LINKUSDT": "LINK/USDT:USDT",
    # SUI
    "SUIUSDT": "SUI/USDT:USDT",
    # INJ
    "INJUSDT": "INJ/USDT:USDT",
    # TON
    "TONUSDT": "TON/USDT:USDT",
    # NEAR
    "NEARUSDT": "NEAR/USDT:USDT",
}


def _normalize_tv_symbol(raw: str) -> str:
    """
    TradingView ticker formatını CCXT futures formatına çevirir.
    BTCUSDT / BTCUSDTPERP / BTC.P → BTC/USDT:USDT
    Bilinmiyorsa orijinali döndürür.
    """
    if not raw:
        return raw
    # Büyük harfe çevir, exchange prefix'ini kaldır (BINANCE:BTCUSDT → BTCUSDT)
    clean = raw.upper().split(":")[-1]
    # .P veya .PERP suffix'i kaldır
    clean = clean.replace(".PERP", "").replace(".P", "")
    # Direkt map'te var mı?
    if clean in _TV_SYMBOL_MAP:
        return _TV_SYMBOL_MAP[clean]
    # Genel kural: XYZUSDT → XYZ/USDT:USDT
    if clean.endswith("USDT"):
        base = clean[:-4]
        return f"{base}/USDT:USDT"
    # Bilinmiyor — orijinali döndür (bot engine de sembol aramayı dener)
    return raw


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

    Webhook URL: https://SUNUCU_DOMAIN/api/signals/webhook/tv/{token}
    """
    try:
        body = await request.json()
    except Exception:
        return {"status": "error", "reason": "invalid JSON body"}

    print(f"[TV Webhook] token={token} body={body}")

    # Action alanını normalize et
    action_raw = str(body.get("action", body.get("side", body.get("order_action", "")))).lower().strip()
    if action_raw in ("buy", "long", "open_long", "buy_market", "1"):
        sig_type = "buy"
    elif action_raw in ("sell", "short", "open_short", "sell_market", "-1"):
        sig_type = "sell"
    else:
        print(f"[TV Webhook] Tanınmayan action: '{action_raw}'")
        return {"status": "ignored", "reason": f"unrecognized action: '{action_raw}'"}

    # Sembol normalize et (BTCUSDT → BTC/USDT:USDT)
    symbol_raw = str(body.get("symbol", body.get("ticker", ""))).strip()
    symbol_ccxt = _normalize_tv_symbol(symbol_raw)   # CCXT format
    price = float(body.get("price", body.get("close", body.get("last", 0))) or 0)
    message = str(body.get("message", body.get("comment", body.get("alert_message", ""))))

    payload = {
        "symbol":     symbol_ccxt,    # bot engine bunu kullanır
        "symbol_raw": symbol_raw,     # orijinal TV sembolü (debug)
        "type":       sig_type,
        "price":      price,
        "source":     "TradingView",
        "reason":     message or f"TV Alarm — {action_raw}",
        "token":      token,
        "ts":         datetime.utcnow().isoformat(),
    }

    print(f"[TV Webhook] {sig_type.upper()} | {symbol_raw} → {symbol_ccxt} @ {price}")

    try:
        from core.redis_client import get_redis
        redis = get_redis()

        # 1) Token bazlı anahtar — bot engine bu token'ı izleyebilir
        await redis.set(f"tv_webhook:{token}", json.dumps(payload), ex=600)

        # 2) CCXT sembol bazlı anahtar — bot engine custom_signal olarak okur
        if symbol_ccxt:
            sym_key = f"custom_signal:{symbol_ccxt.replace('/', '_').replace(':', '_')}"
            await redis.set(sym_key, json.dumps(payload), ex=600)  # 10dk geçerli

            # Sinyal geçmişi (son 100)
            hist_key = f"custom_signal_history:{symbol_ccxt.replace('/', '_').replace(':', '_')}"
            await redis.lpush(hist_key, json.dumps(payload))
            await redis.ltrim(hist_key, 0, 99)

        # 3) Webhook geçmişi (son 100 istek — token bazlı)
        await redis.lpush(f"tv_webhook_history:{token}", json.dumps(payload))
        await redis.ltrim(f"tv_webhook_history:{token}", 0, 99)

    except Exception as e:
        print(f"[TV Webhook] Redis hatası: {e}")
        # Redis yoksa 200 dön (TradingView retry yapar aksi halde)

    return {
        "status": "ok",
        "received": {
            "type":       sig_type,
            "symbol":     symbol_ccxt,
            "symbol_raw": symbol_raw,
            "price":      price,
        }
    }


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
