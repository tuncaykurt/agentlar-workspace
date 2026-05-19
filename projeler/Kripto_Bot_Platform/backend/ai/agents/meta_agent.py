from .base_agent import BaseAgent
from core.config import settings

class MetaAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="MetaAgent_Boss", model=settings.AI_DEEP_MODEL)
        self.system_prompt = """Sen baş fon yöneticisisin. 3 farklı ajanından (Teknik, Risk, Sentiment) rapor alacaksın.
Senin görevin bu 3 raporu harmanlayıp nihai işlemi onaylamak veya reddetmektir.
Çelişkili durumlarda her zaman 'Risk Yöneticisinin' uyarılarını dikkate al. İşlem güvenliği 1 numaralı önceliğindir.
Sadece geçerli bir JSON döndür."""

    async def make_decision(self, symbol: str, side: str, tech_report: dict, risk_report: dict, sentiment_report: dict) -> dict:
        user_prompt = f"""
Sembol: {symbol}
Planlanan Yön: {side}

Teknik Ajan Raporu: {tech_report}
Risk Ajanı Raporu: {risk_report}
Duygu Ajanı Raporu: {sentiment_report}

Tüm bu raporları değerlendir. Kararını şu JSON formatında ver:
{{
    "final_decision": "APPROVE/REJECT/HEDGE_ONLY",
    "confidence": 0-100,
    "position_size_modifier": 0.0-1.0,
    "explanation": "Neden bu kararı aldın? Detaylı açıkla."
}}
(Not: position_size_modifier tam onaysa 1.0, riskliyse örn 0.5 ver, kesin ret ise 0.0 ver.)
"""
        return await self._call_llm(self.system_prompt, user_prompt)
