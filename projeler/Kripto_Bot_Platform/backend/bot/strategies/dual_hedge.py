
import numpy as np

class DualHedgeStrategy:
    """
    Dual-Mode Hedge Strategy: Dynamic Volatility Breakout
    - Opens both Long and Short positions simultaneously.
    - Uses ATR for initial TP/SL.
    - Dynamically updates TP/SL based on price movement.
    - Implements Trailing Stop for profitable side.
    """
    def __init__(self, params: dict):
        self.atr_period = int(params.get("atr_period", 14))
        self.atr_mult_tp = float(params.get("atr_mult_tp", 4.0))  # Final TP
        self.atr_mult_sl = float(params.get("atr_mult_sl", 1.5))
        self.partial_tp_mult = float(params.get("partial_tp_mult", 2.0)) # Take 50% here
        self.move_to_be_pct = float(params.get("move_to_be_pct", 0.4))
        self.tighten_other_pct = float(params.get("tighten_other_pct", 0.2))
        self.trail_activation_pct = float(params.get("trail_activation_pct", 0.8))
        self.trail_atr_mult = float(params.get("trail_atr_mult", 1.0))

    def calculate_entry(self, price: float, atr: float):
        """Initial entry setup for both sides."""
        long_sl = price - (atr * self.atr_mult_sl)
        long_tp = price + (atr * self.atr_mult_tp)
        
        short_sl = price + (atr * self.atr_mult_sl)
        short_tp = price - (atr * self.atr_mult_tp)
        
        return {
            "long": {"tp": long_tp, "sl": long_sl},
            "short": {"tp": short_tp, "sl": short_sl}
        }

    def check_updates(self, current_price: float, positions: list, atr: float = 0):
        """
        Check if TP/SL updates or partial closes are needed.
        positions: list of dicts with {side, entry_price, current_tp, current_sl, size}
        Returns: list of updates [{side, tp, sl, action}, ...]
        """
        updates = []
        long_pos = next((p for p in positions if p["side"] == "long"), None)
        short_pos = next((p for p in positions if p["side"] == "short"), None)
        
        if not long_pos or not short_pos:
            remaining = long_pos or short_pos
            if remaining:
                self._check_single_side_trail(current_price, remaining, atr, updates)
            return updates

        # --- Dual Mode Logic ---
        
        # 1. Long side management
        long_profit_pct = (current_price - long_pos["entry_price"]) / long_pos["entry_price"] * 100
        
        # Partial TP check
        if atr > 0:
            tp1_price = long_pos["entry_price"] + (atr * self.partial_tp_mult)
            if current_price >= tp1_price and not long_pos.get("is_partial_closed"):
                updates.append({"side": "long", "action": "partial_close", "reason": "TP1 hit"})
                # Move SL to BE immediately
                new_sl = long_pos["entry_price"] * 1.0005
                updates.append({"side": "long", "sl": new_sl})
                
                # Tighten Short SL significantly
                new_short_sl = long_pos["entry_price"] # Short stop at Long entry
                if short_pos["current_sl"] > new_short_sl:
                    updates.append({"side": "short", "sl": new_short_sl})

        # Standard BE Move
        if long_profit_pct >= self.move_to_be_pct:
            new_long_sl = long_pos["entry_price"] * 1.0005
            if long_pos["current_sl"] < new_long_sl:
                updates.append({"side": "long", "sl": new_long_sl})
            
            # Tighten Short SL
            new_short_sl = long_pos["entry_price"] * (1 + self.tighten_other_pct / 100)
            if short_pos["current_sl"] > new_short_sl:
                updates.append({"side": "short", "sl": new_short_sl})

        # 2. Short side management
        short_profit_pct = (short_pos["entry_price"] - current_price) / short_pos["entry_price"] * 100
        
        # Partial TP check
        if atr > 0:
            tp1_price = short_pos["entry_price"] - (atr * self.partial_tp_mult)
            if current_price <= tp1_price and not short_pos.get("is_partial_closed"):
                updates.append({"side": "short", "action": "partial_close", "reason": "TP1 hit"})
                # Move SL to BE
                new_sl = short_pos["entry_price"] * 0.9995
                updates.append({"side": "short", "sl": new_sl})
                
                # Tighten Long SL significantly
                new_long_sl = short_pos["entry_price"]
                if long_pos["current_sl"] < new_long_sl:
                    updates.append({"side": "long", "sl": new_long_sl})

        # Standard BE Move
        if short_profit_pct >= self.move_to_be_pct:
            new_short_sl = short_pos["entry_price"] * 0.9995
            if short_pos["current_sl"] > new_short_sl:
                updates.append({"side": "short", "sl": new_short_sl})
            
            # Tighten Long SL
            new_long_sl = short_pos["entry_price"] * (1 - self.tighten_other_pct / 100)
            if long_pos["current_sl"] < new_long_sl:
                updates.append({"side": "long", "sl": new_long_sl})
        
        # --- Trailing Stop Activation ---
        if atr > 0:
            if long_profit_pct >= self.trail_activation_pct:
                trail_sl = current_price - (atr * self.trail_atr_mult)
                if trail_sl > long_pos["current_sl"]:
                    updates.append({"side": "long", "sl": trail_sl})
            
            if short_profit_pct >= self.trail_activation_pct:
                trail_sl = current_price + (atr * self.trail_atr_mult)
                if trail_sl < short_pos["current_sl"]:
                    updates.append({"side": "short", "sl": trail_sl})
                
        return updates

    def _check_single_side_trail(self, current_price: float, pos: dict, atr: float, updates: list):
        """If only one side remains, manage it with standard trailing."""
        if atr <= 0: return
        
        if pos["side"] == "long":
            profit_pct = (current_price - pos["entry_price"]) / pos["entry_price"] * 100
            if profit_pct >= self.trail_activation_pct:
                trail_sl = current_price - (atr * self.trail_atr_mult)
                if trail_sl > pos["current_sl"]:
                    updates.append({"side": "long", "sl": trail_sl})
        else:
            profit_pct = (pos["entry_price"] - current_price) / pos["entry_price"] * 100
            if profit_pct >= self.trail_activation_pct:
                trail_sl = current_price + (atr * self.trail_atr_mult)
                if trail_sl < pos["current_sl"]:
                    updates.append({"side": "short", "sl": trail_sl})
