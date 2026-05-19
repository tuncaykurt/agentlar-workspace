"""
Funding Rate Arbitraj Stratejisi (Delta-Neutral) ve AI Karar Motoru Entegrasyonu
- 3 farklı borsa (MEXC, Bybit, Bitget vb.) arasındaki fonlama oranlarını kıyaslar.
- Makas (spread) uygunsa, işlemi hemen açmaz. Önce 3 ayrı AI Ajanını (Teknik, Risk, Sentiment) paralel çalıştırır.
- Meta Agent (Patron) tüm raporları inceler ve nihai onayı verirse işlem açılır.
"""
import asyncio
from ai.agents.technical_agent import TechnicalAgent
from ai.agents.risk_agent import RiskAgent
from ai.agents.sentiment_agent import SentimentAgent
from ai.agents.meta_agent import MetaAgent

class ArbitrageHedgeStrategy:
    def __init__(
        self, 
        min_spread: float = 0.001,  # İşleme girmek için aranan minimum fark (örn: 0.1%)
        convergence_threshold: float = 0.0002,  # İşlemi kapatmak için beklenilen yakınsama seviyesi (örn: 0.02%)
    ):
        self.min_spread = min_spread
        self.convergence_threshold = convergence_threshold
        # AI Ajanlarını Başlat
        self.tech_agent = TechnicalAgent()
        self.risk_agent = RiskAgent()
        self.sent_agent = SentimentAgent()
        self.meta_agent = MetaAgent()

    def calculate_spreads(self, exchange_rates: dict) -> dict:
        """
        exchange_rates: Örn: {"mexc": 0.0005, "bybit": -0.0008, "bitget": 0.0001}
        Sadece matematiksel olarak fırsat var mı diye bakar. (AI'dan önceki adım)
        """
        if not exchange_rates or len(exchange_rates) < 2:
            return {"signal": None, "reason": "Yeterli borsa verisi yok"}

        highest_exchange = max(exchange_rates, key=exchange_rates.get)
        lowest_exchange = min(exchange_rates, key=exchange_rates.get)

        highest_rate = exchange_rates[highest_exchange]
        lowest_rate = exchange_rates[lowest_exchange]

        spread = highest_rate - lowest_rate

        signal = None
        action = None
        
        if spread >= self.min_spread:
            # İşlemi anında açmıyoruz, sadece potansiyel sinyal üretiyoruz.
            signal = "potential_arbitrage"
            action = {
                "short_exchange": highest_exchange,
                "short_rate": highest_rate,
                "long_exchange": lowest_exchange,
                "long_rate": lowest_rate,
                "spread": spread
            }
        elif spread <= self.convergence_threshold:
            signal = "close_arbitrage"
            action = {
                "reason": "convergence",
                "spread": spread
            }

        return {
            "signal": signal,
            "action": action,
            "spread": spread,
            "rates": exchange_rates
        }

    async def get_ai_approval(
        self, 
        symbol: str, 
        spread: float, 
        tech_data: dict, 
        risk_context: dict, 
        news_data: list, 
        fg_index: int
    ) -> dict:
        """
        Eğer matematiksel olarak 'potential_arbitrage' (potansiyel fırsat) bulunursa çalışır.
        3 Ajan PARALEL analiz yapar ve sonuç Meta Agent'a sunulur.
        """
        try:
            # 1. Aşama: 3 Ajanı aynı anda çalıştır (Ciddi zaman tasarrufu sağlar)
            tech_task = self.tech_agent.analyze(symbol=symbol, side="HEDGE_ARBITRAGE", indicators=tech_data)
            risk_task = self.risk_agent.analyze(symbol=symbol, side="HEDGE_ARBITRAGE", funding_rate=spread*100, context=risk_context)
            sent_task = self.sent_agent.analyze(symbol=symbol, fear_and_greed=fg_index, news_data=news_data)

            tech_res, risk_res, sent_res = await asyncio.gather(tech_task, risk_task, sent_task)

            # 2. Aşama: 3 raporu Meta Agent'a (Patron'a) sun ve nihai kararı al
            final_decision = await self.meta_agent.make_decision(
                symbol=symbol,
                side="HEDGE_ARBITRAGE",
                tech_report=tech_res,
                risk_report=risk_res,
                sentiment_report=sent_res
            )
            return final_decision

        except Exception as e:
            # En ufak bir API hatasında parayı korumak için işlemi reddet
            return {
                "final_decision": "REJECT",
                "confidence": 0,
                "position_size_modifier": 0.0,
                "explanation": f"Yapay zeka analizinde hata oluştu: {str(e)} - Sermayeyi korumak için işlem reddedildi."
            }

    def check_updates(self, active_arbitrage: dict, exchange_rates: dict) -> list:
        """
        Mevcut açık arbitraj işleminin durumunu kontrol eder.
        Eğer makas (spread) convergence_threshold'un altına düşerse kapatma sinyali üretir.
        """
        if not active_arbitrage or not exchange_rates:
            return []

        highest_exchange = active_arbitrage.get("short_exchange")
        lowest_exchange = active_arbitrage.get("long_exchange")
        
        if highest_exchange in exchange_rates and lowest_exchange in exchange_rates:
            current_spread = exchange_rates[highest_exchange] - exchange_rates[lowest_exchange]
            if current_spread <= self.convergence_threshold:
                return [{"action": "close_arbitrage", "reason": "spread_converged", "spread": current_spread}]
        
        return []
