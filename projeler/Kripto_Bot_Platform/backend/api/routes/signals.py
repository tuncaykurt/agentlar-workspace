"""
Sinyal Endpoint'leri
- /signals/custom      : Frontend JS indikatörlerinden gelen sinyaller
- /signals/webhook/tv/{token} : TradingView alarm webhook'u
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
import json

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/webhook/test")
async def webhook_test():
    """Webhook endpoint'inin erişilebilir olduğunu doğrula + Redis testi."""
    result = {"webhook_alive": True, "ts": datetime.utcnow().isoformat()}
    try:
        from core.redis_client import get_redis
        redis = get_redis()
        await redis.ping()
        result["redis_ok"] = True

        # Son sinyal geçmişi sayısı (ETH)
        hist_len = await redis.llen("custom_signal_history:ETH_USDT_USDT")
        result["eth_signal_history_count"] = hist_len
    except Exception as e:
        result["redis_ok"] = False
        result["redis_error"] = str(e)
    return result


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

    # DB'ye sinyal logu kaydet — eşleşen botların TP/SL ayarlarıyla performans takibi
    try:
        from core.database import async_session
        from models.trade import SignalLog, Bot
        from sqlalchemy import select as sa_select

        async with async_session() as session:
            # Bu token veya sembol'e bağlı TradingView webhook botlarını bul
            result = await session.execute(
                sa_select(Bot).where(
                    Bot.strategy.in_(["tradingview_webhook", "custom_signal"]),
                    Bot.symbol == symbol_ccxt,
                )
            )
            matched_bots = result.scalars().all()

            if matched_bots:
                for bot in matched_bots:
                    params = json.loads(bot.params) if bot.params else {}
                    # Token eşleşmesi kontrolü
                    bot_token = params.get("webhook_token") or params.get("signal_source", "")
                    if bot_token and bot_token != token:
                        continue  # Bu bot farklı bir token izliyor

                    tp_pct = params.get("tp_pct") or params.get("take_profit_pct") or 0
                    sl_pct = params.get("sl_pct") or params.get("stop_loss_pct") or 0

                    tp_price = None
                    sl_price = None
                    if tp_pct > 0 and sl_pct > 0 and price > 0:
                        if sig_type == "buy":
                            tp_price = round(price * (1 + tp_pct / 100), 6)
                            sl_price = round(price * (1 - sl_pct / 100), 6)
                        else:
                            tp_price = round(price * (1 - tp_pct / 100), 6)
                            sl_price = round(price * (1 + sl_pct / 100), 6)

                    log = SignalLog(
                        bot_id=bot.id,
                        symbol=symbol_ccxt or symbol_raw,
                        signal_type=sig_type,
                        source="TradingView",
                        price=price,
                        reason=message or f"TV Alarm — {action_raw}",
                        action="received",
                        tp_price=tp_price,
                        sl_price=sl_price,
                        outcome="open" if (tp_price and sl_price) else None,
                        raw_payload=json.dumps(body),
                    )
                    session.add(log)
                    print(f"[TV Webhook] Bot #{bot.id} '{bot.name}' sinyali kaydedildi — TP={tp_price} SL={sl_price}")
            else:
                # Eşleşen bot yok — genel kayıt (bot_id=0)
                log = SignalLog(
                    bot_id=0,
                    symbol=symbol_ccxt or symbol_raw,
                    signal_type=sig_type,
                    source="TradingView",
                    price=price,
                    reason=message or f"TV Alarm — {action_raw}",
                    action="received",
                    raw_payload=json.dumps(body),
                )
                session.add(log)

            await session.commit()
    except Exception as e:
        print(f"[TV Webhook] Signal log DB hatası: {e}")

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


# ─── Webhook Profil Yönetimi (Token bazlı TP/SL) ─────────────────────────────

class WebhookProfileData(BaseModel):
    token: str
    name: str = ""
    tp_pct: float = 2.0
    sl_pct: float = 1.0
    leverage: int = 20
    enabled: bool = True


class WebhookProfileUpdate(BaseModel):
    name: str | None = None
    tp_pct: float | None = None
    sl_pct: float | None = None
    leverage: int | None = None
    enabled: bool | None = None


@router.get("/webhook-profiles")
async def list_webhook_profiles():
    """Tüm webhook profillerini listele."""
    from core.database import async_session
    from models.trade import WebhookProfile
    from sqlalchemy import select as sa_select
    async with async_session() as session:
        result = await session.execute(sa_select(WebhookProfile).order_by(WebhookProfile.id.desc()))
        profiles = result.scalars().all()
        return [
            {
                "id": p.id,
                "username": p.username,
                "token": p.token,
                "name": p.name,
                "tp_pct": p.tp_pct,
                "sl_pct": p.sl_pct,
                "leverage": p.leverage,
                "enabled": p.enabled,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in profiles
        ]


@router.post("/webhook-profiles")
async def create_webhook_profile(data: WebhookProfileData):
    """Yeni webhook profili oluştur veya mevcut olanı güncelle."""
    from core.database import async_session
    from models.trade import WebhookProfile
    from sqlalchemy import select as sa_select
    async with async_session() as session:
        result = await session.execute(
            sa_select(WebhookProfile).where(WebhookProfile.token == data.token)
        )
        profile = result.scalar_one_or_none()
        if profile:
            profile.name = data.name or profile.name
            profile.tp_pct = data.tp_pct
            profile.sl_pct = data.sl_pct
            profile.leverage = data.leverage
            profile.enabled = data.enabled
        else:
            profile = WebhookProfile(
                token=data.token,
                name=data.name,
                tp_pct=data.tp_pct,
                sl_pct=data.sl_pct,
                leverage=data.leverage,
                enabled=data.enabled,
            )
            session.add(profile)
        await session.commit()
        await session.refresh(profile)
        return {
            "id": profile.id,
            "username": profile.username,
            "token": profile.token,
            "name": profile.name,
            "tp_pct": profile.tp_pct,
            "sl_pct": profile.sl_pct,
            "leverage": profile.leverage,
            "enabled": profile.enabled,
        }


@router.patch("/webhook-profiles/{token}")
async def update_webhook_profile(token: str, data: WebhookProfileUpdate):
    """Webhook profil ayarlarını güncelle (TP/SL/leverage)."""
    from core.database import async_session
    from models.trade import WebhookProfile
    from sqlalchemy import select as sa_select
    async with async_session() as session:
        result = await session.execute(
            sa_select(WebhookProfile).where(WebhookProfile.token == token)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(404, "Profil bulunamadı")
        if data.name is not None:
            profile.name = data.name
        if data.tp_pct is not None:
            profile.tp_pct = data.tp_pct
        if data.sl_pct is not None:
            profile.sl_pct = data.sl_pct
        if data.leverage is not None:
            profile.leverage = data.leverage
        if data.enabled is not None:
            profile.enabled = data.enabled
        await session.commit()
        await session.refresh(profile)
        return {
            "id": profile.id,
            "token": profile.token,
            "name": profile.name,
            "tp_pct": profile.tp_pct,
            "sl_pct": profile.sl_pct,
            "leverage": profile.leverage,
            "enabled": profile.enabled,
        }


@router.delete("/webhook-profiles/{token}")
async def delete_webhook_profile(token: str):
    from core.database import async_session
    from models.trade import WebhookProfile
    from sqlalchemy import delete as sa_delete
    async with async_session() as session:
        await session.execute(sa_delete(WebhookProfile).where(WebhookProfile.token == token))
        await session.commit()
    return {"status": "deleted"}


# ─── Sinyal Performans Analizi ────────────────────────────────────────────────

@router.get("/performance/{token}")
async def signal_performance(token: str):
    """
    Token'a ait sinyallerin geçmişe dönük performans analizi.
    TP/SL vuruş oranı, ortalama kâr/zarar, toplam sinyal sayısı.
    """
    from core.database import async_session
    from models.trade import SignalLog
    from sqlalchemy import select as sa_select

    async with async_session() as session:
        # Bu token'a ait tüm sinyaller (bot_id=0, source=TradingView)
        result = await session.execute(
            sa_select(SignalLog).where(
                SignalLog.bot_id == 0,
                SignalLog.outcome.isnot(None),
                SignalLog.raw_payload.contains(token),
            ).order_by(SignalLog.created_at.desc())
        )
        signals = result.scalars().all()

    total = len(signals)
    tp_hits = [s for s in signals if s.outcome == "tp_hit"]
    sl_hits = [s for s in signals if s.outcome == "sl_hit"]
    still_open = [s for s in signals if s.outcome == "open"]
    expired = [s for s in signals if s.outcome == "expired"]

    pnl_list = [s.outcome_pnl_pct for s in signals if s.outcome_pnl_pct is not None]
    avg_pnl = sum(pnl_list) / len(pnl_list) if pnl_list else 0
    total_pnl = sum(pnl_list)

    closed = len(tp_hits) + len(sl_hits)
    win_rate = (len(tp_hits) / closed * 100) if closed > 0 else 0

    return {
        "token": token,
        "total_signals": total,
        "open": len(still_open),
        "tp_hit": len(tp_hits),
        "sl_hit": len(sl_hits),
        "expired": len(expired),
        "win_rate": round(win_rate, 1),
        "avg_pnl_pct": round(avg_pnl, 2),
        "total_pnl_pct": round(total_pnl, 2),
        "signals": [
            {
                "id": s.id,
                "signal_type": s.signal_type,
                "price": s.price,
                "tp_price": s.tp_price,
                "sl_price": s.sl_price,
                "outcome": s.outcome,
                "outcome_price": s.outcome_price,
                "outcome_pnl_pct": s.outcome_pnl_pct,
                "outcome_at": s.outcome_at.isoformat() if s.outcome_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in signals[:50]
        ],
    }
