from .base_agent import BaseAgent
from core.config import settings

class TechnicalAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="TechnicalAnalyst", model=settings.AI_FAST_MODEL)
        self.system_prompt = """Sen acımasız ve rasyonel bir Teknik Analistsin.
Sadece fiyat hareketlerine, momentum (RSI, MACD) ve hacim verilerine odaklanırsın.
Sana verilen verileri analiz et ve bu işlemin teknik açıdan mantıklı olup olmadığını söyle.
Sadece geçerli bir JSON objesi döndür."""

    async def analyze(self, symbol: str, side: str, indicators: dict) -> dict:
        user_prompt = f"""
Sembol: {symbol}
Yön: {side}
Göstergeler: {indicators}

Lütfen analizini şu JSON formatında yap:
{{
    "approved": true/false,
    "confidence": 0-100,
    "reason": "Teknik olarak onayın nedeni",
    "recommended_stop_loss_pct": 0.0,
    "recommended_take_profit_pct": 0.0
}}
"""
        return await self._call_llm(self.system_prompt, user_prompt)
