"""
Risk Yönetimi Katmanı
- Position sizing (Kelly / sabit risk)
- Günlük kayıp limiti
- Kill switch
"""


class RiskManager:
    def __init__(
        self,
        balance: float,
        risk_per_trade: float = 0.01,   # %1
        max_daily_loss: float = 0.05,   # %5
        leverage: int = 3,
    ):
        self.initial_balance = balance
        self.current_balance = balance
        self.risk_per_trade = risk_per_trade
        self.max_daily_loss = max_daily_loss
        self.leverage = leverage
        self.daily_pnl = 0.0
        self.killed = False

    @property
    def balance(self) -> float:
        return self.current_balance

    @property
    def daily_pnl_pct(self) -> float:
        if self.initial_balance == 0:
            return 0.0
        return (self.daily_pnl / self.initial_balance) * 100

    def position_size(self, entry_price: float, stop_loss_price: float) -> float:
        """
        Risk bazlı pozisyon büyüklüğü hesapla (kaldıraç dahil).
        Risk tutarı  = bakiye * risk_per_trade  (teminat/margin)
        Notional     = margin * leverage
        Quantity     = notional / entry_price
        Stop mesafesi: |entry - stop| / entry
        """
        if self.killed:
            return 0.0

        if entry_price <= 0:
            return 0.0

        if self.risk_per_trade > 1.0:
            risk_amount = float(self.risk_per_trade)
        else:
            risk_amount = float(self.current_balance) * float(self.risk_per_trade)

        stop_distance_pct = abs(entry_price - stop_loss_price) / entry_price

        if stop_distance_pct == 0:
            return 0.0

        # Kaldıraç faktörü: margin * leverage = notional
        leverage = max(1, int(self.leverage))
        position_value = (risk_amount / stop_distance_pct) * leverage
        quantity = position_value / entry_price
        return round(quantity, 8)  # 8 basamak hassasiyet

    def check_kill_switch(self) -> bool:
        """Günlük kayıp limitini kontrol et."""
        daily_loss_pct = self.daily_pnl / self.initial_balance
        if daily_loss_pct <= -self.max_daily_loss:
            self.killed = True
        return self.killed

    def update_pnl(self, pnl: float):
        self.daily_pnl += pnl
        self.current_balance += pnl
        self.check_kill_switch()

    def reset_daily(self):
        """Her gece gece yarısı çağrılır."""
        self.daily_pnl = 0.0
        self.killed = False

    def atr_stop_loss(self, entry: float, atr: float, side: str, multiplier: float = 1.5) -> float:
        """ATR bazlı stop loss hesapla."""
        if side == "buy":
            return entry - (atr * multiplier)
        return entry + (atr * multiplier)

    def status(self) -> dict:
        return {
            "balance": self.current_balance,
            "daily_pnl": self.daily_pnl,
            "daily_pnl_pct": self.daily_pnl_pct,
            "killed": self.killed,
            "leverage": self.leverage,
        }
