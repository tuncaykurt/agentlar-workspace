"""
Funding Rate Arbitraj Stratejisi (En Güvenli)
- Negatif funding rate → piyasa short ağırlıklı → long aç
- Pozitif funding rate (çok yüksek) → piyasa long ağırlıklı → short aç
- Market-neutral: fiyat yönünden bağımsız gelir
"""


class FundingRateStrategy:
    def __init__(
        self,
        long_threshold: float = -0.0005,   # -0.05% altında long sinyali
        short_threshold: float = 0.001,    # +0.1% üstünde short sinyali
        min_open_interest: float = 1_000_000,
    ):
        self.long_threshold = long_threshold
        self.short_threshold = short_threshold
        self.min_open_interest = min_open_interest

    def calculate(self, funding_rate: float, open_interest: float = 0) -> dict:
        """
        funding_rate: Anlık funding rate (örn: -0.0003)
        open_interest: Açık pozisyon büyüklüğü (USDT)
        """
        oi_ok = open_interest >= self.min_open_interest or open_interest == 0

        signal = None
        if funding_rate <= self.long_threshold and oi_ok:
            signal = "buy"
        elif funding_rate >= self.short_threshold and oi_ok:
            signal = "sell"

        return {
            "signal": signal,
            "funding_rate": funding_rate,
            "funding_rate_pct": round(funding_rate * 100, 4),
            "open_interest": open_interest,
            "oi_ok": oi_ok,
        }
