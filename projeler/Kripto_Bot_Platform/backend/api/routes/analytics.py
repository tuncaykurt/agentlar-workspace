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
    action: Optional[str] = "blocked",  # blocked(filtered+rejected) | executed | all
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Filtrelenen / reddedilen / onaylanan sinyallerin listesi"""

    def action_filter(q, act):
        if act == "blocked":
            return q.where(SignalLog.action.in_(["filtered", "rejected"]))
        elif act == "executed":
            return q.where(SignalLog.action == "executed")
        else:  # all = blocked + executed (not raw "received")
            return q.where(SignalLog.action.in_(["filtered", "rejected", "executed"]))

    count_q = select(func.count(SignalLog.id))
    count_q = action_filter(count_q, action)
    if bot_id:
        count_q = count_q.where(SignalLog.bot_id == bot_id)
    total_count = (await db.execute(count_q)).scalar() or 0

    q = select(SignalLog).order_by(desc(SignalLog.created_at)).limit(limit).offset(offset)
    q = action_filter(q, action)
    if bot_id:
        q = q.where(SignalLog.bot_id == bot_id)

    result = await db.execute(q)
    rows = result.scalars().all()

    def build_reason_text(log: SignalLog) -> tuple[list, str]:
        """
        Ham reject_reason metnini insan tarafından anlaşılır Türkçe etiketlere çevirir.
        Dönen: (badges_listesi, açıklama_metni)
        """
        raw = (log.reject_reason or "").strip()
        raw_lower = raw.lower()
        labels = []
        description = ""

        # ── Sinyal modu uyumsuzluğu ──────────────────────────────────────────
        if "signal_mode=buy_only" in raw_lower and "sell" in raw_lower:
            labels.append({"label": "Mod Uyumsuzluğu", "color": "orange", "icon": "🔁"})
            description = "Bot sadece LONG (alım) sinyali almak üzere ayarlanmış. SHORT (satış) sinyali bu bot için işleme alınmaz."
        elif "signal_mode=sell_only" in raw_lower and "buy" in raw_lower:
            labels.append({"label": "Mod Uyumsuzluğu", "color": "orange", "icon": "🔁"})
            description = "Bot sadece SHORT (satış) sinyali almak üzere ayarlanmış. LONG (alım) sinyali bu bot için işleme alınmaz."

        # ── Haber / Ekonomik takvim koruması ─────────────────────────────────
        elif any(k in raw_lower for k in ["news_protection", "haber", "news", "economic", "calendar"]):
            labels.append({"label": "Haber Koruması", "color": "orange", "icon": "📰"})
            description = "Önemli bir ekonomik haber (FED, CPI, NFP vb.) açıklanmadan önce veya sonra işlem yapılması riskli. Bot, haber koruma süresi boyunca yeni pozisyon açmaz."

        # ── Yasak saat / Akıllı saat filtresi ────────────────────────────────
        elif any(k in raw_lower for k in ["blackout_hours", "smart_hours", "blocked_hour", "saat", "hour"]):
            labels.append({"label": "Yasak Saat Dilimi", "color": "purple", "icon": "🕐"})
            description = "Bu sinyal, botun işlem yapmadığı yasak saat dilimine denk geldi. Likiditenin düşük veya stresin yüksek olduğu saatlerde işlem yapılmaz."

        # ── EMA200 trend filtresi ─────────────────────────────────────────────
        elif any(k in raw_lower for k in ["trend_filter", "ema200", "trend", "bear", "bull"]):
            labels.append({"label": "Trend Uyumsuzluğu", "color": "blue", "icon": "📉"})
            d = log.ema200_dist
            extra = f" (EMA200 uzaklığı: {d:.2f}%)" if d is not None else ""
            direction = "LONG" if log.signal_type == "buy" else "SHORT"
            description = f"Fiyat EMA200 trendine karşı işaret veriyor. {direction} sinyali mevcut trendle uyumlu değil{extra}."

        # ── Volatilite filtresi ────────────────────────────────────────────────
        elif any(k in raw_lower for k in ["volatility", "atr", "volatil"]):
            labels.append({"label": "Yüksek Volatilite", "color": "red", "icon": "⚡"})
            atr = log.volatility_atr
            extra = f" (ATR: {atr:.4f})" if atr is not None else ""
            description = f"Piyasadaki fiyat dalgalanması (volatilite) çok yüksek. Yüksek volatilitede stop-loss seviyeleri çok geniş olur, risk artar{extra}."

        # ── RSI aşırı bölge ───────────────────────────────────────────────────
        elif any(k in raw_lower for k in ["rsi_extreme", "rsi", "overbought", "oversold"]):
            labels.append({"label": "RSI Aşırı Bölge", "color": "yellow", "icon": "📈"})
            rsi = log.rsi_14
            extra = f" (RSI: {rsi:.1f})" if rsi is not None else ""
            description = f"RSI göstergesi aşırı alım veya aşırı satım bölgesinde. Bu seviyede açılan pozisyonlar genellikle düzeltme riski taşır{extra}."

        # ── Öz-öğrenme / Win rate filtresi ────────────────────────────────────
        elif any(k in raw_lower for k in ["self_learning", "win_rate", "low_win", "başarı"]):
            labels.append({"label": "Düşük Başarı Oranı", "color": "indigo", "icon": "🧠"})
            description = "Yapay zeka öz-öğrenme modülü bu sinyal tipinin geçmiş başarı oranının çok düşük olduğunu tespit etti. Kayıp riskini azaltmak için sinyal engellendi."

        # ── Bot durumu ─────────────────────────────────────────────────────────
        elif "bot_stopped" in raw_lower or "bot durdurulmuş" in raw_lower:
            labels.append({"label": "Bot Durdurulmuş", "color": "gray", "icon": "⛔"})
            description = "Sinyal geldiğinde bot durdurulmuş durumdaydı. Çalışmayan bot yeni pozisyon açamaz."

        elif "no_bot" in raw_lower or "bot bulunam" in raw_lower:
            labels.append({"label": "Bot Bulunamadı", "color": "gray", "icon": "🤖"})
            description = "Bu webhook token'ına bağlı aktif bir bot bulunamadı."

        # ── Açık pozisyon ─────────────────────────────────────────────────────
        elif "position_open" in raw_lower or "açık pozisyon" in raw_lower:
            labels.append({"label": "Açık Pozisyon Var", "color": "yellow", "icon": "🔒"})
            description = "Bu sembolde zaten açık bir pozisyon mevcut. Bot aynı anda aynı sembolde birden fazla pozisyon açmaz."

        # ── Günlük zarar limiti ───────────────────────────────────────────────
        elif any(k in raw_lower for k in ["max_daily_loss", "günlük zarar", "daily_loss"]):
            labels.append({"label": "Günlük Zarar Limiti", "color": "red", "icon": "🛑"})
            description = "Botun belirlenen maksimum günlük zarar limitine ulaşıldı. Hesabı korumak için günün geri kalanında yeni işlem açılmaz."

        # ── Borsa / Bağlantı hatası ───────────────────────────────────────────
        elif any(k in raw_lower for k in ["exchange_error", "borsa hatası", "api error", "connection"]):
            labels.append({"label": "Borsa Bağlantı Hatası", "color": "red", "icon": "❌"})
            description = "Borsa API'sine bağlanırken bir hata oluştu. Sinyal işleme alınamadı."

        # ── Bilinmeyen / Ham metin ─────────────────────────────────────────────
        elif raw:
            labels.append({"label": "Sistem Engeli", "color": "gray", "icon": "ℹ️"})
            description = raw  # Ham metni göster

        return labels, description

    items = []
    for log in rows:
        reason_labels, reason_description = build_reason_text(log)

        # Süre: sinyal oluşturulmasından outcome anına kadar
        duration_minutes = None
        if log.created_at and log.outcome_at:
            try:
                delta = log.outcome_at.replace(tzinfo=None) - log.created_at.replace(tzinfo=None)
                duration_minutes = round(delta.total_seconds() / 60, 1)
            except Exception:
                pass

        # Filtre analizi (reason alanından — engine her zaman yazar)
        filter_analysis = log.reason or ""

        items.append({
            "id":               log.id,
            "symbol":           log.symbol,
            "signal_type":      log.signal_type,
            "action":           log.action,
            "source":           log.source or "tradingview",
            "timeframe":        log.timeframe,
            "price":            log.price,
            "tp_price":         log.tp_price,
            "sl_price":         log.sl_price,
            "rsi_14":           log.rsi_14,
            "volatility_atr":   log.volatility_atr,
            "volume_ratio":     log.volume_ratio,
            "ema200_dist":      log.ema200_dist,
            "reject_reason":    log.reject_reason,
            "reason_labels":    reason_labels,
            "reason_description": reason_description,
            "filter_analysis":  filter_analysis,
            "outcome":          log.outcome,
            "outcome_price":    log.outcome_price,
            "outcome_pnl_pct":  log.outcome_pnl_pct,
            "outcome_at":       log.outcome_at.isoformat() if log.outcome_at else None,
            "duration_minutes": duration_minutes,
            "created_at":       log.created_at.isoformat() if log.created_at else None,
        })

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": items,
    }
