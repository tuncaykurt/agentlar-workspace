"""
Grid Bot Stratejisi
-------------------
Fiyat aralığını N grid seviyesine böler.
Her düşüşte alır, her yükselişte satar.
Yatay piyasalarda etkilidir.
"""


class GridStrategy:
    def __init__(self, params: dict):
        self.upper_pct       = float(params.get("upper_pct", 5)) / 100
        self.lower_pct       = float(params.get("lower_pct", 5)) / 100
        self.upper_price     = float(params.get("upper_price", 0))   # 0 = yüzde modunu kullan
        self.lower_price     = float(params.get("lower_price", 0))
        self.grid_count      = max(2, int(params.get("grid_count", 20)))
        self.grid_type       = params.get("grid_type", "arithmetic")
        self.per_grid_usdt   = float(params.get("per_grid_usdt", 10))
        self.maker_fee_pct = 0.0  # MEXC Maker Limit Emir (0%)
        self.taker_fee_pct = float(params.get("trading_fee_pct", 0.01)) / 100  # MEXC Taker Market Emir (0.01%)
        self.price_range_mode = params.get("price_range_mode", "pct")

        # Stop Loss — fiyat önceliği, yoksa yüzde
        self.stop_loss_price = float(params.get("stop_loss_price", 0))
        self.stop_loss_pct   = float(params.get("stop_loss_pct", 8)) / 100

        # Take Profit — toplam kâr hedefi
        self.take_profit_price = float(params.get("take_profit_price", 0))
        self.take_profit_pct   = float(params.get("take_profit_pct", 0)) / 100

        self.levels: list[float] = []
        self.bought: set[int] = set()
        self.entry_price: float = 0.0
        self.realized_pnl: float = 0.0
        self.initialized = False

    # ─── Başlatma ─────────────────────────────────────────────────────────────

    def initialize(self, current_price: float):
        # Fiyat aralığını belirle
        if self.price_range_mode == "absolute" and self.upper_price > 0 and self.lower_price > 0:
            upper = self.upper_price
            lower = self.lower_price
        else:
            upper = current_price * (1 + self.upper_pct)
            lower = current_price * (1 - self.lower_pct)

        self.entry_price = current_price

        if self.grid_type == "geometric":
            ratio = (upper / lower) ** (1 / (self.grid_count - 1))
            self.levels = [lower * (ratio ** i) for i in range(self.grid_count)]
        else:  # arithmetic
            step = (upper - lower) / (self.grid_count - 1)
            self.levels = [lower + i * step for i in range(self.grid_count)]

        self.initialized = True
        step_pct = (self.levels[1] - self.levels[0]) / self.levels[0] * 100 if len(self.levels) > 1 else 0
        net_per_grid = self.per_grid_usdt * step_pct / 100 - self.per_grid_usdt * (self.maker_fee_pct + self.taker_fee_pct)
        print(
            f"[Grid] Başlatıldı: {self.grid_count} seviye, "
            f"${lower:.2f} — ${upper:.2f}, "
            f"adım ≈ {step_pct:.2f}%, net/grid ≈ ${net_per_grid:.3f}"
        )

    # ─── Sinyal üret ──────────────────────────────────────────────────────────

    def generate_signal(self, current_price: float) -> str | None:
        if not self.initialized:
            return None

        # Stop Loss
        if self.stop_loss_price > 0 and current_price <= self.stop_loss_price:
            print(f"[Grid] STOP LOSS (fiyat) tetiklendi @ ${current_price:.2f}")
            self.bought.clear()
            return "stop_loss"
        if self.stop_loss_pct > 0 and len(self.levels) > 0:
            hard_stop = self.levels[0] * (1 - self.stop_loss_pct)
            if current_price <= hard_stop:
                print(f"[Grid] STOP LOSS (%) tetiklendi @ ${current_price:.2f}")
                self.bought.clear()
                return "stop_loss"

        # Take Profit
        if self.take_profit_price > 0 and current_price >= self.take_profit_price:
            print(f"[Grid] TAKE PROFIT (fiyat) tetiklendi @ ${current_price:.2f}")
            self.bought.clear()
            return "take_profit"
        if self.take_profit_pct > 0:
            total_inv = len(self.bought) * self.per_grid_usdt
            if total_inv > 0 and self.realized_pnl / total_inv >= self.take_profit_pct:
                print(f"[Grid] TAKE PROFIT (%) tetiklendi, PnL=${self.realized_pnl:.2f}")
                self.bought.clear()
                return "take_profit"

        for i in range(len(self.levels) - 1):
            buy_level  = self.levels[i]
            sell_level = self.levels[i + 1]

            if current_price <= buy_level and i not in self.bought:
                self.bought.add(i)
                print(f"[Grid] AL — seviye {i}: ${buy_level:.2f} (fiyat: ${current_price:.2f})")
                return "buy"

            elif current_price >= sell_level and i in self.bought:
                self.bought.discard(i)
                gross = self.per_grid_usdt * (sell_level - buy_level) / buy_level
                fee   = self.per_grid_usdt * (self.maker_fee_pct + self.taker_fee_pct)
                self.realized_pnl += gross - fee
                print(f"[Grid] SAT — seviye {i}→{i+1}: ${sell_level:.2f}, net ≈ ${gross - fee:.3f}")
                return "sell"

        return None

    # ─── Durum özeti ──────────────────────────────────────────────────────────

    def status(self) -> dict:
        if not self.initialized:
            return {"initialized": False}
        return {
            "initialized": True,
            "levels": len(self.levels),
            "active_positions": len(self.bought),
            "entry_price": self.entry_price,
            "lower": self.levels[0],
            "upper": self.levels[-1],
            "invested_usdt": len(self.bought) * self.per_grid_usdt,
            "realized_pnl": round(self.realized_pnl, 4),
        }
