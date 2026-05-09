from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models.trade import Trade, TradeStatus, SignalLog
from typing import Dict, Any

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
