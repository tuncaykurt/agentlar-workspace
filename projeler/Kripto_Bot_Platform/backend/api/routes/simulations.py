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
                   COALESCE(is_hedge, false) as is_hedge, hedge_pair_id{ai_log_col}
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
            "is_hedge", "hedge_pair_id"]
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
    """Simülatörün anlık durumu."""
    redis = get_redis()
    raw = await redis.get("scanner_sim:status")
    return json.loads(raw) if raw else {"running": False}


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
