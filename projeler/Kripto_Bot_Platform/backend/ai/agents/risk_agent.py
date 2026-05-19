from .base_agent import BaseAgent
from core.config import settings

class RiskAgent(BaseAgent):
    def __init__(self):
        # Risk analizi detaylı bir düşünce gerektirir, o yüzden daha güçlü bir model atanabilir.
        super().__init__(name="RiskManager", model=settings.AI_DEEP_MODEL)
        self.system_prompt = """Sen şirketin baş risk yöneticisisin. En kötü senaryoları düşünmek zorundasın.
Sermayeyi korumak senin tek görevin. Fonlama oranları (funding rate), likidasyon ısı haritaları ve pozisyon büyüklüklerine odaklanırsın.
Risk yüksekse işlemi kesinlikle reddet. Sadece geçerli bir JSON döndür."""

    async def analyze(self, symbol: str, side: str, funding_rate: float, context: dict = None) -> dict:
        # İleride Coinglass API verileri buradaki 'context' içine eklenecek.
        context = context or {}
        user_prompt = f"""
Sembol: {symbol}
Yön: {side}
Fonlama Oranı: {funding_rate}%
Ek Risk Verileri (Likidasyon, Orderbook vb.): {context}

Lütfen analizini şu JSON formatında yap:
{{
    "approved": true/false,
    "confidence": 0-100,
    "risk_level": "LOW/MEDIUM/HIGH/EXTREME",
    "reason": "Neden bu risk seviyesini seçtin?",
    "max_leverage_recommended": 1
}}
"""
        return await self._call_llm(self.system_prompt, user_prompt)
