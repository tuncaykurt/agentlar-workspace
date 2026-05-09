from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, desc
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models.trade import Trade, TradeStatus, SignalLog
from typing import Dict, Any, Optional

router = APIRouter(tags=["Analytics"])

@router.get("/analytics/dashboard")
async def get_dashboard_analytics(bot_id: int = None, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    # Base query for trades
    trades_query = select(Trade).where(Trade.status == TradeStatus.CLOSED)
    if bot_id:
        trades_query = trades_query.where(Trade.bot_id == bot_id)
        
    result = await db.execute(trades_query)
    trades = result.scalars().all()
    
    total_trades = len(trades)
    winning_trades = len([t for t in trades if (t.pnl or 0) > 0])
    losing_trades = len([t for t in trades if (t.pnl or 0) <= 0])
    
    win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0
    total_pnl = sum([t.pnl for t in trades if t.pnl])
    
    # Session performance
    sessions = {}
    for t in trades:
        sess = t.session_type or "unknown"
        if sess not in sessions:
            sessions[sess] = {"trades": 0, "wins": 0, "pnl": 0}
        sessions[sess]["trades"] += 1
        if (t.pnl or 0) > 0:
            sessions[sess]["wins"] += 1
        sessions[sess]["pnl"] += (t.pnl or 0)
        
    session_stats = []
    for sess, data in sessions.items():
        session_stats.append({
            "session": sess,
            "trades": data["trades"],
            "win_rate": (data["wins"] / data["trades"] * 100) if data["trades"] > 0 else 0,
            "pnl": round(data["pnl"], 2)
        })
        
    # Signals outcome (Intelligent filter data)
    signals_query = select(
        SignalLog.action, 
        func.count(SignalLog.id).label('count')
    ).group_by(SignalLog.action)
    
    if bot_id:
        signals_query = signals_query.where(SignalLog.bot_id == bot_id)
        
    sig_result = await db.execute(signals_query)
    signal_counts = sig_result.all()
    
    signals_data = {row.action: row.count for row in signal_counts}
    
    return {
        "overview": {
            "total_trades": total_trades,
            "win_rate": round(win_rate, 2),
            "total_pnl": round(total_pnl, 2),
            "winning_trades": winning_trades,
            "losing_trades": losing_trades
        },
        "session_performance": session_stats,
        "signal_stats": signals_data
    }


@router.get("/analytics/filtered-signals")
async def get_filtered_signals(
    bot_id: Optional[int] = None,
    action: Optional[str] = "filtered",  # filtered | rejected | all
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Filtrelenen / reddedilen sinyallerin listesi — neden filtrelendiği açıklamasıyla"""

    # Toplam sayı
    count_q = select(func.count(SignalLog.id))
    if action and action != "all":
        if action == "filtered":
            count_q = count_q.where(SignalLog.action.in_(["filtered", "rejected"]))
        else:
            count_q = count_q.where(SignalLog.action == action)
    if bot_id:
        count_q = count_q.where(SignalLog.bot_id == bot_id)

    total_count = (await db.execute(count_q)).scalar() or 0

    # Liste sorgusu
    q = select(SignalLog).order_by(desc(SignalLog.created_at)).limit(limit).offset(offset)
    if action and action != "all":
        if action == "filtered":
            q = q.where(SignalLog.action.in_(["filtered", "rejected"]))
        else:
            q = q.where(SignalLog.action == action)
    if bot_id:
        q = q.where(SignalLog.bot_id == bot_id)

    result = await db.execute(q)
    rows = result.scalars().all()

    # reject_reason parse ve label üretimi
    def build_reason_labels(log: SignalLog):
        raw = log.reject_reason or ""
        labels = []

        reason_map = {
            "news_protection":   {"label": "Haber Koruması",    "color": "orange", "icon": "📰"},
            "blackout_hours":    {"label": "Yasak Saat",         "color": "purple", "icon": "🕐"},
            "smart_hours":       {"label": "Akıllı Saat",        "color": "purple", "icon": "⏰"},
            "trend_filter":      {"label": "Trend Uyumsuz",      "color": "blue",   "icon": "📉"},
            "volatility":        {"label": "Yüksek Volatilite",  "color": "red",    "icon": "⚡"},
            "low_win_rate":      {"label": "Düşük Win Rate",     "color": "red",    "icon": "📊"},
            "rsi_extreme":       {"label": "RSI Aşırı Bölge",   "color": "yellow", "icon": "📈"},
            "self_learning":     {"label": "Öz-Öğrenme Engeli", "color": "indigo", "icon": "🧠"},
            "no_bot":            {"label": "Bot Bulunamadı",     "color": "gray",   "icon": "🤖"},
            "bot_stopped":       {"label": "Bot Durdurulmuş",   "color": "gray",   "icon": "⛔"},
            "position_open":     {"label": "Açık Pozisyon Var", "color": "yellow", "icon": "🔒"},
            "max_daily_loss":    {"label": "Günlük Zarar Limiti","color": "red",    "icon": "🛑"},
            "exchange_error":    {"label": "Borsa Hatası",       "color": "red",    "icon": "❌"},
        }

        matched = False
        for key, meta in reason_map.items():
            if key in raw.lower():
                labels.append(meta)
                matched = True

        if not matched and raw:
            labels.append({"label": raw[:80], "color": "gray", "icon": "ℹ️"})

        return labels

    items = []
    for log in rows:
        items.append({
            "id":           log.id,
            "symbol":       log.symbol,
            "signal_type":  log.signal_type,
            "action":       log.action,
            "source":       log.source or "tradingview",
            "price":        log.price,
            "rsi_14":       log.rsi_14,
            "volatility_atr": log.volatility_atr,
            "volume_ratio": log.volume_ratio,
            "ema200_dist":  log.ema200_dist,
            "reject_reason": log.reject_reason,
            "reason_labels": build_reason_labels(log),
            "created_at":   log.created_at.isoformat() if log.created_at else None,
        })

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": items,
    }
