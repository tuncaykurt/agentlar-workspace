import pandas as pd
import numpy as np

class GridBacktestEngine:
    def __init__(self, config: dict):
        self.config = config
        self.grid_mode = config.get("grid_mode", "bollinger")
        self.grid_direction = config.get("grid_direction", "auto")
        self.grid_count = int(config.get("grid_count", 20))
        self.initial_balance = float(config.get("initial_balance", 10000))
        self.order_size = float(config.get("order_size", 100)) # Toplam bütçe
        self.leverage = int(config.get("leverage", 10))
        self.fee_pct = float(config.get("fee_pct", 0.06)) / 100
        
        self.bb_period = int(config.get("bb_period", 20))
        self.bb_std = float(config.get("bb_std_dev", 2.0))
        self.filters = config.get("filters", {})
        
        self.margin_per_level = self.order_size / self.grid_count

    def run(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.bb_period + 10:
            return {"error": "Yetersiz veri", "candle_count": len(ohlcv)}

        # DataFrame oluştur
        df = pd.DataFrame(ohlcv, columns=["time", "open", "high", "low", "close", "volume"])
        df["sma"] = df["close"].rolling(self.bb_period).mean()
        df["std"] = df["close"].rolling(self.bb_period).std()
        df["bb_upper"] = df["sma"] + self.bb_std * df["std"]
        df["bb_lower"] = df["sma"] - self.bb_std * df["std"]
        
        # Squeeze
        df["kc_mid"] = df["sma"]
        df["tr"] = np.maximum(df["high"] - df["low"], 
                              np.maximum(abs(df["high"] - df["close"].shift(1)), 
                                         abs(df["low"] - df["close"].shift(1))))
        df["atr"] = df["tr"].rolling(self.bb_period).mean()
        df["kc_upper"] = df["kc_mid"] + 1.5 * df["atr"]
        df["kc_lower"] = df["kc_mid"] - 1.5 * df["atr"]
        df["is_squeeze"] = (df["bb_upper"] < df["kc_upper"]) & (df["bb_lower"] > df["kc_lower"])
        
        # RSI
        delta = df["close"].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df["rsi"] = 100 - (100 / (1 + rs))

        trades = []
        equity_curve = []
        balance = self.initial_balance
        
        state = {
            "upper": 0, "lower": 0, "step": 0, "levels": [],
            "filled": set(), "entry_prices": {},
            "last_level": -1,
            "bb_dir_paused": False, "bb_dir_wait_cross": False,
            "bb_dir_last_mid": ""
        }
        
        grid_upper_line = []
        grid_lower_line = []

        for i in range(self.bb_period, len(df)):
            row = df.iloc[i]
            ts = int(row["time"])
            price = float(row["close"])
            high = float(row["high"])
            low = float(row["low"])
            
            bb_upper = float(row["bb_upper"])
            bb_lower = float(row["bb_lower"])
            bb_mid = float(row["sma"])
            rsi = float(row["rsi"])
            is_squeeze = bool(row["is_squeeze"])
            above_mid = price > bb_mid
            
            # Active direction
            active_dir = self.grid_direction
            if self.grid_mode == "bb_direction" or self.grid_direction == "auto":
                active_dir = "long" if above_mid else "short"
                
            skip_buy = False
            skip_sell = False
            
            if self.grid_mode == "bb_direction":
                current_mid_side = "above" if price > bb_mid else "below"
                if state["bb_dir_wait_cross"]:
                    if state["bb_dir_last_mid"] and current_mid_side != state["bb_dir_last_mid"]:
                        state["bb_dir_wait_cross"] = False
                        state["bb_dir_paused"] = False
                        if bb_upper > bb_lower:
                            state["upper"], state["lower"] = bb_upper, bb_lower
                            state["step"] = (bb_upper - bb_lower) / self.grid_count
                            state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["last_level"] = -1
                    state["bb_dir_last_mid"] = current_mid_side
                    continue
                if state["bb_dir_paused"]:
                    state["bb_dir_wait_cross"] = True
                    state["bb_dir_last_mid"] = current_mid_side
                    continue
                if not state["bb_dir_last_mid"]:
                    state["bb_dir_last_mid"] = current_mid_side
                    
            if self.filters.get("rsi_filter"):
                if active_dir == "long":
                    if rsi > 70: skip_buy = True
                    if rsi < 30: skip_sell = True
                else:
                    if rsi < 30: skip_buy = True
                    if rsi > 70: skip_sell = True
                    
            if self.filters.get("squeeze_filter") and is_squeeze:
                skip_buy = True
                
            if self.filters.get("midline_filter"):
                if active_dir == "long" and not above_mid: skip_buy = True
                elif active_dir == "short" and above_mid: skip_buy = True

            # Init bounds if 0
            if state["upper"] == 0 and bb_upper > bb_lower:
                state["upper"], state["lower"] = bb_upper, bb_lower
                state["step"] = (bb_upper - bb_lower) / self.grid_count
                state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                
            if not state["levels"]: continue
            
            # Find current level based on low and high
            # To be precise, we check if price crossed levels. For simplicity in OHLCV, we simulate using close.
            current_level = int((price - state["lower"]) / state["step"]) if state["step"] > 0 else 0
            current_level = max(0, min(self.grid_count - 1, current_level))
            
            if state["last_level"] == -1:
                state["last_level"] = current_level
                continue
                
            cs = 0.01 if "BTC" not in self.config.get("symbol", "") else 0.0001
            contracts = max(1, int((self.margin_per_level * self.leverage) / (price * cs)))
            
            if active_dir == "long":
                if current_level < state["last_level"] and not skip_buy:
                    for lvl in range(state["last_level"] - 1, current_level - 1, -1):
                        if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                            state["filled"].add(lvl)
                            state["entry_prices"][lvl] = price
                            trades.append({"entry_ts": ts, "side": "buy", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": contracts*cs})
                elif current_level > state["last_level"] and not skip_sell:
                    for lvl in range(state["last_level"], current_level):
                        if lvl in state["filled"]:
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price - state["step"])
                            gross = (price - ep) * contracts * cs
                            notional = contracts * cs * price
                            net_pnl = gross - notional * self.fee_pct * 2
                            balance += net_pnl
                            trades.append({"entry_ts": ts, "exit_ts": ts, "side": "buy", "entry": ep, "exit": price, "pnl": net_pnl, "status": "closed", "lvl": lvl, "qty": contracts*cs})
            else: # short
                if current_level > state["last_level"] and not skip_buy:
                    for lvl in range(state["last_level"] + 1, current_level + 1):
                        if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                            state["filled"].add(lvl)
                            state["entry_prices"][lvl] = price
                            trades.append({"entry_ts": ts, "side": "sell", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": contracts*cs})
                elif current_level < state["last_level"] and not skip_sell:
                    for lvl in range(state["last_level"], current_level, -1):
                        if lvl in state["filled"]:
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price + state["step"])
                            gross = (ep - price) * contracts * cs
                            notional = contracts * cs * price
                            net_pnl = gross - notional * self.fee_pct * 2
                            balance += net_pnl
                            trades.append({"entry_ts": ts, "exit_ts": ts, "side": "sell", "entry": ep, "exit": price, "pnl": net_pnl, "status": "closed", "lvl": lvl, "qty": contracts*cs})

            state["last_level"] = current_level
            
            # Band exit
            if state["filled"]:
                exited = False
                side = None
                if active_dir == "long" and price > bb_upper:
                    exited, side = True, "upper"
                elif active_dir == "short" and price < bb_lower:
                    exited, side = True, "lower"
                    
                if exited:
                    close_lvls = list(state["filled"])
                    for lvl in close_lvls:
                        state["filled"].discard(lvl)
                        ep = state["entry_prices"].pop(lvl, price)
                        gross = (price - ep) * contracts * cs if active_dir == "long" else (ep - price) * contracts * cs
                        notional = contracts * cs * price
                        net_pnl = gross - notional * self.fee_pct * 2
                        balance += net_pnl
                        trades.append({"entry_ts": ts, "exit_ts": ts, "side": active_dir, "entry": ep, "exit": price, "pnl": net_pnl, "status": "band_exit", "lvl": lvl, "qty": contracts*cs})
                    if self.grid_mode == "bb_direction":
                        state["bb_dir_paused"] = True

            # Trailing
            if not state.get("bb_dir_paused"):
                if price >= state["upper"]:
                    state["upper"] = price
                    state["lower"] = state["lower"] + (price - state["upper"]) if state["upper"]>0 else price - (state["step"]*self.grid_count)
                    state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                elif price <= state["lower"] and not state["filled"]:
                    state["lower"] = price
                    state["upper"] = state["upper"] - (state["lower"] - price) if state["lower"]>0 else price + (state["step"]*self.grid_count)
                    state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                    
            if i % 20 == 0:
                equity_curve.append({"time": ts // 1000, "equity": balance})
                
            if state["upper"] > 0:
                grid_upper_line.append({"time": ts // 1000, "value": round(state["upper"], 8)})
                grid_lower_line.append({"time": ts // 1000, "value": round(state["lower"], 8)})

        # Calculate metrics
        closed = [t for t in trades if t["status"] in ("closed", "band_exit")]
        pnls = [t["pnl"] for t in closed]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        
        indicators = {}
        if grid_upper_line:
            indicators["grid_upper"] = grid_upper_line
            indicators["grid_lower"] = grid_lower_line

        return {
            "total_trades": len(closed),
            "final_balance": round(balance, 2),
            "total_pnl": round(sum(pnls), 2),
            "total_pnl_pct": round((sum(pnls) / self.initial_balance) * 100, 2) if self.initial_balance>0 else 0,
            "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
            "max_drawdown_pct": 0,
            "sharpe_ratio": 0,
            "profit_factor": round(sum(wins)/abs(sum(losses)), 2) if sum(losses)!=0 else (99 if wins else 0),
            "best_trade": round(max(pnls), 2) if pnls else 0,
            "worst_trade": round(min(pnls), 2) if pnls else 0,
            "trades": [{"entry_ts": t["entry_ts"], "exit_ts": t.get("exit_ts", t["entry_ts"]), "side": t["side"], "entry": t["entry"], "exit": t["exit"], "pnl": t["pnl"], "qty": t["qty"], "exit_reason": t["status"]} for t in closed],
            "equity_curve": equity_curve,
            "indicators": indicators,
        }
