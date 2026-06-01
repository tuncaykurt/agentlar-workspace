import asyncio
import json
from ai.agents.technical_agent import TechnicalAgent
from ai.agents.risk_agent import RiskAgent
from ai.agents.sentiment_agent import SentimentAgent
from ai.agents.meta_agent import MetaAgent
from core.redis_client import get_redis
import ccxt.async_support as ccxt
from ai.indicators import calculate_all
from ai.market_context import collect_full_context

tech_agent = TechnicalAgent()
risk_agent = RiskAgent()
sent_agent = SentimentAgent()
meta_agent = MetaAgent()

async def process_webhook_with_ai(payload: dict, token: str, profile: dict):
    """
    TradingView'den gelen sinyali AI ajanları ile doğrular.
    Eğer onaylanırsa (APPROVE), redis custom_signal olarak yazar ve botun almasını sağlar.
    REJECT edilirse, sadece loglar.
    """
    symbol_ccxt = payload.get("symbol")
    if not symbol_ccxt:
        return

    sig_type = payload.get("type", "unknown").upper()
    price = payload.get("price", 0)

    # 1. Veri Toplama
    exchange = ccxt.mexc({"options": {"defaultType": "swap"}})
    try:
        ohlcv = await asyncio.wait_for(exchange.fetch_ohlcv(symbol_ccxt, "15m", limit=100), timeout=15)
        ind = calculate_all(ohlcv) if len(ohlcv) > 50 else {}
        
        # Risk context — MEXC client ile topla
        full_ctx = {}
        try:
            from exchange.exchange_factory import get_public_client
            class _Wrap:
                def __init__(self, ex):
                    self.exchange = ex
                async def get_ohlcv(self, sym, tf, limit=200):
                    return await self.exchange.fetch_ohlcv(sym, tf, limit=limit)
                async def get_funding_rate(self, sym):
                    try:
                        t = await self.exchange.fetch_ticker(sym)
                        return float(t.get("info", {}).get("fundingRate", 0))
                    except Exception:
                        return 0
            full_ctx = await collect_full_context(_Wrap(get_public_client("mexc")), symbol_ccxt)
        except Exception:
            pass
        
        funding_rate = 0.0
        try:
            funding_rate = await exchange.fetch_funding_rate(symbol_ccxt)
            funding_rate = funding_rate.get("fundingRate", 0.0) * 100
        except Exception:
            pass

        # Likidasyon verisi — risk analizi için kritik
        liq_data = {}
        try:
            from services.liquidation_collector import get_liquidation_stats
            liq_data = await get_liquidation_stats(symbol_ccxt.replace("/USDT:USDT", "").replace("/", ""))
        except Exception:
            pass

        risk_context = {
            "price": price,
            "volatility": ind.get("atr", 0),
            "order_book": full_ctx.get("order_book", {}),
            "liquidations_24h": liq_data,
        }

        fg_index = full_ctx.get("fear_greed", {}).get("value", 50)
        news_data = [] # TODO: Haber servisi eklenebilir

        # 2. Ajanları Paralel Çalıştır
        tech_task = tech_agent.analyze(symbol=symbol_ccxt, side=sig_type, indicators=ind)
        risk_task = risk_agent.analyze(symbol=symbol_ccxt, side=sig_type, funding_rate=funding_rate, context=risk_context)
        sent_task = sent_agent.analyze(symbol=symbol_ccxt, fear_and_greed=fg_index, news_data=news_data)

        tech_res, risk_res, sent_res = await asyncio.gather(tech_task, risk_task, sent_task)

        # 3. Meta Agent Kararı
        final_decision = await meta_agent.make_decision(
            symbol=symbol_ccxt,
            side=sig_type,
            tech_report=tech_res,
            risk_report=risk_res,
            sentiment_report=sent_res
        )

        decision = final_decision.get("final_decision", "REJECT")
        mod = final_decision.get("position_size_modifier", 1.0)
        explanation = final_decision.get("explanation", "")

        # AI risk seviyesine göre tolerans
        ai_risk_level = profile.get("ai_risk_level", "medium")
        if ai_risk_level == "low" and mod < 0.8:
            decision = "REJECT"
            explanation += " (Düşük Risk Modu: Yetersiz piyasa koşulları)"
        elif ai_risk_level == "high" and mod >= 0.3:
            if decision == "REJECT":
                decision = "APPROVE"
                explanation += " (Yüksek Risk Modu: Esnek tolerans ile onaylandı)"

        payload["ai_analysis"] = final_decision
        
        # AI karar yetkisine (ai_mode) göre kaldıraç ve miktar ayarı
        ai_mode = profile.get("ai_mode", "filter")
        new_leverage = profile.get("leverage", 20)
        
        if ai_mode in ["leverage_size", "autonomous"]:
            base_leverage = profile.get("leverage", 20)
            new_leverage = max(1, int(base_leverage * mod))
            payload["leverage"] = new_leverage
            payload["ai_modifier"] = mod
            
            # Eğer miktar (amount / entry_size) gönderiliyorsa onu da güncelle
            if "entry_size" in payload and isinstance(payload["entry_size"], (int, float)):
                payload["entry_size"] = float(payload["entry_size"]) * mod
            elif "amount" in payload and isinstance(payload["amount"], (int, float)):
                payload["amount"] = float(payload["amount"]) * mod
                
            explanation += f" | AI Kaldıraç & Miktar ayarlandı (Çarpan: {mod:.2f})"

        payload["reason"] = f"{payload.get('reason', '')} | AI: {decision} ({explanation})"

        if decision == "APPROVE" or decision == "HEDGE_ONLY":
            # Onaylandıysa custom_signal olarak Redis'e yaz
            redis = get_redis()
            sym_key = f"custom_signal:{symbol_ccxt.replace('/', '_').replace(':', '_')}"
            await redis.set(sym_key, json.dumps(payload), ex=600)

            hist_key = f"custom_signal_history:{symbol_ccxt.replace('/', '_').replace(':', '_')}"
            await redis.lpush(hist_key, json.dumps(payload))
            await redis.ltrim(hist_key, 0, 99)
            print(f"[AI Validator] {symbol_ccxt} {sig_type} ONAYLANDI. Yeni Kaldıraç: {new_leverage}x")
        else:
            print(f"[AI Validator] {symbol_ccxt} {sig_type} REDDEDİLDİ. Neden: {explanation}")
            
    except Exception as e:
        print(f"[AI Validator] Hata oluştu: {e}")
        # Hata durumunda güvenlik amaçlı sinyali iptal ediyoruz
    finally:
        await exchange.close()
