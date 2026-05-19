from .base_agent import BaseAgent
from core.config import settings

class SentimentAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="SentimentAnalyst", model=settings.AI_DEEP_MODEL)
        self.system_prompt = """Sen usta bir duygu (sentiment) analistisin. Haber okuma, tweet analiz etme ve makro ekonomiyi anlama konusunda uzmansın.
İleride CryptoPanic vb. haber servislerinden gelecek verileri yorumlayacaksın. Piyasa duygusu panik veya aşırı coşku ise bunu belirleyeceksin.
Sadece geçerli JSON döndür."""

    async def analyze(self, symbol: str, fear_and_greed: int, news_data: list = None) -> dict:
        # İleride CryptoPanic API'den gelen ham haberler news_data listesinde olacak.
        news_data = news_data or []
        user_prompt = f"""
Sembol: {symbol}
Fear & Greed Index: {fear_and_greed}
Haberler (Özet): {news_data}

Lütfen analizini şu JSON formatında yap:
{{
    "sentiment_score": 0-100 (0: Aşırı Ayı, 100: Aşırı Boğa),
    "market_state": "BEARISH/NEUTRAL/BULLISH",
    "reason": "Sebebi nedir?",
    "news_impact_warning": true/false
}}
"""
        return await self._call_llm(self.system_prompt, user_prompt)
