"""
Scanner Simülasyon API — Sanal işlem takip, istatistik ve ayar endpoint'leri.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from core.database import async_session
from core.redis_client import get_redis
import json
from api.routes.auth import get_current_user_obj, get_current_user
from models.user import User

router = APIRouter(prefix="/simulations", tags=["simulations"])

# ai_log kolonu var mı cache'le
_has_ai_log_col = None


async def _check_ai_log_col() -> bool:
    global _has_ai_log_col
    if _has_ai_log_col is not None:
        return _has_ai_log_col
    try:
        async with async_session() as session:
            await session.execute(text("SELECT ai_log FROM scanner_simulations LIMIT 1"))
            _has_ai_log_col = True
    except Exception:
        _has_ai_log_col = False
    return _has_ai_log_col


@router.get("")
async def list_simulations(status: str = None, limit: int = 50, offset: int = 0, user_id: int = Depends(get_current_user)):
    """Simülasyonları listele. ?status=open|win|loss|expired ile filtrele."""
    # ai_log çok büyük — listede gösterme, sadece detay endpoint'inde ver
    async with async_session() as session:
        where = "WHERE (user_id = :user_id OR user_id IS NULL)"
        params = {"limit": limit, "offset": offset, "user_id": user_id}
        if status:
            where += " AND status = :status"
            params["status"] = status

        result = await session.execute(text(f"""
            SELECT id, coin, symbol, direction, selection_mode, confidence, reason,
                   entry_price, tp_price, sl_price, tp_pct, sl_pct, leverage,
                   rsi_14, adx, volume_ratio, funding_rate, fear_greed, atr_pct, supertrend_dir,
                   status, exit_price, pnl_pct, pnl_usdt,
                   max_favorable_pct, max_adverse_pct,
                   created_at, closed_at,
                   exit_reason, duration_minutes, first_move, first_move_pct,
                   COALESCE(is_hedge, false) as is_hedge, hedge_pair_id,
                   COALESCE(margin_usdt, 100) as margin_usdt,
                   (SELECT COUNT(*) FROM scanner_simulations {where}) as _total
            FROM scanner_simulations
            {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), params)
        rows = result.fetchall()

    if not rows:
        return {"items": [], "total": 0}

    total = rows[0][-1]  # _total subquery sonucu

    cols = ["id", "coin", "symbol", "direction", "selection_mode", "confidence", "reason",
            "entry_price", "tp_price", "sl_price", "tp_pct", "sl_pct", "leverage",
            "rsi_14", "adx", "volume_ratio", "funding_rate", "fear_greed", "atr_pct", "supertrend_dir",
            "status", "exit_price", "pnl_pct", "pnl_usdt",
            "max_favorable_pct", "max_adverse_pct",
            "created_at", "closed_at",
            "exit_reason", "duration_minutes", "first_move", "first_move_pct",
            "is_hedge", "hedge_pair_id", "margin_usdt"]

    items = []
    open_symbols = set()
    for row in rows:
        d = dict(zip(cols, row[:-1]))  # son kolon _total, atla
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        d["closed_at"] = d["closed_at"].isoformat() if d["closed_at"] else None
        d["ai_log"] = None  # Liste'de ai_log yok — detay endpoint'inde var
        items.append(d)
        if d["status"] == "open" and d.get("symbol"):
            open_symbols.add(d["symbol"])

    # Açık sim'ler için Redis'ten anlık fiyat çek (pipeline — tek round-trip)
    if open_symbols:
        try:
            redis = get_redis()
            pipe = redis.pipeline()
            sym_list = list(open_symbols)
            for sym in sym_list:
                pipe.get(f"ticker:mexc:{sym}")
            results = await pipe.execute()

            live_prices = {}
            for sym, raw in zip(sym_list, results):
                if raw:
                    data = json.loads(raw)
                    p = float(data.get("last", 0))
                    if p > 0:
                        live_prices[sym] = p

            for d in items:
                if d["status"] == "open" and d.get("symbol") in live_prices:
                    cur = live_prices[d["symbol"]]
                    entry = d["entry_price"]
                    is_long = d["direction"] == "long"
                    pnl_pct = ((cur - entry) / entry * 100) if is_long else ((entry - cur) / entry * 100)
                    margin = d.get("margin_usdt") or 100
                    lev = d.get("leverage") or 50
                    pnl_usdt = margin * lev * pnl_pct / 100
                    d["current_price"] = round(cur, 6)
                    d["current_pnl_pct"] = round(pnl_pct, 4)
                    d["current_pnl_usdt"] = round(pnl_usdt, 2)
        except Exception:
            pass

    return {"items": items, "total": total}


@router.get("/stats")
async def simulation_stats(user_id: int = Depends(get_current_user)):
    """Kullanıcıya özel simülasyon istatistikleri — tek DB session, tek round-trip."""
    user_filter = "(user_id = :uid OR user_id IS NULL)"
    async with async_session() as session:
        # Ana istatistikler + yön analizi + coin performansı — tek session
        result = await session.execute(text(f"""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'win') as wins,
                COUNT(*) FILTER (WHERE status = 'loss') as losses,
                COUNT(*) FILTER (WHERE status = 'open') as open_count,
                COUNT(*) FILTER (WHERE status = 'expired') as expired,
                COALESCE(AVG(pnl_pct) FILTER (WHERE status = 'win'), 0) as avg_win_pct,
                COALESCE(AVG(pnl_pct) FILTER (WHERE status = 'loss'), 0) as avg_loss_pct,
                COALESCE(SUM(pnl_usdt) FILTER (WHERE status IN ('win','loss')), 0) as total_pnl_usdt,
                COALESCE(AVG(confidence) FILTER (WHERE status = 'win'), 0) as avg_win_confidence,
                COALESCE(AVG(confidence) FILTER (WHERE status = 'loss'), 0) as avg_loss_confidence,
                COALESCE(AVG(max_favorable_pct) FILTER (WHERE status = 'loss'), 0) as avg_loss_max_fav
            FROM scanner_simulations
            WHERE {user_filter}
        """), {"uid": user_id})
        row = result.fetchone()

        dir_result = await session.execute(text(f"""
            SELECT direction,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'win') as wins,
                   COALESCE(AVG(pnl_pct) FILTER (WHERE status IN ('win','loss')), 0) as avg_pnl
            FROM scanner_simulations
            WHERE status IN ('win', 'loss') AND {user_filter}
            GROUP BY direction
        """), {"uid": user_id})
        dir_rows = dir_result.fetchall()

        coin_result = await session.execute(text(f"""
            SELECT coin,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'win') as wins,
                   COUNT(*) FILTER (WHERE status = 'loss') as losses,
                   COALESCE(SUM(pnl_usdt), 0) as total_pnl
            FROM scanner_simulations
            WHERE status IN ('win', 'loss') AND {user_filter}
            GROUP BY coin
            HAVING COUNT(*) >= 2
            ORDER BY COALESCE(SUM(pnl_usdt), 0) DESC
            LIMIT 10
        """), {"uid": user_id})
        coin_rows = coin_result.fetchall()

    total = row[0] or 0
    wins = row[1] or 0
    losses = row[2] or 0
    closed = wins + losses

    direction_stats = {}
    for dr in dir_rows:
        direction_stats[dr[0]] = {
            "total": dr[1], "wins": dr[2],
            "win_rate": round(dr[2] / max(1, dr[1]) * 100, 1),
            "avg_pnl": round(dr[3], 2),
        }

    coin_stats = [
        {"coin": r[0], "total": r[1], "wins": r[2], "losses": r[3],
         "win_rate": round(r[2] / max(1, r[1]) * 100, 1), "total_pnl": round(r[4], 2)}
        for r in coin_rows
    ]

    return {
        "total": total,
        "open": row[3] or 0,
        "wins": wins,
        "losses": losses,
        "expired": row[4] or 0,
        "win_rate": round(wins / max(1, closed) * 100, 1),
        "avg_win_pct": round(row[5], 2),
        "avg_loss_pct": round(row[6], 2),
        "total_pnl_usdt": round(row[7], 2),
        "avg_win_confidence": round(row[8], 1),
        "avg_loss_confidence": round(row[9], 1),
        "avg_loss_max_favorable": round(row[10], 2),
        "profit_factor": round(abs(row[5] * wins) / max(0.01, abs(row[6] * losses)), 2) if losses else 0,
        "direction_stats": direction_stats,
        "coin_performance": coin_stats,
    }


_SIM_SETTINGS_DEFAULTS = {
    "enabled": True, "mode": "ai", "interval": 120,
    "leverage": 50, "min_leverage": 3, "max_leverage": 75,
    "tp_pct": 1.5, "sl_pct": 0.8,
    "auto_scale_tp_sl": True, "scale_base_leverage": 10,
    "trailing_enabled": False,
    "trailing_activate_pct": 0.3, "trailing_callback_pct": 0.15,
    "min_confidence": 65, "max_open": 5,
    "expiry_hours": 24,
    "hedge_enabled": False,
    "hedge_tp_pct": 0.4, "hedge_sl_pct": 0.1,
    "hedge_use_max_leverage": True,
    "hedge_min_atr_pct": 0.3, "hedge_min_volume_ratio": 1.5,
    "portfolio_enabled": True,
    "trade_size_mode": "fixed",
    "trade_size_value": 100,
}


@router.get("/settings")
async def get_sim_settings(user_id: int = Depends(get_current_user)):
    """Kullanıcıya özel simülasyon ayarlarını getir."""
    redis = get_redis()
    # Önce kullanıcıya özel ayar var mı bak
    raw = await redis.get(f"scanner_sim:settings:{user_id}")
    if raw:
        return json.loads(raw)
    # Fallback: eski global ayar (lazy migration → kullanıcıya özel key'e taşı)
    raw = await redis.get("scanner_sim:settings")
    if raw:
        # Global key'i kullanıcıya özel key'e kopyala (bir kerelik migration)
        await redis.set(f"scanner_sim:settings:{user_id}", raw)
        return json.loads(raw)
    return {**_SIM_SETTINGS_DEFAULTS}


@router.post("/settings")
async def update_sim_settings(data: dict, user_id: int = Depends(get_current_user)):
    """Kullanıcıya özel simülasyon ayarlarını güncelle."""
    redis = get_redis()
    current = await get_sim_settings(user_id)
    current.update(data)
    await redis.set(f"scanner_sim:settings:{user_id}", json.dumps(current))
    return current


@router.get("/hft-settings")
async def get_hft_settings(user = Depends(get_current_user_obj), bot_id: str = "default"):
    """HFT Motoru (Trailing Grid) ayarlarını getir."""
    user_id = str(user.id)
    redis = get_redis()
    raw = await redis.get(f"hft_sim:settings:{user_id}:{bot_id}")
    if not raw and bot_id == "default":
        # Fallback: sadece default bot için eski format (migration)
        raw = await redis.get(f"hft_sim:settings:{user_id}")
    if raw:
        return json.loads(raw)
    return {
        "symbol": "BTCUSDT",
        "spread_pct": 5.0,
        "grid_count": 20,
        "grid_mode": "manual",
        "bb_timeframe": "5m",
        "bb_period": 20,
        "bb_std_dev": 2.0,
        "min_spread_pct": 0.3,
    }


@router.post("/hft-settings")
async def update_hft_settings(data: dict, user = Depends(get_current_user_obj)):
    """HFT Motoru ayarlarını (Coin, Spread, Grid) güncelle."""
    user_id = str(user.id)
    bot_id = data.pop("bot_id", "default")
    redis = get_redis()
    current = await get_hft_settings(user, bot_id=bot_id)
    current.update(data)

    # Hedef coin değiştiyse ağ sınırlarını sıfırla ki yeni fiyattan kurulsun
    if "symbol" in data and data["symbol"] != current.get("symbol"):
        current["upper_price"] = 0
        current["lower_price"] = 0

    await redis.set(f"hft_sim:settings:{user_id}:{bot_id}", json.dumps(current))
    return current


# ─── Grid Live Trading Endpoints ─────────────────────────────────────

@router.get("/hft-bots")
async def hft_list_bots(user = Depends(get_current_user_obj)):
    """Kullanıcının tüm grid botlarını listele."""
    from services.grid_live_engine import grid_engine
    user_id = str(user.id)
    bots = await grid_engine.list_bots(user_id)
    return {"bots": bots, "max": 5}


@router.delete("/hft-bots/{bot_id}")
async def hft_delete_bot(bot_id: str, user = Depends(get_current_user_obj)):
    """Bot'u durdur ve registry'den sil."""
    from services.grid_live_engine import grid_engine
    user_id = str(user.id)
    redis = get_redis()
    # Önce durdur
    if await redis.get(f"grid_live:running:{user_id}:{bot_id}"):
        await grid_engine.stop(close_positions=True, user_id=user_id, bot_id=bot_id)
    # Redis key'leri temizle
    await redis.delete(f"grid_live:state:{user_id}:{bot_id}")
    await redis.delete(f"grid_live:trades:{user_id}:{bot_id}")
    await redis.delete(f"hft_sim:settings:{user_id}:{bot_id}")
    # Registry'den kaldır
    await grid_engine._unregister_bot(user_id, bot_id)
    return {"status": "ok", "message": f"Bot {bot_id} silindi"}


@router.post("/hft-start")
async def hft_start(data: dict, user = Depends(get_current_user_obj)):
    """
    Grid botunu başlat. Paper veya Live modda çalışır.

    Body:
    - bot_id: Bot ID ("default", "bot2", "new" = yeni oluştur)
    - mode: "paper" (sanal) veya "live" (gerçek borsa)
    - symbol: "ETHUSDT" (opsiyonel, HFT settings'den alır)
    - leverage, order_size, spread_pct, grid_count (opsiyonel)
    """
    from services.grid_live_engine import grid_engine
    import uuid

    user_id = str(user.id)
    bot_id = data.get("bot_id", "default")

    # Yeni bot oluştur
    if bot_id == "new":
        bots = await grid_engine.list_bots(user_id)
        if len(bots) >= 5:
            return {"error": "Maksimum 5 bot limiti aşıldı"}
        bot_id = f"bot{len(bots) + 1}_{uuid.uuid4().hex[:4]}"

    redis = get_redis()
    hft_settings = await get_hft_settings(user, bot_id=bot_id)

    config = {
        "symbol": data.get("symbol", hft_settings.get("symbol", "ETHUSDT")),
        "mode": data.get("mode", "paper"),
        "leverage": data.get("leverage", hft_settings.get("leverage", 10)),
        "order_size": data.get("order_size", hft_settings.get("order_size", 100)),
        "spread_pct": data.get("spread_pct", hft_settings.get("spread_pct", 0.5)),
        "grid_count": data.get("grid_count", hft_settings.get("grid_count", 20)),
        # BB modu parametreleri
        "grid_mode": data.get("grid_mode", "manual"),
        "grid_direction": data.get("grid_direction", "long"),
        "bb_timeframe": data.get("bb_timeframe", "5m"),
        "bb_period": data.get("bb_period", 20),
        "bb_std_dev": data.get("bb_std_dev", 2.0),
        "min_spread_pct": data.get("min_spread_pct", 0.3),
        "filters": data.get("filters", {}),
    }

    try:
        result = await grid_engine.start(config, user_id=user_id, bot_id=bot_id)
        result["bot_id"] = bot_id
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Grid başlatma hatası: {str(e)}"}


@router.post("/hft-stop")
async def hft_stop(data: dict = None, user = Depends(get_current_user_obj)):
    """
    Grid botunu durdur.

    Body (opsiyonel):
    - bot_id: Bot ID (default: "default")
    - close_positions: true ise açık pozisyonları kapat (sadece live modda)
    """
    from services.grid_live_engine import grid_engine

    user_id = str(user.id)
    bot_id = (data or {}).get("bot_id", "default")
    close_positions = (data or {}).get("close_positions", False)
    result = await grid_engine.stop(close_positions=close_positions, user_id=user_id, bot_id=bot_id)
    return result


@router.post("/hft-kill")
async def hft_kill(data: dict = None, user = Depends(get_current_user_obj)):
    """
    ACİL DURDURMA (Kill Switch).
    Tüm emirleri iptal eder, tüm pozisyonları kapatır, motoru durdurur.
    """
    from services.grid_live_engine import grid_engine

    user_id = str(user.id)
    bot_id = (data or {}).get("bot_id", "default")
    result = await grid_engine.kill_switch(user_id=user_id, bot_id=bot_id)
    return result


@router.get("/hft-status")
async def hft_live_status(user = Depends(get_current_user_obj), bot_id: str = "default"):
    """
    Grid botunun canlı durumu.
    Mod, grid bilgisi, PnL, işlem geçmişi, borsa pozisyonları.
    """
    from services.grid_live_engine import grid_engine

    user_id = str(user.id)
    result = await grid_engine.get_status(user_id=user_id, bot_id=bot_id)
    result["bot_id"] = bot_id
    return result


@router.post("/hft-bb-data")
async def hft_bb_data(data: dict, user_id: int = Depends(get_current_user)):
    """
    BB bantlarını hesapla ve döndür (bot başlatmadan).
    Sim modu için: frontend grid sınırlarını BB'den alır.
    Body: symbol, bb_timeframe, bb_period, bb_std_dev, min_spread_pct
    """
    from services.bollinger_grid_service import BollingerGridService

    symbol_raw = data.get("symbol", "ETHUSDT")
    base = symbol_raw.replace("USDT", "")
    ccxt_symbol = f"{base}/USDT:USDT"

    bb_timeframe = data.get("bb_timeframe", "5m")
    bb_period = int(data.get("bb_period", 20))
    bb_std_dev = float(data.get("bb_std_dev", 2.0))
    min_spread_pct = float(data.get("min_spread_pct", 0.3))
    current_price = float(data.get("current_price", 0))
    grid_count = int(data.get("grid_count", 20))

    try:
        bb_service = BollingerGridService()
        bb_data = await bb_service.compute_grid_bounds(
            ccxt_symbol, bb_timeframe, bb_period, bb_std_dev,
            min_spread_pct, current_price, grid_count
        )
        if not bb_data:
            return {"error": "BB hesaplanamadı — OHLCV verisi alınamıyor."}

        # ATR bazlı otomatik kademe önerisi hesapla
        atr = bb_data.get("atr", 0)
        bb_upper = bb_data.get("bb_upper", 0)
        bb_lower = bb_data.get("bb_lower", 0)
        bb_mid = bb_data.get("bb_mid", 0)
        band_width = bb_upper - bb_lower

        if atr > 0 and band_width > 0 and bb_mid > 0:
            # Min step = ATR * 0.8 (her kademe en az 0.8 ATR olmalı, fee karşılansın)
            min_step = atr * 0.8
            # Fee floor: step en az %0.15 olmalı (0.12% fee + margin)
            fee_floor = bb_mid * 0.0015
            effective_step = max(min_step, fee_floor)
            suggested_count = max(3, min(50, int(band_width / effective_step)))
            actual_step = band_width / suggested_count
            step_pct = (actual_step / bb_mid) * 100

            bb_data["suggested_grid_count"] = suggested_count
            bb_data["suggested_step"] = round(actual_step, 4)
            bb_data["suggested_step_pct"] = round(step_pct, 4)
            bb_data["atr_step_ratio"] = round(actual_step / atr, 2) if atr > 0 else 0
        else:
            bb_data["suggested_grid_count"] = 15
            bb_data["suggested_step"] = 0
            bb_data["suggested_step_pct"] = 0
            bb_data["atr_step_ratio"] = 0

        # ── Akıllı Başlangıç: son mumları kontrol et ──
        grid_mode = data.get("grid_mode", "")
        if grid_mode == "bb_direction":
            from services.grid_live_engine import grid_engine
            smart_start_wait = data.get("smart_start_wait", True)
            
            recent_cross = await grid_engine._check_recent_midline_cross(
                ccxt_symbol, bb_timeframe, bb_period, bb_std_dev, user_id=str(user_id), lookback=3
            )
            
            if not smart_start_wait:
                recent_cross["crossed"] = True
                recent_cross["direction"] = "long" if recent_cross.get("current_side", "above") == "above" else "short"
                if recent_cross.get("current_side") in ["long", "short"]:
                     recent_cross["direction"] = recent_cross["current_side"]
            
            bb_data["recent_cross"] = recent_cross.get("crossed", False)
            bb_data["recent_cross_direction"] = recent_cross.get("direction", "")
            bb_data["current_side"] = recent_cross.get("current_side", "above")

        return bb_data
    except Exception as e:
        return {"error": f"BB hesaplama hatası: {str(e)}"}


@router.get("/hft-trades")
async def hft_trades(limit: int = 50, bot_id: str = "default", user = Depends(get_current_user_obj)):
    """Grid bot işlem geçmişi."""
    user_id = str(user.id)
    redis = get_redis()
    trades_raw = await redis.lrange(f"grid_live:trades:{user_id}:{bot_id}", 0, limit - 1)
    trades = [json.loads(t) for t in trades_raw] if trades_raw else []
    return {"trades": trades, "count": len(trades)}


@router.post("/hft-tick")
async def hft_manual_tick(data: dict = None, user = Depends(get_current_user_obj)):
    """
    Manuel tek tick — HFT Engine çalışmıyorsa bu endpoint ile grid motoru tetiklenir.
    Redis'ten anlık fiyatı okur ve grid_engine.process_tick() çağırır.
    """
    from services.grid_live_engine import grid_engine

    user_id = str(user.id)
    bot_id = (data or {}).get("bot_id", "default")
    redis = get_redis()

    # Grid state'den sembolü al
    state_raw = await redis.get(f"grid_live:state:{user_id}:{bot_id}")
    if not state_raw:
        return {"error": "Grid state bulunamadı. Önce /hft-start ile başlatın."}

    state = json.loads(state_raw)
    ccxt_symbol = state.get("ccxt_symbol", "")
    if not ccxt_symbol:
        return {"error": "Sembol bulunamadı"}

    # Redis'ten fiyat çek
    price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
    if not price_raw:
        return {"error": f"Fiyat bulunamadı: {ccxt_symbol}"}

    price_data = json.loads(price_raw)
    current_price = float(price_data.get("last", 0))
    if current_price <= 0:
        return {"error": "Geçersiz fiyat"}

    # process_tick çağır
    try:
        result = await grid_engine.process_tick(current_price, user_id=user_id, bot_id=bot_id)
        return {
            "tick": True,
            "price": current_price,
            "result": result,
            "last_level": (json.loads(await redis.get(f"grid_live:state:{user_id}:{bot_id}") or "{}")).get("last_level", -1),
        }
    except Exception as e:
        import traceback
        return {"tick": False, "error": str(e), "traceback": traceback.format_exc()[-500:]}


@router.get("/hft-debug")
async def hft_debug(bot_id: str = "default", user = Depends(get_current_user_obj)):
    """HFT Engine ve Grid Live Engine debug bilgisi."""
    user_id = str(user.id)
    redis = get_redis()

    # HFT Engine heartbeat kontrolü
    hft_heartbeat = await redis.get("hft_engine:heartbeat")

    # Grid state
    running = await redis.get(f"grid_live:running:{user_id}:{bot_id}")
    state_raw = await redis.get(f"grid_live:state:{user_id}:{bot_id}")
    state = json.loads(state_raw) if state_raw else {}

    # Fiyat kontrolü
    ccxt_symbol = state.get("ccxt_symbol", "")
    price_available = False
    current_price = 0
    if ccxt_symbol:
        price_raw = await redis.get(f"ticker:mexc:{ccxt_symbol}")
        if price_raw:
            price_data = json.loads(price_raw)
            current_price = float(price_data.get("last", 0))
            price_available = current_price > 0

    return {
        "hft_engine_heartbeat": hft_heartbeat,
        "hft_engine_running": hft_heartbeat is not None,
        "grid_live_running": bool(running),
        "grid_mode": state.get("mode"),
        "grid_symbol": ccxt_symbol,
        "grid_last_level": state.get("last_level", -1),
        "price_available": price_available,
        "current_price": current_price,
        "grid_upper": state.get("upper", 0),
        "grid_lower": state.get("lower", 0),
        "filled_count": len(state.get("filled_levels", [])),
        "total_trades": state.get("total_trades", 0),
    }


@router.get("/status")
async def sim_status(user_id: int = Depends(get_current_user)):
    """Simülatörün anlık durumu + MEXC WS bilgisi."""
    redis = get_redis()
    raw = await redis.get("scanner_sim:status")
    status = json.loads(raw) if raw else {"running": False}

    # MEXC WebSocket durumu — scan yerine cache'lenmiş sayaç kullan
    try:
        cached_count = await redis.get("mexc_ws:ticker_count")
        if cached_count is not None:
            count = int(cached_count)
        else:
            # Fallback: tek bir scan pass (count=500 ile hızlı)
            count = 0
            cursor = b"0"
            while True:
                cursor, keys = await redis.scan(cursor, match="ticker:mexc:*", count=500)
                count += len(keys)
                if cursor == b"0" or cursor == 0:
                    break
            # 60s cache'le — her istek scan yapmasın
            await redis.set("mexc_ws:ticker_count", str(count), ex=60)
        status["mexc_ws"] = {
            "active_tickers": count,
            "connected": count > 0,
        }
    except Exception:
        status["mexc_ws"] = {"active_tickers": 0, "connected": False}

    return status


@router.get("/ws-prices")
async def ws_prices(user_id: int = Depends(get_current_user)):
    """MEXC WebSocket'ten gelen anlık fiyatları göster (debug)."""
    redis = get_redis()
    prices = {}
    try:
        cursor = b"0"
        keys = []
        while True:
            cursor, batch = await redis.scan(cursor, match="ticker:mexc:*", count=200)
            keys.extend(batch)
            if cursor == b"0" or cursor == 0:
                break
        for key in keys[:100]:
            raw = await redis.get(key)
            if raw:
                data = json.loads(raw)
                prices[data.get("symbol", str(key))] = {
                    "last": data.get("last"),
                    "bid": data.get("bid"),
                    "ask": data.get("ask"),
                }
    except Exception as e:
        return {"error": str(e)}
    return {"count": len(prices), "prices": prices}


@router.post("/trigger")
async def trigger_simulation(user_id: int = Depends(get_current_user)):
    """Simülasyonu manuel tetikle — debug ve test için."""
    from services.scanner_simulator import run_simulator_cycle
    try:
        await run_simulator_cycle()
        redis = get_redis()
        raw = await redis.get("scanner_sim:status")
        status = json.loads(raw) if raw else {}
        return {"triggered": True, "status": status}
    except Exception as e:
        import traceback
        return {"triggered": False, "error": str(e), "traceback": traceback.format_exc()[-1000:]}


@router.get("/portfolio")
async def get_portfolio(user = Depends(get_current_user_obj)):
    """Sanal portföy durumunu getir + borsa bakiyesi."""
    from services.scanner_simulator import _get_portfolio
    redis = get_redis()
    user_id = str(user.id)
    portfolio = await _get_portfolio(redis)
    equity = portfolio["balance"] + portfolio["reserved"]

    # Borsa bakiyesini Redis cache'ten oku
    exchange_balance = None
    try:
        raw = await redis.get(f"exchange:mexc:balance:{user_id}")
        if raw:
            exchange_balance = json.loads(raw)
    except Exception:
        pass

    return {
        **portfolio,
        "equity": round(equity, 2),
        "roi": round((equity - portfolio["initial_balance"]) / max(1, portfolio["initial_balance"]) * 100, 2),
        "win_rate": round(portfolio["total_wins"] / max(1, portfolio["total_trades"]) * 100, 1),
        "exchange_balance": exchange_balance,
    }


@router.post("/portfolio/sync-exchange")
async def sync_exchange_balance(user = Depends(get_current_user_obj)):
    """Borsadaki gerçek bakiyeyi Redis'e cache'le."""
    redis = get_redis()
    user_id = str(user.id)
    raw_keys = await redis.get(f"exchange_keys:{user_id}:mexc")
    if not raw_keys:
        return {"error": "MEXC API key bulunamadı"}

    keys = json.loads(raw_keys)
    try:
        from exchange.exchange_factory import fetch_balance_for
        balance = await fetch_balance_for("mexc", keys["api_key"], keys["secret"], keys.get("passphrase", ""))
        await redis.set(f"exchange:mexc:balance:{user_id}", json.dumps(balance), ex=120)
        return balance
    except Exception as e:
        return {"error": str(e)}


@router.post("/portfolio/reset")
async def reset_portfolio(data: dict = None, user_id: int = Depends(get_current_user)):
    """Portföyü sıfırla. Opsiyonel: initial_balance gönder."""
    from services.scanner_simulator import _save_portfolio
    redis = get_redis()
    initial = float((data or {}).get("initial_balance", 1000))
    portfolio = {
        "initial_balance": initial,
        "balance": initial,
        "reserved": 0.0,
        "total_pnl": 0.0,
        "peak_equity": initial,
        "max_drawdown": 0.0,
        "total_trades": 0,
        "total_wins": 0,
    }
    await _save_portfolio(redis, portfolio)
    return portfolio


@router.post("/deploy-to-bot")
async def deploy_to_bot(data: dict = None, user_id: int = Depends(get_current_user)):
    """Simülasyon ayarlarını Smart Scanner botu olarak deploy et."""
    from models.trade import Bot, BotStatus
    from sqlalchemy import select

    redis = get_redis()
    sim_cfg = await get_sim_settings(user_id)
    overrides = data or {}

    # Bot parametreleri — simulator ayarlarından oluştur
    # Engine "selection_mode" bekler (mode değil), "min_ai_confidence" bekler (min_confidence değil)
    bot_params = {
        "selection_mode": sim_cfg.get("mode", "ai"),  # engine: params.get("selection_mode")
        "min_ai_confidence": sim_cfg.get("min_confidence", 65),  # engine: params.get("min_ai_confidence")
        "leverage": sim_cfg.get("max_leverage", 75),  # default leverage for manual mode
        "min_leverage": sim_cfg.get("min_leverage", 3),
        "max_leverage": sim_cfg.get("max_leverage", 75),
        "max_positions": sim_cfg.get("max_open", 5),
        "tp_pct": sim_cfg.get("tp_pct", 1.5),
        "sl_pct": sim_cfg.get("sl_pct", 0.8),
        "auto_scale_tp_sl": sim_cfg.get("auto_scale_tp_sl", True),
        "scale_base_leverage": sim_cfg.get("scale_base_leverage", 10),
        "trailing_enabled": sim_cfg.get("trailing_enabled", False),
        "trailing_activate_pct": sim_cfg.get("trailing_activate_pct", 0.3),
        "trailing_callback_pct": sim_cfg.get("trailing_callback_pct", 0.15),
        "hedge_enabled": sim_cfg.get("hedge_enabled", False),
        "hedge_tp_pct": sim_cfg.get("hedge_tp_pct", 0.4),
        "hedge_sl_pct": sim_cfg.get("hedge_sl_pct", 0.1),
        "hedge_use_max_leverage": sim_cfg.get("hedge_use_max_leverage", True),
        "trade_size_mode": sim_cfg.get("trade_size_mode", "fixed"),
        "trade_size_value": sim_cfg.get("trade_size_value", 100),
        "margin_type": sim_cfg.get("margin_type", "cross"),
    }

    # Performans verisi ekle
    stats_data = await simulation_stats(user_id)

    bot_name = overrides.get("name", "Smart Scanner Bot")
    paper_mode = overrides.get("paper_mode", True)
    exchange = overrides.get("exchange", "mexc")
    leverage = sim_cfg.get("max_leverage", 75)
    initial_balance = overrides.get("initial_balance", sim_cfg.get("trade_size_value", 100) * sim_cfg.get("max_open", 5))

    async with async_session() as session:
        bot = Bot(
            user_id=user_id,
            name=bot_name,
            symbol="MULTI",  # Çoklu coin — smart scanner
            strategy="smart_scanner",
            exchange=exchange,
            status=BotStatus.STOPPED,
            paper_mode=paper_mode,
            leverage=leverage,
            risk_per_trade=0.02,
            max_daily_loss=0.10,
            initial_balance=initial_balance,
            params=json.dumps(bot_params),
        )
        session.add(bot)
        await session.commit()
        await session.refresh(bot)

    return {
        "bot_id": bot.id,
        "name": bot_name,
        "strategy": "smart_scanner",
        "exchange": exchange,
        "paper_mode": paper_mode,
        "leverage": leverage,
        "params": bot_params,
        "sim_performance": {
            "win_rate": stats_data.get("win_rate", 0),
            "total_pnl": stats_data.get("total_pnl_usdt", 0),
            "profit_factor": stats_data.get("profit_factor", 0),
            "total_trades": stats_data.get("total", 0),
        },
        "message": f"Bot '{bot_name}' oluşturuldu! Bots sayfasından başlatabilirsiniz.",
    }


@router.post("/copy-to-bot")
async def copy_sim_to_bot(user_id: int = Depends(get_current_user)):
    """Simülasyon ayarlarını gerçek 'smart_scanner' botuna kopyala ve (eğer çalışmıyorsa) çalıştır."""
    from models.trade import Bot, BotStatus
    from core.database import async_session
    from sqlalchemy import select

    # Güncel simülasyon ayarlarını Redis'ten al (kullanıcıya özel)
    redis = get_redis()
    raw_cfg = await redis.get(f"scanner_sim:settings:{user_id}")
    if not raw_cfg:
        # Lazy migration: global key varsa kullanıcıya taşı
        raw_cfg = await redis.get("scanner_sim:settings")
        if raw_cfg:
            await redis.set(f"scanner_sim:settings:{user_id}", raw_cfg)
    sim_cfg = json.loads(raw_cfg) if raw_cfg else {}

    # Bot parametrelerini hazırla (create_smart_bot ile aynı yapı)
    bot_params = {
        "auto_tp_sl": sim_cfg.get("auto_tp_sl", True),
        "tp_pct": sim_cfg.get("tp_pct", 1.5),
        "sl_pct": sim_cfg.get("sl_pct", 0.8),
        "auto_scale_tp_sl": sim_cfg.get("auto_scale_tp_sl", True),
        "scale_base_leverage": sim_cfg.get("scale_base_leverage", 10),
        "trailing_enabled": sim_cfg.get("trailing_enabled", False),
        "trailing_activate_pct": sim_cfg.get("trailing_activate_pct", 0.3),
        "trailing_callback_pct": sim_cfg.get("trailing_callback_pct", 0.15),
        "hedge_enabled": sim_cfg.get("hedge_enabled", False),
        "hedge_tp_pct": sim_cfg.get("hedge_tp_pct", 0.4),
        "hedge_sl_pct": sim_cfg.get("hedge_sl_pct", 0.1),
        "hedge_use_max_leverage": sim_cfg.get("hedge_use_max_leverage", True),
        "trade_size_mode": sim_cfg.get("trade_size_mode", "fixed"),
        "trade_size_value": sim_cfg.get("trade_size_value", 100),
        "margin_type": sim_cfg.get("margin_type", "cross"),
    }

    leverage = sim_cfg.get("max_leverage", 75)
    
    async with async_session() as session:
        # Mevcut bir smart_scanner botu bul (kullanıcıya ait)
        result = await session.execute(select(Bot).where(Bot.strategy == "smart_scanner", Bot.user_id == user_id).limit(1))
        bot = result.scalar_one_or_none()

        if bot:
            # Var olan botu güncelle
            bot.params = json.dumps(bot_params)
            bot.leverage = leverage
            bot.paper_mode = False # Gerçek borsa moduna geçir
            
            # Eğer bot duruyorsa, çalıştır
            if bot.status != BotStatus.RUNNING:
                bot.status = BotStatus.RUNNING
                
            await session.commit()
            bot_name = bot.name
        else:
            # Eğer yoksa yeni bot oluştur ve başlat
            initial_balance = sim_cfg.get("trade_size_value", 100) * sim_cfg.get("max_open", 5)
            bot = Bot(
                user_id=user_id,
                name="Smart Scanner Bot",
                symbol="MULTI",
                strategy="smart_scanner",
                exchange="mexc",
                status=BotStatus.RUNNING,
                paper_mode=False,
                leverage=leverage,
                risk_per_trade=0.02,
                max_daily_loss=0.10,
                initial_balance=initial_balance,
                params=json.dumps(bot_params),
            )
            session.add(bot)
            await session.commit()
            bot_name = bot.name

    return {
        "success": True,
        "message": f"Simülasyon ayarları '{bot_name}' botuna kopyalandı ve gerçek işlemler başlatıldı!"
    }


@router.delete("/{sim_id}")
async def delete_simulation(sim_id: int, user_id: int = Depends(get_current_user)):
    """Tek bir simülasyonu sil (kullanıcıya ait)."""
    async with async_session() as session:
        await session.execute(text("DELETE FROM scanner_simulations WHERE id = :id AND (user_id = :uid OR user_id IS NULL)"), {"id": sim_id, "uid": user_id})
        await session.commit()
    return {"deleted": sim_id}


@router.delete("")
async def clear_simulations(status: str = None, user_id: int = Depends(get_current_user)):
    """Kullanıcıya ait simülasyonları temizle."""
    async with async_session() as session:
        if status:
            await session.execute(text("DELETE FROM scanner_simulations WHERE status = :s AND (user_id = :uid OR user_id IS NULL)"), {"s": status, "uid": user_id})
        else:
            await session.execute(text("DELETE FROM scanner_simulations WHERE (user_id = :uid OR user_id IS NULL)"), {"uid": user_id})
        await session.commit()
    return {"cleared": status or "all"}


@router.get("/stats/scenarios")
async def scenario_analysis(user = Depends(get_current_user_obj)):
    """
    3 farklı senaryo ile simülasyon performansını karşılaştır.
    1. Tüm sinyallere girseydik (all-in)
    2. Borsa bakiyesiyle max N işlem (portföy simülasyonu)
    3. Sadece yüksek güvenli sinyaller (AI >80)
    """
    redis = get_redis()
    user_id = user.id
    sim_cfg = await get_sim_settings(user_id)

    # Borsa bakiyesi
    exchange_bal = None
    try:
        raw = await redis.get(f"exchange:mexc:balance:{user_id}")
        if raw:
            exchange_bal = json.loads(raw)
    except Exception:
        pass

    real_balance = float(exchange_bal.get("free", 0)) if exchange_bal else 0
    max_open = sim_cfg.get("max_open", 3)
    margin_per_trade = round(real_balance / max(1, max_open), 2) if real_balance > 0 else float(sim_cfg.get("trade_size_value", 100))

    async with async_session() as session:
        # Tüm kapanmış simülasyonlar (kullanıcıya ait)
        result = await session.execute(text("""
            SELECT id, coin, direction, confidence, leverage,
                   entry_price, exit_price, tp_pct, sl_pct,
                   pnl_pct, pnl_usdt, status, exit_reason,
                   COALESCE(margin_usdt, 100) as margin_usdt,
                   created_at, closed_at, duration_minutes,
                   max_favorable_pct, max_adverse_pct,
                   atr_pct
            FROM scanner_simulations
            WHERE status IN ('win', 'loss') AND (user_id = :uid OR user_id IS NULL)
            ORDER BY closed_at DESC
        """), {"uid": user_id})
        rows = result.fetchall()

    cols = ["id", "coin", "direction", "confidence", "leverage",
            "entry_price", "exit_price", "tp_pct", "sl_pct",
            "pnl_pct", "pnl_usdt", "status", "exit_reason",
            "margin_usdt", "created_at", "closed_at", "duration_minutes",
            "max_favorable_pct", "max_adverse_pct", "atr_pct"]
    trades = [dict(zip(cols, row)) for row in rows]

    if not trades:
        empty = {
            "total": 0, "wins": 0, "losses": 0, "win_rate": 0,
            "total_pnl": 0, "avg_pnl": 0, "best_trade": 0, "worst_trade": 0,
            "profit_factor": 0, "avg_duration_min": 0,
        }
        return {
            "scenario_all": {**empty, "label": "Tum Sinyallere Girseydik", "description": "Gelen tum sinyallere islem acilsaydi"},
            "scenario_portfolio": {**empty, "label": "Borsa Bakiyesiyle", "description": f"${real_balance:.0f} bakiye, max {max_open} eşzamanlı işlem"},
            "scenario_high_conf": {**empty, "label": "Sadece Yuksek Guvenli", "description": "AI guven skoru >80 olan sinyaller"},
            "exchange_balance": real_balance,
            "margin_per_trade": margin_per_trade,
            "max_concurrent": max_open,
        }

    def _calc_scenario(filtered_trades, sim_margin_override=None):
        if not filtered_trades:
            return {
                "total": 0, "wins": 0, "losses": 0, "win_rate": 0,
                "total_pnl": 0, "avg_pnl": 0, "best_trade": 0, "worst_trade": 0,
                "profit_factor": 0, "avg_duration_min": 0,
            }
        wins = [t for t in filtered_trades if t["status"] == "win"]
        losses = [t for t in filtered_trades if t["status"] == "loss"]
        total = len(filtered_trades)

        # PnL hesapla (margin override varsa yeniden hesapla)
        pnl_list = []
        for t in filtered_trades:
            margin = sim_margin_override or float(t.get("margin_usdt") or 100)
            lev = t.get("leverage") or 50
            pct = t.get("pnl_pct") or 0
            pnl_list.append(margin * lev * pct / 100)

        total_pnl = sum(pnl_list)
        win_pnl = sum(p for p in pnl_list if p > 0)
        loss_pnl = abs(sum(p for p in pnl_list if p < 0))
        durations = [t["duration_minutes"] for t in filtered_trades if t.get("duration_minutes")]

        return {
            "total": total,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(len(wins) / max(1, total) * 100, 1),
            "total_pnl": round(total_pnl, 2),
            "avg_pnl": round(total_pnl / max(1, total), 2),
            "best_trade": round(max(pnl_list) if pnl_list else 0, 2),
            "worst_trade": round(min(pnl_list) if pnl_list else 0, 2),
            "profit_factor": round(win_pnl / max(0.01, loss_pnl), 2),
            "avg_duration_min": round(sum(durations) / max(1, len(durations)), 0) if durations else 0,
        }

    # Senaryo 1: Tüm sinyallere girseydik ($100 margin her biri)
    s1 = _calc_scenario(trades)
    s1["label"] = "Tum Sinyallere Girseydik"
    s1["description"] = f"Toplam {s1['total']} sinyalin hepsine $100 margin ile girseydik"

    # Senaryo 2: Borsa bakiyesiyle max N eşanlı işlem
    s2 = _calc_scenario(trades, sim_margin_override=margin_per_trade)
    s2["label"] = "Borsa Bakiyesiyle"
    s2["description"] = f"${real_balance:.0f} bakiye, max {max_open} eşzamanlı işlem, her biri ${margin_per_trade:.0f} margin"

    # Senaryo 3: Sadece yüksek güvenli (confidence > 80)
    high_conf = [t for t in trades if (t.get("confidence") or 0) >= 80]
    s3 = _calc_scenario(high_conf)
    s3["label"] = "Sadece Yuksek Guvenli"
    s3["description"] = f"AI guven skoru >=80 olan {s3['total']} sinyal"

    return {
        "scenario_all": s1,
        "scenario_portfolio": s2,
        "scenario_high_conf": s3,
        "exchange_balance": real_balance,
        "margin_per_trade": margin_per_trade,
        "max_concurrent": max_open,
    }


# ─── Push Notifications ───────────────────────────────────────────

from fastapi import Request

@router.post("/push/subscribe")
async def push_subscribe(req: Request, user=Depends(get_current_user_obj)):
    """Mobil PWA cihazından gelen push subscription'ı kaydeder."""
    try:
        sub = await req.json()
        from services.push_notification import save_subscription
        success = await save_subscription(sub, str(user.id))
        return {"success": success}
    except Exception as e:
        return {"error": str(e)}

@router.get("/push/public-key")
async def get_push_public_key():
    """Frontend'in PWA aboneliği için VAPID Public Key'ini döner."""
    from services.push_notification import VAPID_PUBLIC_KEY
    return {"key": VAPID_PUBLIC_KEY}
