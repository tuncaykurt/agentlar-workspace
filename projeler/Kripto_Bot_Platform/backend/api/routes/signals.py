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


def _tv_interval_to_tf(interval: str) -> str:
    """
    TradingView {{interval}} değerini standart timeframe formatına çevirir.
    TV gönderir: "1", "5", "15", "60", "240", "D", "W"
    Çıktı: "1m", "5m", "15m", "1h", "4h", "1d", "1w"
    """
    mapping = {
        "1": "1m", "3": "3m", "5": "5m", "10": "10m", "15": "15m",
        "30": "30m", "45": "45m", "60": "1h", "120": "2h", "180": "3h",
        "240": "4h", "360": "6h", "480": "8h", "720": "12h",
        "D": "1d", "1D": "1d", "W": "1w", "1W": "1w", "M": "1M", "1M": "1M",
    }
    tv = str(interval).strip().upper()
    return mapping.get(tv, f"{tv}m" if tv.isdigit() else tv.lower())


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


@router.get("/webhook/tv/{token}/history")
async def tradingview_webhook_history(token: str, limit: int = 20):
    """Bu token'a gelen tüm ham webhook isteklerini döndürür (debug)."""
    from core.redis_client import get_redis
    redis = get_redis()
    raw_items = await redis.lrange(f"tv_webhook_raw:{token}", 0, limit - 1)
    processed_items = await redis.lrange(f"tv_webhook_history:{token}", 0, limit - 1)
    return {
        "token": token,
        "raw_webhooks": [json.loads(i) for i in raw_items],
        "processed_signals": [json.loads(i) for i in processed_items],
    }


@router.get("/webhook/tv/{token}")
async def tradingview_webhook_info(token: str):
    """Browser'dan webhook URL'i test edildiğinde bilgi döner."""
    from core.redis_client import get_redis
    redis = get_redis()
    try:
        await redis.ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    # Bu token'a ait son sinyal var mı?
    last_raw = await redis.get(f"tv_webhook:{token}")
    last_signal = json.loads(last_raw) if last_raw else None
    hist_len = await redis.llen(f"tv_webhook_history:{token}")

    return {
        "webhook_active": True,
        "token": token,
        "redis_ok": redis_ok,
        "last_signal": last_signal,
        "total_signals_received": hist_len,
        "info": "Bu URL aktif. TradingView alarm ayarlarinda Webhook URL olarak kullanin. Sadece POST istekleri sinyal olarak islenir.",
    }


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
        # JSON parse başarısız — raw body'yi text olarak oku
        raw_text = (await request.body()).decode("utf-8", errors="replace")
        print(f"[TV Webhook] JSON parse HATASI — raw body: {raw_text[:500]}")
        # Ham mesajdan aksiyon tespit etmeye çalış
        raw_lower = raw_text.lower()
        if any(w in raw_lower for w in ("long", "buy")):
            body = {"action": "buy", "symbol": "ETHUSDT", "price": 0, "message": raw_text[:200]}
        elif any(w in raw_lower for w in ("short", "sell")):
            body = {"action": "sell", "symbol": "ETHUSDT", "price": 0, "message": raw_text[:200]}
        else:
            return {"status": "error", "reason": "invalid JSON body", "raw": raw_text[:200]}

    print(f"[TV Webhook] token={token} body={body}")

    # ── Tüm gelen webhook'ları kaydet (debug için) ──
    try:
        from core.redis_client import get_redis
        _r = get_redis()
        await _r.lpush(f"tv_webhook_raw:{token}", json.dumps({"body": body, "ts": datetime.utcnow().isoformat()}))
        await _r.ltrim(f"tv_webhook_raw:{token}", 0, 49)
    except Exception:
        pass

    # Action alanını normalize et
    action_raw = str(body.get("action", body.get("side", body.get("order_action", "")))).lower().strip()

    # {{strategy.order.action}} çözülmemiş template — alert adından tespit et
    if "{{" in action_raw or not action_raw:
        # Mesaj veya diğer alanlardan tespit etmeye çalış
        fallback_text = json.dumps(body).lower()
        alert_name = str(body.get("alert_name", body.get("name", ""))).lower()
        if any(w in alert_name for w in ("long", "buy")) or any(w in fallback_text for w in ('"long"', '"buy"')):
            action_raw = "buy"
            print(f"[TV Webhook] Template çözülmemiş — fallback: BUY (alert_name veya body'den tespit)")
        elif any(w in alert_name for w in ("short", "sell")) or any(w in fallback_text for w in ('"short"', '"sell"')):
            action_raw = "sell"
            print(f"[TV Webhook] Template çözülmemiş — fallback: SELL (alert_name veya body'den tespit)")
        else:
            print(f"[TV Webhook] Template çözülmemiş ve tespit edilemedi: body={body}")
            return {"status": "ignored", "reason": f"unresolved template, cannot detect action from body"}

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

    # TradingView {{interval}} → standart timeframe
    tv_interval = str(body.get("interval", body.get("timeframe", ""))).strip()
    timeframe = _tv_interval_to_tf(tv_interval) if tv_interval else None

    payload = {
        "symbol":     symbol_ccxt,    # bot engine bunu kullanır
        "symbol_raw": symbol_raw,     # orijinal TV sembolü (debug)
        "type":       sig_type,
        "price":      price,
        "source":     "TradingView",
        "reason":     message or f"TV Alarm — {action_raw}",
        "token":      token,
        "timeframe":  timeframe,      # sinyal periyodu (5m, 1h, vb.)
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
    passive_tasks = []   # pasif botlar için arka plan analiz görevleri
    finalize_tasks = []  # önceki sinyalleri sonlandırma görevleri

    try:
        from core.database import async_session
        from models.trade import SignalLog, Bot, BotStatus
        from sqlalchemy import select as sa_select
        import json as _json

        async with async_session() as session:
            # Bu sembol'e bağlı TradingView webhook / custom_signal botlarını bul
            result = await session.execute(
                sa_select(Bot).where(
                    Bot.strategy.in_(["tradingview_webhook", "custom_signal"]),
                    Bot.symbol == symbol_ccxt,
                )
            )
            matched_bots = result.scalars().all()

            if matched_bots:
                for bot in matched_bots:
                    # Bot parametrelerinden TP/SL oku
                    bot_params = {}
                    try:
                        bot_params = _json.loads(bot.params) if bot.params else {}
                    except Exception:
                        pass

                    tp_pct = float(bot_params.get("tp_pct") or bot_params.get("take_profit_pct") or 0)
                    sl_pct = float(bot_params.get("sl_pct") or bot_params.get("stop_loss_pct") or 0)
                    effective_tf = timeframe or bot_params.get("signal_timeframe")

                    tp_price = None
                    sl_price = None
                    if tp_pct > 0 and sl_pct > 0 and price > 0:
                        if sig_type == "buy":
                            tp_price = round(price * (1 + tp_pct / 100), 6)
                            sl_price = round(price * (1 - sl_pct / 100), 6)
                        else:
                            tp_price = round(price * (1 - tp_pct / 100), 6)
                            sl_price = round(price * (1 + sl_pct / 100), 6)

                    is_running = bot.status == BotStatus.RUNNING

                    log = SignalLog(
                        bot_id=bot.id,
                        symbol=symbol_ccxt or symbol_raw,
                        signal_type=sig_type,
                        source="TradingView",
                        price=price,
                        reason=message or f"TV Alarm — {action_raw}",
                        # Aktif bot → engine işler ("received" analytics'ten gizlenir)
                        # Pasif bot → background analiz "analyzed"'a günceller
                        action="received",
                        tp_price=tp_price,
                        sl_price=sl_price,
                        outcome="open" if (tp_price and sl_price) else None,
                        raw_payload=json.dumps(body),
                        timeframe=effective_tf,
                    )
                    session.add(log)
                    await session.flush()   # log.id'yi al

                    if not is_running:
                        # Pasif bot: arka planda tam analiz yap
                        passive_tasks.append((
                            log.id, bot.id,
                            bot.exchange or "mexc",
                            symbol_ccxt or symbol_raw,
                            sig_type, price,
                            effective_tf or "1h",
                            tp_pct, sl_pct,
                        ))
                        print(f"[TV Webhook] Bot #{bot.id} '{bot.name}' pasif — analiz kuyruğa alındı")
                    else:
                        print(f"[TV Webhook] Bot #{bot.id} '{bot.name}' aktif — engine işleyecek TP={tp_price} SL={sl_price}")
                    
                    # Önceki açık sinyali kapatma/analiz görevini ekle
                    finalize_tasks.append((
                        bot.id, symbol_ccxt or symbol_raw, token, price, bot.exchange or "mexc"
                    ))
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
                
                # Bot olmayan durum için de önceki açık sinyali kapat
                finalize_tasks.append((
                    0, symbol_ccxt or symbol_raw, token, price, "mexc"
                ))

            await session.commit()
    except Exception as e:
        print(f"[TV Webhook] Signal log DB hatası: {e}")
        import traceback
        traceback.print_exc()

    # Pasif bot analizlerini arka planda başlat (TradingView'e hemen 200 dön)
    if passive_tasks or finalize_tasks:
        from services.signal_analyzer import run_passive_analysis, finalize_previous_signal
        for args in passive_tasks:
            asyncio.create_task(run_passive_analysis(*args))
        for args in finalize_tasks:
            asyncio.create_task(finalize_previous_signal(*args))

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
