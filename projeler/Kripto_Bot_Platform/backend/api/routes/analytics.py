from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, desc
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models.trade import Trade, TradeStatus, SignalLog
from typing import Dict, Any, Optional, List
import math

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
    # "received" ara durumdur (her sinyal received + executed/filtered/rejected/analyzed üretir)
    # Gerçek sinyal sayısı için sadece nihai durumları say
    signals_query = select(
        SignalLog.action,
        func.count(SignalLog.id).label('count')
    ).where(
        SignalLog.action.in_(["executed", "filtered", "rejected", "analyzed", "error"])
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
        elif act == "analyzed":
            return q.where(SignalLog.action == "analyzed")
        else:  # all = tüm sinyal kayıtları (received dahil)
            return q.where(SignalLog.action.in_(["filtered", "rejected", "executed", "analyzed"]))

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
            # Sinyal aralığı analizi
            "max_price_in_range":  getattr(log, "max_price_in_range", None),
            "min_price_in_range":  getattr(log, "min_price_in_range", None),
            "max_favorable_pct":   getattr(log, "max_favorable_pct", None),
            "tp_was_reachable":    getattr(log, "tp_was_reachable", None),
            "sl_was_hit":          getattr(log, "sl_was_hit", None),
        })

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


# ─── Filtre Performans Analizi ─────────────────────────────────────────────────

# Her filtrenin "reason" alanındaki marker'ı ve reject_reason anahtar kelimeleri
_FILTER_DEFS = [
    {
        "id":              "trend_filter",
        "name":            "Trend Filtresi (EMA200)",
        "icon":            "📈",
        "field":           "trend_filter_enabled",
        # analyzed sinyallerin reason alanında aranan marker
        "engel_markers":   ["trend[✗", "ema200[✗", "📈 trend[✗"],
        # filtered sinyallerin reject_reason alanında aranan kelimeler
        "reject_keywords": ["trend", "ema200"],
    },
    {
        "id":              "volatility_filter",
        "name":            "Volatilite Filtresi (ATR)",
        "icon":            "⚡",
        "field":           "volatility_filter_enabled",
        "engel_markers":   ["volatilite[✗", "⚡ volatilite[✗"],
        "reject_keywords": ["volatilite", "volatility", "atr"],
    },
    {
        "id":              "news_filter",
        "name":            "Haber Koruması",
        "icon":            "📰",
        "field":           "news_protection_enabled",
        "engel_markers":   ["haber[✗", "📰 haber[✗"],
        "reject_keywords": ["haber", "news", "blackout", "economic"],
    },
    {
        "id":              "hours_filter",
        "name":            "Yasak Saat Dilimi",
        "icon":            "🕐",
        "field":           "smart_hours_enabled",
        "engel_markers":   ["saat[✗", "🕐 saat[✗"],
        "reject_keywords": ["saat", "hour", "utc yasaklı", "akıllı saat"],
    },
    {
        "id":              "self_learning",
        "name":            "Öz-Öğrenme Filtresi",
        "icon":            "🧠",
        "field":           "self_learning_enabled",
        "engel_markers":   ["öz-öğrenme[✗", "🧠 öz-öğrenme[✗"],
        "reject_keywords": ["öz-öğrenme", "win rate", "win_rate", "self_learning", "başarı oranı"],
    },
]


@router.get("/analytics/filter-stats")
async def get_filter_stats(
    bot_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Her akıllı filtre için performans metrikleri.
    Kaynak: action="analyzed" olan sinyaller (pasif analiz + outcome takibi).
      - reason alanı: hangi filtrelerin [✗ ENGEL] tetiklendiğini gösterir
      - outcome: tp_hit / sl_hit (signal_tracker tarafından doldurulur)

    Metrik tanımları:
      correct_block : filtre blokladı + outcome=sl_hit  → zarar önlendi ✓
      wrong_block   : filtre blokladı + outcome=tp_hit  → kâr kaçırıldı ✗
      accuracy      : correct_block / (correct_block + wrong_block) × 100
    """

    # 1. Outcome bilgisi olan "analyzed" sinyaller
    analyzed_q = select(SignalLog).where(
        SignalLog.action == "analyzed",
        SignalLog.outcome.in_(["tp_hit", "sl_hit"]),
    )
    if bot_id:
        analyzed_q = analyzed_q.where(SignalLog.bot_id == bot_id)
    analyzed = (await db.execute(analyzed_q)).scalars().all()

    # 2. Gerçekte engellenmiş sinyaller (engine'den filtered/rejected)
    filtered_q = select(SignalLog).where(
        SignalLog.action.in_(["filtered", "rejected"]),
    )
    if bot_id:
        filtered_q = filtered_q.where(SignalLog.bot_id == bot_id)
    filtered = (await db.execute(filtered_q)).scalars().all()

    # 3. Onaylanıp işleme giren sinyaller (tüm filtreleri geçti)
    executed_q = select(SignalLog).where(
        SignalLog.action == "executed",
        SignalLog.outcome.in_(["tp_hit", "sl_hit"]),
    )
    if bot_id:
        executed_q = executed_q.where(SignalLog.bot_id == bot_id)
    executed = (await db.execute(executed_q)).scalars().all()

    # Baseline win rate (filtreleri geçen sinyaller)
    exec_tp   = sum(1 for s in executed if s.outcome == "tp_hit")
    exec_sl   = sum(1 for s in executed if s.outcome == "sl_hit")
    exec_total = exec_tp + exec_sl
    exec_win_rate = round(exec_tp / exec_total * 100, 1) if exec_total > 0 else None

    # Per-filter hesaplama
    filter_stats: List[Dict] = []
    for fdef in _FILTER_DEFS:
        markers  = [m.lower() for m in fdef["engel_markers"]]
        keywords = [k.lower() for k in fdef["reject_keywords"]]

        correct_block = 0   # sl_hit + filter fired  → doğru engel
        wrong_block   = 0   # tp_hit + filter fired  → yanlış engel (kâr kaçırıldı)
        passed_tp     = 0   # filtre geçti + tp_hit
        passed_sl     = 0   # filtre geçti + sl_hit

        for sig in analyzed:
            reason_lc = (sig.reason or "").lower()
            blocked   = any(m in reason_lc for m in markers)
            if blocked:
                if sig.outcome == "sl_hit":
                    correct_block += 1
                else:
                    wrong_block += 1
            else:
                if sig.outcome == "tp_hit":
                    passed_tp += 1
                else:
                    passed_sl += 1

        hyp_total = correct_block + wrong_block
        accuracy  = round(correct_block / hyp_total * 100, 1) if hyp_total > 0 else None
        passed_total = passed_tp + passed_sl
        passed_wr = round(passed_tp / passed_total * 100, 1) if passed_total > 0 else None

        # Gerçek engel sayısı (engine'den filtered sinyaller)
        actual_blocks = sum(
            1 for s in filtered
            if any(k in (s.reject_reason or "").lower() for k in keywords)
        )

        filter_stats.append({
            "id":            fdef["id"],
            "name":          fdef["name"],
            "icon":          fdef["icon"],
            "field":         fdef["field"],
            # Hipotetik (analyzed üzerinden hesaplanmış)
            "hyp_total":        hyp_total,
            "correct_block":    correct_block,
            "wrong_block":      wrong_block,
            "accuracy":         accuracy,
            # Filtre geçen sinyallerin win rate'i
            "passed_total":     passed_total,
            "passed_win_rate":  passed_wr,
            # Gerçek engine engeli
            "actual_blocks":    actual_blocks,
            # Öneri: filtre mi açık kalmalı?
            "recommendation":   (
                "keep_on"  if accuracy is not None and accuracy >= 60 else
                "keep_off" if accuracy is not None and accuracy < 40 else
                "neutral"
            ),
        })

    return {
        "filter_stats":         filter_stats,
        "analyzed_with_outcome": len(analyzed),
        "baseline": {
            "executed_total":   exec_total,
            "executed_win_rate": exec_win_rate,
        },
    }


# ─── AI TP/SL Öneri Motoru ────────────────────────────────────────────────────

@router.get("/analytics/suggest-tp-sl")
async def suggest_tp_sl(
    bot_id:         Optional[int]   = None,
    symbol:         Optional[str]   = None,
    signal_type:    Optional[str]   = None,   # "buy" | "sell" | None = her ikisi
    rsi_14:         Optional[float] = None,   # anlık piyasa bağlamı (opsiyonel)
    volatility_atr: Optional[float] = None,
    db:             AsyncSession    = Depends(get_db),
) -> Dict[str, Any]:
    """
    Geçmiş sinyal aralığı analiz verilerinden (max_favorable_pct, price ranges)
    Kelly Kriteri + Beklenen Değer optimizasyonu ile optimal TP% ve SL% hesaplar.

    Eğer anlık piyasa bağlamı (rsi_14, volatility_atr) verilirse, benzer
    koşullardaki geçmiş sinyallere ağırlık verir (koşullu öneri).
    """
    # 1. Tamamlanmış aralık analizi olan sinyalleri çek
    q = select(SignalLog).where(
        SignalLog.max_favorable_pct.isnot(None),
        SignalLog.price.isnot(None),
        SignalLog.min_price_in_range.isnot(None),
        SignalLog.max_price_in_range.isnot(None),
    )
    if bot_id:
        q = q.where(SignalLog.bot_id == bot_id)
    if symbol:
        q = q.where(SignalLog.symbol == symbol)
    if signal_type:
        q = q.where(SignalLog.signal_type == signal_type)

    rows = (await db.execute(q)).scalars().all()

    if len(rows) < 5:
        return {
            "sample_size": len(rows),
            "suggested_tp_pct": None,
            "suggested_sl_pct": None,
            "confidence": "insufficient",
            "message": "Yeterli geçmiş veri yok (en az 5 tamamlanmış sinyal gerekli).",
        }

    # 2. Her sinyal için favorable/adverse % hesapla
    signals_data = []
    for s in rows:
        entry = s.price
        if not entry or entry <= 0:
            continue
        is_long = (s.signal_type or "buy") == "buy"
        fav_pct = s.max_favorable_pct  # zaten hesaplanmış

        if is_long:
            adv_pct = (entry - s.min_price_in_range) / entry * 100
        else:
            adv_pct = (s.max_price_in_range - entry) / entry * 100

        if fav_pct is None or adv_pct is None or fav_pct < 0 or adv_pct < 0:
            continue

        # Koşullu ağırlık: anlık piyasa koşullarına yakın sinyaller daha önemli
        weight = 1.0
        if rsi_14 is not None and s.rsi_14 is not None:
            rsi_dist = abs(rsi_14 - s.rsi_14)
            weight *= max(0.2, 1.0 - rsi_dist / 50.0)
        if volatility_atr is not None and s.volatility_atr is not None and s.volatility_atr > 0:
            vol_ratio = min(volatility_atr, s.volatility_atr) / max(volatility_atr, s.volatility_atr)
            weight *= max(0.3, vol_ratio)

        signals_data.append({"fav": fav_pct, "adv": adv_pct, "w": weight})

    n = len(signals_data)
    if n < 5:
        return {
            "sample_size": n,
            "suggested_tp_pct": None,
            "suggested_sl_pct": None,
            "confidence": "insufficient",
            "message": "Hesaplanabilir sinyal sayısı yetersiz.",
        }

    total_weight = sum(d["w"] for d in signals_data)

    # 3. Favorable dağılım — ağırlıklı yüzdelikler
    sorted_fav = sorted(signals_data, key=lambda x: x["fav"])
    sorted_adv = sorted(signals_data, key=lambda x: x["adv"])

    def weighted_percentile(sorted_data: list, key: str, pct: float) -> float:
        """Ağırlıklı yüzdelik hesapla (0–100 arası pct)."""
        target = total_weight * pct / 100.0
        cumsum = 0.0
        for d in sorted_data:
            cumsum += d["w"]
            if cumsum >= target:
                return d[key]
        return sorted_data[-1][key]

    fav_p25 = weighted_percentile(sorted_fav, "fav", 25)
    fav_p50 = weighted_percentile(sorted_fav, "fav", 50)
    fav_p75 = weighted_percentile(sorted_fav, "fav", 75)
    adv_p25 = weighted_percentile(sorted_adv, "adv", 25)
    adv_p50 = weighted_percentile(sorted_adv, "adv", 50)

    # 4. Kelly Kriteri / Beklenen Değer optimizasyonu
    #    TP adayları: 0.3% → 20% (0.1 adım)
    #    SL adayları: 0.2% → 15% (0.1 adım)
    #    P(win | tp) = ağırlıklı oran(fav >= tp)
    #    P(loss | sl) = ağırlıklı oran(adv >= sl VE fav < tp)
    #    EV = P(win)*tp - P(loss)*sl
    #    En yüksek EV'i veren (tp, sl) çifti seçilir

    best_ev   = -999.0
    best_tp   = round(fav_p50, 1)
    best_sl   = round(adv_p25, 1)
    best_pwin = 0.0
    best_ploss= 0.0

    tp_range = [round(x * 0.1, 1) for x in range(3, 201)]   # 0.3 → 20.0
    sl_range = [round(x * 0.1, 1) for x in range(2, 151)]   # 0.2 → 15.0

    for tp in tp_range:
        w_win = sum(d["w"] for d in signals_data if d["fav"] >= tp)
        p_win = w_win / total_weight

        for sl in sl_range:
            w_loss = sum(d["w"] for d in signals_data if d["adv"] >= sl and d["fav"] < tp)
            p_loss = w_loss / total_weight

            ev = p_win * tp - p_loss * sl
            if ev > best_ev:
                best_ev   = ev
                best_tp   = tp
                best_sl   = sl
                best_pwin = p_win
                best_ploss= p_loss

    # 5. Güven seviyesi
    if n >= 50:
        confidence = "high"
    elif n >= 20:
        confidence = "medium"
    else:
        confidence = "low"

    rr = round(best_tp / best_sl, 2) if best_sl > 0 else None

    # Koşullu mod: anlık piyasa bağlamı verildi mi?
    method = "statistical"
    if rsi_14 is not None or volatility_atr is not None:
        method = "context_weighted"

    # 6. Açıklama metinleri
    reasoning = [
        f"{n} tamamlanmış sinyal analiz edildi",
        f"Ortalama max kazanç potansiyeli: %{round(fav_p50, 2)}",
        f"Optimal TP hedefi: %{best_tp} → %{round(best_pwin * 100, 1)} olasılıkla ulaşılır",
        f"Optimal SL: %{best_sl} → %{round(best_ploss * 100, 1)} olasılıkla vurulur",
        f"Beklenen değer (EV): %{round(best_ev, 3)} / işlem",
    ]
    if rr:
        reasoning.append(f"R/R oranı: 1:{rr}")
    if method == "context_weighted":
        reasoning.append("Anlık piyasa koşullarına göre ağırlıklandırıldı")

    return {
        "sample_size":      n,
        "suggested_tp_pct": best_tp,
        "suggested_sl_pct": best_sl,
        "confidence":       confidence,
        "method":           method,
        "win_probability":  round(best_pwin, 3),
        "loss_probability": round(best_ploss, 3),
        "ev_score":         round(best_ev, 4),
        "rr_ratio":         rr,
        "distribution": {
            "fav_p25": round(fav_p25, 2),
            "fav_p50": round(fav_p50, 2),
            "fav_p75": round(fav_p75, 2),
            "adv_p25": round(adv_p25, 2),
            "adv_p50": round(adv_p50, 2),
        },
        "reasoning": reasoning,
    }


@router.delete("/analytics/clear-signals")
async def clear_all_signals(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """
    Tüm sinyal kayıtlarını siler — temiz başlangıç için admin aracı.
    Gerçek sinyaller geldikçe yeniden dolar.
    """
    result = await db.execute(select(func.count()).select_from(SignalLog))
    count_before = result.scalar() or 0

    await db.execute(text("DELETE FROM signal_logs"))
    await db.commit()

    return {
        "deleted": count_before,
        "message": f"{count_before} sinyal kaydı silindi. Tablo temizlendi.",
    }
