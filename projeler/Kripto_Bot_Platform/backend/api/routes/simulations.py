"""
Scanner Simülasyon API — Sanal işlem takip, istatistik ve ayar endpoint'leri.
"""
from fastapi import APIRouter
from sqlalchemy import text
from core.database import async_session
from core.redis_client import get_redis
import json

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
async def list_simulations(status: str = None, limit: int = 50, offset: int = 0):
    """Simülasyonları listele. ?status=open|win|loss|expired ile filtrele."""
    has_ai_log = await _check_ai_log_col()
    ai_log_col = ", ai_log" if has_ai_log else ""

    async with async_session() as session:
        where = "WHERE 1=1"
        params = {"limit": limit, "offset": offset}
        if status:
            where += " AND status = :status"
            params["status"] = status

        result = await session.execute(text(f"""
            SELECT id, coin, symbol, direction, selection_mode, confidence, reason,
                   entry_price, tp_price, sl_price, tp_pct, sl_pct, leverage,
                   rsi_14, adx, volume_ratio, funding_rate, fear_greed, atr_pct, supertrend_dir,
                   status, exit_price, pnl_pct, pnl_usdt,
                   max_favorable_pct, max_adverse_pct,
                   ai_review, created_at, closed_at,
                   exit_reason, duration_minutes, first_move, first_move_pct,
                   COALESCE(is_hedge, false) as is_hedge, hedge_pair_id,
                   COALESCE(margin_usdt, 100) as margin_usdt{ai_log_col}
            FROM scanner_simulations
            {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), params)
        rows = result.fetchall()

        count_result = await session.execute(text(f"""
            SELECT COUNT(*) FROM scanner_simulations {where}
        """), params)
        total = count_result.scalar()

    cols = ["id", "coin", "symbol", "direction", "selection_mode", "confidence", "reason",
            "entry_price", "tp_price", "sl_price", "tp_pct", "sl_pct", "leverage",
            "rsi_14", "adx", "volume_ratio", "funding_rate", "fear_greed", "atr_pct", "supertrend_dir",
            "status", "exit_price", "pnl_pct", "pnl_usdt",
            "max_favorable_pct", "max_adverse_pct",
            "ai_review", "created_at", "closed_at",
            "exit_reason", "duration_minutes", "first_move", "first_move_pct",
            "is_hedge", "hedge_pair_id", "margin_usdt"]
    if has_ai_log:
        cols.append("ai_log")

    items = []
    for row in rows:
        d = dict(zip(cols, row))
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        d["closed_at"] = d["closed_at"].isoformat() if d["closed_at"] else None
        if not has_ai_log:
            d["ai_log"] = None
        items.append(d)

    return {"items": items, "total": total}


@router.get("/stats")
async def simulation_stats():
    """Genel simülasyon istatistikleri."""
    async with async_session() as session:
        result = await session.execute(text("""
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
        """))
        row = result.fetchone()

    total = row[0] or 0
    wins = row[1] or 0
    losses = row[2] or 0
    closed = wins + losses

    # Yön bazlı analiz
    async with async_session() as session:
        dir_result = await session.execute(text("""
            SELECT direction,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'win') as wins,
                   COALESCE(AVG(pnl_pct) FILTER (WHERE status IN ('win','loss')), 0) as avg_pnl
            FROM scanner_simulations
            WHERE status IN ('win', 'loss')
            GROUP BY direction
        """))
        dir_rows = dir_result.fetchall()

    direction_stats = {}
    for dr in dir_rows:
        direction_stats[dr[0]] = {
            "total": dr[1], "wins": dr[2],
            "win_rate": round(dr[2] / max(1, dr[1]) * 100, 1),
            "avg_pnl": round(dr[3], 2),
        }

    # En iyi/kötü coinler
    async with async_session() as session:
        coin_result = await session.execute(text("""
            SELECT coin,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'win') as wins,
                   COUNT(*) FILTER (WHERE status = 'loss') as losses,
                   COALESCE(SUM(pnl_usdt), 0) as total_pnl
            FROM scanner_simulations
            WHERE status IN ('win', 'loss')
            GROUP BY coin
            HAVING COUNT(*) >= 2
            ORDER BY COALESCE(SUM(pnl_usdt), 0) DESC
        """))
        coin_rows = coin_result.fetchall()

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
        "coin_performance": coin_stats[:10],
    }


@router.get("/settings")
async def get_sim_settings():
    """Simülasyon ayarlarını getir."""
    redis = get_redis()
    raw = await redis.get("scanner_sim:settings")
    if raw:
        return json.loads(raw)
    return {
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


@router.post("/settings")
async def update_sim_settings(data: dict):
    """Simülasyon ayarlarını güncelle."""
    redis = get_redis()
    current = await get_sim_settings()
    current.update(data)
    await redis.set("scanner_sim:settings", json.dumps(current))
    return current


@router.get("/status")
async def sim_status():
    """Simülatörün anlık durumu + MEXC WS bilgisi."""
    redis = get_redis()
    raw = await redis.get("scanner_sim:status")
    status = json.loads(raw) if raw else {"running": False}

    # MEXC WebSocket durumunu ekle
    try:
        ws_keys = []
        cursor = b"0"
        while True:
            cursor, keys = await redis.scan(cursor, match="ticker:mexc:*", count=200)
            ws_keys.extend(keys)
            if cursor == b"0" or cursor == 0:
                break
        status["mexc_ws"] = {
            "active_tickers": len(ws_keys),
            "connected": len(ws_keys) > 0,
        }
    except Exception:
        status["mexc_ws"] = {"active_tickers": 0, "connected": False}

    return status


@router.get("/ws-prices")
async def ws_prices():
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
async def trigger_simulation():
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
async def get_portfolio():
    """Sanal portföy durumunu getir + borsa bakiyesi."""
    from services.scanner_simulator import _get_portfolio
    redis = get_redis()
    portfolio = await _get_portfolio(redis)
    equity = portfolio["balance"] + portfolio["reserved"]

    # Borsa bakiyesini Redis cache'ten oku
    exchange_balance = None
    try:
        raw = await redis.get("exchange:mexc:balance")
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
async def sync_exchange_balance():
    """Borsadaki gerçek bakiyeyi Redis'e cache'le."""
    redis = get_redis()
    raw_keys = await redis.get("exchange_keys:default:mexc")
    if not raw_keys:
        return {"error": "MEXC API key bulunamadı"}

    keys = json.loads(raw_keys)
    try:
        from exchange.exchange_factory import fetch_balance_for
        balance = await fetch_balance_for("mexc", keys["api_key"], keys["secret"], keys.get("passphrase", ""))
        await redis.set("exchange:mexc:balance", json.dumps(balance), ex=120)
        return balance
    except Exception as e:
        return {"error": str(e)}


@router.post("/portfolio/reset")
async def reset_portfolio(data: dict = None):
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
async def deploy_to_bot(data: dict = None):
    """Simülasyon ayarlarını Smart Scanner botu olarak deploy et."""
    from models.trade import Bot, BotStatus
    from sqlalchemy import select

    redis = get_redis()
    sim_cfg = await get_sim_settings()
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
    stats_data = await simulation_stats()

    bot_name = overrides.get("name", "Smart Scanner Bot")
    paper_mode = overrides.get("paper_mode", True)
    exchange = overrides.get("exchange", "mexc")
    leverage = sim_cfg.get("max_leverage", 75)
    initial_balance = overrides.get("initial_balance", sim_cfg.get("trade_size_value", 100) * sim_cfg.get("max_open", 5))

    async with async_session() as session:
        bot = Bot(
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


@router.delete("/{sim_id}")
async def delete_simulation(sim_id: int):
    """Tek bir simülasyonu sil."""
    async with async_session() as session:
        await session.execute(text("DELETE FROM scanner_simulations WHERE id = :id"), {"id": sim_id})
        await session.commit()
    return {"deleted": sim_id}


@router.delete("")
async def clear_simulations(status: str = None):
    """Tüm veya belirli statüdeki simülasyonları temizle."""
    async with async_session() as session:
        if status:
            await session.execute(text("DELETE FROM scanner_simulations WHERE status = :s"), {"s": status})
        else:
            await session.execute(text("DELETE FROM scanner_simulations"))
        await session.commit()
    return {"cleared": status or "all"}
