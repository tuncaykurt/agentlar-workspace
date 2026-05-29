"""
Bot İşlem Kayıtları API — Her botun trade geçmişi
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import select, delete, func, case, and_
from core.database import async_session
from models.trade import Trade, TradeStatus, Bot
import json
from api.routes.auth import get_current_user

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("")
async def list_trades(
    bot_id: int = Query(None, description="Bot ID filtresi"),
    status: str = Query(None, description="open, closed, cancelled"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    user_id: int = Depends(get_current_user),
):
    """Tüm işlemleri listele — bot_id ile filtrelenebilir."""
    async with async_session() as session:
        q = select(Trade).where(Trade.user_id == user_id).order_by(Trade.opened_at.desc())
        if bot_id is not None:
            q = q.where(Trade.bot_id == bot_id)
        if status:
            q = q.where(Trade.status == status)
        q = q.limit(limit).offset(offset)
        result = await session.execute(q)
        trades = result.scalars().all()

        # Count
        cq = select(func.count(Trade.id)).where(Trade.user_id == user_id)
        if bot_id is not None:
            cq = cq.where(Trade.bot_id == bot_id)
        if status:
            cq = cq.where(Trade.status == status)
        count_result = await session.execute(cq)
        total = count_result.scalar() or 0

        return {
            "trades": [_trade_to_dict(t) for t in trades],
            "total": total,
        }


@router.get("/bots-summary")
async def bots_trade_summary(user_id: int = Depends(get_current_user)):
    """Her bot için trade özeti — kart görünümü için."""
    async with async_session() as session:
        # Tüm botlar
        bots_result = await session.execute(select(Bot).where(Bot.user_id == user_id).order_by(Bot.id))
        bots = bots_result.scalars().all()

        summaries = []
        for bot in bots:
            # Trade stats
            stats_q = select(
                func.count(Trade.id).label("total"),
                func.count(case((Trade.status == "closed", 1))).label("closed"),
                func.count(case((Trade.status == "open", 1))).label("open_count"),
                func.sum(case((Trade.status == "closed", Trade.pnl), else_=0)).label("total_pnl"),
                func.count(case((and_(Trade.status == "closed", Trade.pnl > 0), 1))).label("wins"),
            ).where(Trade.bot_id == bot.id)
            stats_result = await session.execute(stats_q)
            row = stats_result.first()

            total = row.total or 0
            closed = row.closed or 0
            wins = row.wins or 0
            total_pnl = float(row.total_pnl or 0)
            win_rate = round(wins / closed * 100, 1) if closed > 0 else 0

            params = {}
            try:
                params = json.loads(bot.params) if bot.params else {}
            except Exception:
                pass

            summaries.append({
                "bot_id": bot.id,
                "bot_name": bot.name,
                "symbol": bot.symbol,
                "strategy": bot.strategy,
                "exchange": bot.exchange or "bitget",
                "status": bot.status.value if bot.status else "stopped",
                "trade_count": total,
                "closed_count": closed,
                "open_count": row.open_count or 0,
                "total_pnl": round(total_pnl, 2),
                "win_rate": win_rate,
                "wins": wins,
                "losses": closed - wins,
                "params": params,
            })

        return {"bots": summaries}


@router.get("/bot/{bot_id}")
async def get_bot_trades(
    bot_id: int,
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    user_id: int = Depends(get_current_user),
):
    """Belirli bir botun tüm işlemlerini getir."""
    async with async_session() as session:
        q = (
            select(Trade)
            .where(Trade.bot_id == bot_id, Trade.user_id == user_id)
            .order_by(Trade.opened_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(q)
        trades = result.scalars().all()

        cq = select(func.count(Trade.id)).where(Trade.bot_id == bot_id, Trade.user_id == user_id)
        count_result = await session.execute(cq)
        total = count_result.scalar() or 0

        return {
            "trades": [_trade_to_dict(t) for t in trades],
            "total": total,
            "bot_id": bot_id,
        }


@router.delete("/bot/{bot_id}")
async def delete_bot_trades(bot_id: int, user_id: int = Depends(get_current_user)):
    """Belirli bir bota ait tüm işlem kayıtlarını sil."""
    async with async_session() as session:
        count_q = select(func.count(Trade.id)).where(Trade.bot_id == bot_id, Trade.user_id == user_id)
        count_result = await session.execute(count_q)
        total = count_result.scalar() or 0

        if total == 0:
            return {"deleted": 0, "message": "Bu bota ait kayıt bulunamadı."}

        await session.execute(delete(Trade).where(Trade.bot_id == bot_id, Trade.user_id == user_id))
        await session.commit()
        return {"deleted": total, "message": f"{total} işlem kaydı silindi."}


@router.get("/bot/{bot_id}/ai-analysis")
async def ai_analyze_bot_trades(bot_id: int, user_id: int = Depends(get_current_user)):
    """Bir botun trade geçmişini AI ile analiz et."""
    from ai.openrouter import _call
    from core.config import settings

    async with async_session() as session:
        # Bot bilgisi
        bot_result = await session.execute(select(Bot).where(Bot.id == bot_id, Bot.user_id == user_id))
        bot = bot_result.scalar_one_or_none()
        if not bot:
            raise HTTPException(status_code=404, detail="Bot bulunamadı")

        # Son 50 kapanmış trade
        q = (
            select(Trade)
            .where(Trade.bot_id == bot_id, Trade.user_id == user_id, Trade.status == "closed")
            .order_by(Trade.closed_at.desc())
            .limit(50)
        )
        result = await session.execute(q)
        trades = result.scalars().all()

        if len(trades) < 2:
            return {"analysis": "Analiz için yeterli kapanmış işlem yok (en az 2 gerekli)."}

        # Trade özeti oluştur
        wins = [t for t in trades if (t.pnl or 0) > 0]
        losses = [t for t in trades if (t.pnl or 0) <= 0]
        total_pnl = sum(t.pnl or 0 for t in trades)
        avg_win = sum(t.pnl or 0 for t in wins) / len(wins) if wins else 0
        avg_loss = sum(t.pnl or 0 for t in losses) / len(losses) if losses else 0
        avg_duration = sum(t.duration_minutes or 0 for t in trades) / len(trades)

        exit_reasons = {}
        for t in trades:
            r = t.exit_reason or "unknown"
            exit_reasons[r] = exit_reasons.get(r, 0) + 1

        params = {}
        try:
            params = json.loads(bot.params) if bot.params else {}
        except Exception:
            pass

        trade_details = "\n".join([
            f"  {i+1}. {t.symbol} {t.side} | Giriş: ${t.entry_price:.2f} → Çıkış: ${t.exit_price:.2f} | "
            f"PnL: ${t.pnl:.2f} ({t.pnl_pct:.1f}%) | Sebep: {t.exit_reason or '?'} | "
            f"Süre: {t.duration_minutes or '?'}dk | Kaldıraç: {t.leverage_used or '?'}x"
            for i, t in enumerate(trades[:20]) if t.exit_price
        ])

        prompt = f"""
Sen uzman bir kripto trading analisti ve portföy yöneticisisin.
Aşağıdaki bot trade verilerini analiz et ve detaylı rapor ver.

═══ BOT BİLGİSİ ═══
İsim: {bot.name} | Sembol: {bot.symbol} | Strateji: {bot.strategy}
Borsa: {bot.exchange} | Kaldıraç: {bot.leverage}x | Risk/Trade: %{(bot.risk_per_trade or 0.01)*100:.1f}
Parametreler: {json.dumps(params, ensure_ascii=False)[:500]}

═══ PERFORMANS ÖZETİ ({len(trades)} işlem) ═══
Toplam PnL: ${total_pnl:.2f}
Kazanan: {len(wins)} | Kaybeden: {len(losses)} | Başarı: %{len(wins)/len(trades)*100:.1f}
Ort. Kazanç: ${avg_win:.2f} | Ort. Kayıp: ${avg_loss:.2f}
Ort. İşlem Süresi: {avg_duration:.0f} dakika
Çıkış Sebepleri: {json.dumps(exit_reasons, ensure_ascii=False)}

═══ SON İŞLEMLER ═══
{trade_details}

═══ ANALİZ GÖREVİ ═══
Türkçe olarak analiz yap:
1. Genel performans değerlendirmesi
2. Güçlü ve zayıf yönler
3. Risk yönetimi analizi (kaldıraç, pozisyon boyutu)
4. Strateji etkinliği ve öneriler
5. İyileştirme tavsiyeleri (TP/SL seviyeleri, parametreler)
6. Psikolojik analiz (ardışık kayıp/kazanç pattern'leri)

Detaylı, yapıcı ve aksiyon alınabilir tavsiyeler ver. Markdown formatında yaz.
"""
        try:
            model = settings.AI_DEEP_MODEL
            api_key = (settings.OPENROUTER_API_KEY or "").strip()
            if not api_key:
                return {"analysis": "OpenRouter API key tanımlı değil. Ayarlardan ekleyin."}

            import httpx
            headers = {
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://kriptobot.app",
                "X-Title": "KriptoBot Trading Platform",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "Sen uzman bir kripto trading analisti ve portföy yöneticisisin. Türkçe analiz yap."},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 2000,
                "temperature": 0.3,
            }
            async with httpx.AsyncClient(timeout=90) as client:
                r = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
                if not r.is_success:
                    return {"analysis": f"AI hatası: HTTP {r.status_code}"}
                resp = r.json()
                content = resp["choices"][0]["message"]["content"]
                return {"analysis": content, "model": model, "trade_count": len(trades)}
        except Exception as e:
            return {"analysis": f"Analiz hatası: {str(e)[:300]}"}


def _trade_to_dict(t: Trade) -> dict:
    return {
        "id": t.id,
        "bot_id": t.bot_id,
        "symbol": t.symbol,
        "side": t.side,
        "entry_price": t.entry_price,
        "exit_price": t.exit_price,
        "quantity": t.quantity,
        "pnl": t.pnl,
        "pnl_pct": t.pnl_pct,
        "status": t.status.value if t.status else "open",
        "paper": t.paper,
        "exchange": t.exchange,
        "exchange_order_id": t.exchange_order_id,
        "exit_reason": t.exit_reason,
        "session_type": t.session_type,
        "volatility_1h": t.volatility_1h,
        "volume_ratio": t.volume_ratio,
        "funding_rate": t.funding_rate,
        "rsi_at_entry": t.rsi_at_entry,
        "ema200_trend": t.ema200_trend,
        "leverage_used": t.leverage_used,
        "duration_minutes": t.duration_minutes,
        "opened_at": t.opened_at.isoformat() if t.opened_at else None,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
    }
