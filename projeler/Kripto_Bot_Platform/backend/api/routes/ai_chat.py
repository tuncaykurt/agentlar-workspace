"""
AI Chat API — Proje hakkında her şeyi bilen yapay zeka asistanı
OpenRouter ile model seçimi destekli
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import select, func, case, and_, desc
from core.database import async_session
from core.config import settings
from models.trade import Bot, Trade, TradeStatus, BotStatus, BotFilter, SignalLog
import json
import httpx

router = APIRouter(prefix="/ai-chat", tags=["ai-chat"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class ChatMessage(BaseModel):
    role: str  # user, assistant
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "deepseek/deepseek-chat"
    stream: bool = False


class ModelInfo(BaseModel):
    id: str
    name: str
    category: str


# Önceden tanımlı modeller
PRESET_MODELS = [
    {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3 (Hızlı)", "category": "fast"},
    {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1 (Reasoning)", "category": "reasoning"},
    {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "category": "deep"},
    {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "category": "deep"},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "category": "deep"},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini (Ucuz)", "category": "fast"},
    {"id": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "category": "fast"},
    {"id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "category": "deep"},
    {"id": "perplexity/sonar-pro", "name": "Perplexity Sonar Pro (Arama)", "category": "search"},
    {"id": "meta-llama/llama-4-maverick", "name": "Llama 4 Maverick", "category": "fast"},
]


@router.get("/models")
async def get_models():
    """Kullanılabilir AI modellerini listele."""
    return {"models": PRESET_MODELS}


@router.post("/chat")
async def chat(req: ChatRequest):
    """AI ile sohbet — tüm proje verileriyle zenginleştirilmiş."""
    api_key = (settings.OPENROUTER_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key tanımlı değil")

    # Proje context'ini topla
    try:
        context = await _build_project_context()
    except Exception as e:
        context = f"(Proje verileri yüklenemedi: {str(e)[:200]})"

    # System message — AI'ya tüm bilgileri ver
    system_msg = f"""Sen KriptoBot Trading Platform'un yapay zeka asistanısın.
Platform kripto futures trading botları yönetir. Aşağıda platformun güncel verileri var.
Bu verileri kullanarak kullanıcının sorularını Türkçe olarak cevapla.
Detaylı, doğru ve yapıcı yanıtlar ver. Markdown formatında yaz.

{context}

ÖNEMLİ KURALLAR:
- Her zaman Türkçe cevap ver
- Rakamları ve istatistikleri doğru kullan
- Spesifik bot/sinyal/trade verilerinden bahsederken doğru detay ver
- Kullanıcıya trading tavsiyeleri verirken risk uyarısı ekle
- Platform özelliklerini iyi bil: bot oluşturma, strateji seçimi, filtre ayarları, sinyal yönetimi
"""

    # Mesajları hazırla
    messages = [{"role": "system", "content": system_msg}]
    for msg in req.messages:
        messages.append({"role": msg.role, "content": msg.content})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://kriptobot.app",
        "X-Title": "KriptoBot Trading Platform",
        "Content-Type": "application/json",
    }

    payload = {
        "model": req.model,
        "messages": messages,
        "max_tokens": 4000,
        "temperature": 0.4,
        "stream": req.stream,
    }

    # Bazı modeller için response_format ekle
    if req.stream:
        return StreamingResponse(
            _stream_response(headers, payload),
            media_type="text/event-stream",
        )

    # Non-streaming
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            if not r.is_success:
                try:
                    err = r.json()
                    detail = err.get("error", {}).get("message", r.text[:300])
                except Exception:
                    detail = r.text[:300]
                raise HTTPException(status_code=r.status_code, detail=f"OpenRouter: {detail}")

            resp = r.json()
            content = resp["choices"][0]["message"]["content"]
            usage = resp.get("usage", {})

            return {
                "content": content,
                "model": req.model,
                "usage": {
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat hatası: {str(e)[:300]}")


async def _stream_response(headers: dict, payload: dict):
    """SSE streaming response."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"
                    elif line == "data: [DONE]":
                        yield "data: [DONE]\n\n"
                        break
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)[:200]})}\n\n"


async def _build_project_context() -> str:
    """Tüm proje verilerini topla — AI'nın bilmesi gereken her şey."""
    parts = []

    async with async_session() as session:
        # ══════ BOTLAR ══════
        bots_result = await session.execute(select(Bot).order_by(Bot.id))
        bots = bots_result.scalars().all()

        if bots:
            bot_lines = []
            for b in bots:
                params = {}
                try:
                    params = json.loads(b.params) if b.params else {}
                except Exception:
                    pass
                bot_lines.append(
                    f"  #{b.id} {b.name} | {b.symbol} | Strateji: {b.strategy} | "
                    f"Borsa: {b.exchange or 'bitget'} | Durum: {b.status.value if b.status else '?'} | "
                    f"Kaldıraç: {b.leverage}x | Risk: %{(b.risk_per_trade or 0.01)*100:.1f} | "
                    f"Paper: {'Evet' if b.paper_mode else 'CANLI'} | "
                    f"Parametreler: {json.dumps(params, ensure_ascii=False)[:200]}"
                )
            parts.append(f"═══ BOTLAR ({len(bots)} adet) ═══\n" + "\n".join(bot_lines))

        # ══════ BOT FİLTRELERİ ══════
        filters_result = await session.execute(select(BotFilter))
        filters = filters_result.scalars().all()
        if filters:
            filter_lines = []
            for f in filters:
                active = []
                if f.trend_filter_enabled: active.append("Trend")
                if f.volatility_filter_enabled: active.append("Volatilite")
                if f.news_protection_enabled: active.append("Haber")
                if f.smart_hours_enabled: active.append("Saat")
                if f.self_learning_enabled: active.append("Öz-öğrenme")
                filter_lines.append(
                    f"  Bot #{f.bot_id}: Aktif filtreler: {', '.join(active) or 'Yok'} | "
                    f"Haber blackout: {f.news_blackout_minutes}dk | Maks ATR: {f.max_volatility_atr or 'sınırsız'}"
                )
            parts.append("═══ BOT FİLTRELERİ ═══\n" + "\n".join(filter_lines))

        # ══════ TRADE İSTATİSTİKLERİ ══════
        trade_stats = await session.execute(
            select(
                func.count(Trade.id).label("total"),
                func.count(case((Trade.status == "closed", 1))).label("closed"),
                func.count(case((Trade.status == "open", 1))).label("open_count"),
                func.sum(case((Trade.status == "closed", Trade.pnl), else_=0)).label("total_pnl"),
                func.count(case((and_(Trade.status == "closed", Trade.pnl > 0), 1))).label("wins"),
                func.avg(case((Trade.status == "closed", Trade.pnl))).label("avg_pnl"),
                func.avg(case((Trade.status == "closed", Trade.duration_minutes))).label("avg_duration"),
            )
        )
        ts = trade_stats.first()
        if ts and ts.total:
            total_pnl = float(ts.total_pnl or 0)
            closed = ts.closed or 0
            wins = ts.wins or 0
            wr = round(wins / closed * 100, 1) if closed > 0 else 0
            parts.append(
                f"═══ TRADE İSTATİSTİKLERİ ═══\n"
                f"  Toplam: {ts.total} | Açık: {ts.open_count} | Kapanmış: {closed}\n"
                f"  Toplam PnL: ${total_pnl:.2f} | Ort. PnL: ${float(ts.avg_pnl or 0):.2f}\n"
                f"  Kazanan: {wins} | Kaybeden: {closed - wins} | Başarı: %{wr}\n"
                f"  Ort. İşlem Süresi: {float(ts.avg_duration or 0):.0f} dakika"
            )

        # ══════ SON İŞLEMLER ══════
        recent_trades = await session.execute(
            select(Trade).order_by(Trade.opened_at.desc()).limit(15)
        )
        trades = recent_trades.scalars().all()
        if trades:
            trade_lines = []
            for t in trades:
                pnl_str = f"${t.pnl:.2f} ({t.pnl_pct:.1f}%)" if t.pnl else "açık"
                trade_lines.append(
                    f"  {t.symbol} {t.side} | Giriş: ${t.entry_price:.2f} | "
                    f"{'Çıkış: $' + f'{t.exit_price:.2f}' if t.exit_price else 'Açık'} | "
                    f"PnL: {pnl_str} | Bot #{t.bot_id} | {t.exit_reason or 'açık'}"
                )
            parts.append(f"═══ SON 15 İŞLEM ═══\n" + "\n".join(trade_lines))

        # ══════ SİNYAL İSTATİSTİKLERİ ══════
        signal_stats = await session.execute(
            select(
                func.count(SignalLog.id).label("total"),
                SignalLog.action,
            ).group_by(SignalLog.action)
        )
        sig_rows = signal_stats.all()
        if sig_rows:
            sig_lines = [f"  {r.action}: {r.total}" for r in sig_rows]
            total_sigs = sum(r.total for r in sig_rows)
            parts.append(f"═══ SİNYAL İSTATİSTİKLERİ (Toplam: {total_sigs}) ═══\n" + "\n".join(sig_lines))

        # ══════ SON SİNYALLER + ANALİZLER ══════
        recent_signals = await session.execute(
            select(SignalLog).order_by(SignalLog.created_at.desc()).limit(10)
        )
        sigs = recent_signals.scalars().all()
        if sigs:
            sig_detail_lines = []
            for s in sigs:
                outcome_str = f"Sonuç: {s.outcome}" if hasattr(s, 'outcome') and s.outcome else ""
                tp_str = f"TP: ${s.tp_price:.2f}" if hasattr(s, 'tp_price') and s.tp_price else ""
                sl_str = f"SL: ${s.sl_price:.2f}" if hasattr(s, 'sl_price') and s.sl_price else ""
                price_str = f"${s.price:.2f}" if s.price else "$0.00"
                sig_detail_lines.append(
                    f"  {s.symbol} {s.signal_type} @ {price_str} | "
                    f"Durum: {s.action} | {tp_str} {sl_str} {outcome_str} | "
                    f"Kaynak: {s.source or '?'}"
                )
            parts.append(f"═══ SON 10 SİNYAL ═══\n" + "\n".join(sig_detail_lines))

        # ══════ SİNYAL ANALİZ DETAYLARI ══════
        analyzed_signals = await session.execute(
            select(SignalLog)
            .where(SignalLog.action == "analyzed")
            .order_by(SignalLog.created_at.desc())
            .limit(5)
        )
        analyzed = analyzed_signals.scalars().all()
        if analyzed:
            analysis_lines = []
            for s in analyzed:
                reason_short = (s.reason or "")[:300]
                analysis_lines.append(
                    f"  {s.symbol} {s.signal_type}: {reason_short}"
                )
            parts.append(f"═══ SON 5 SİNYAL ANALİZİ ═══\n" + "\n".join(analysis_lines))

    # ══════ PLATFORM BİLGİLERİ ══════
    parts.append("""═══ PLATFORM BİLGİLERİ ═══
  Desteklenen Borsalar: Bitget, MEXC, Bybit
  Bot Stratejileri: EMA Cross, RSI, MACD, Bollinger, UT Bot, Supertrend, BB-EMA Cross, TradingView Webhook, Hedge Bot, Freqtrade
  AI Modelleri: DeepSeek (hızlı filtre), Claude Sonnet (derin analiz), Perplexity (arama)
  Filtreler: Trend (EMA200), Volatilite (ATR), Haber Koruması, Akıllı Saat, Öz-öğrenme
  Veri Kaynakları: TradingView webhooks, CCXT (borsa API), CryptoPanic (haberler), CoinGlass (likidasyonlar), Finnhub (ekonomik takvim)
  Bot Modları: Paper Trading (simülasyon) ve Canlı Trading
  TP/SL Yöntemleri: Yüzde bazlı, ATR bazlı, Fibonacci, Yapı bazlı, Dinamik
  Backtest: 7+ dahili strateji, çoklu zaman dilimi, komisyon ve kaldıraç simülasyonu""")

    return "\n\n".join(parts)
