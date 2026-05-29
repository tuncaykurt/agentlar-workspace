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

        # EMAs
        df["ema6"] = df["close"].ewm(span=6, adjust=False).mean()
        df["ema14"] = df["close"].ewm(span=14, adjust=False).mean()
        df["ema50"] = df["close"].ewm(span=50, adjust=False).mean()
        df["ema200"] = df["close"].ewm(span=200, adjust=False).mean()

        trades = []
        equity_curve = []
        balance = self.initial_balance
        
        state = {
            "upper": 0, "lower": 0, "step": 0, "levels": [],
            "margin_per_level": self.margin_per_level,
            "filled": set(), "entry_prices": {}, "contracts": {}, "entry_times": {},
            "last_level": -1,
            "bb_dir_paused": False, "bb_dir_wait_cross": self.grid_mode == "bb_direction",
            "bb_dir_last_mid": "",
            "ema_paused": False, "ema_wait_cross": self.grid_mode == "ema_trend",
            "active_direction": "long",
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
            if self.grid_mode == "ema_trend":
                active_dir = state["active_direction"]
            else:
                active_dir = self.grid_direction
                if self.grid_mode == "bb_direction" or self.grid_direction == "auto":
                    active_dir = "long" if above_mid else "short"
                
            skip_buy = False
            skip_sell = False
            
            if self.grid_mode == "ema_trend":
                ema6 = float(row["ema6"])
                ema14 = float(row["ema14"])
                ema50 = float(row["ema50"])
                ema200 = float(row["ema200"])
                prev_ema6 = float(df.iloc[i-1]["ema6"]) if i > 0 else ema6
                prev_ema14 = float(df.iloc[i-1]["ema14"]) if i > 0 else ema14
                
                min_ema_pct = float(self.config.get("min_ema_pct", 1.0))
                
                trend_long = (ema50 > ema200) and ((ema50 - ema200) / max(ema200, 1) * 100 >= min_ema_pct)
                cross_long = (ema6 > ema14) and (prev_ema6 <= prev_ema14)
                pullback_long = price > ema50
                long_cond = trend_long and cross_long and pullback_long
                
                trend_short = (ema50 < ema200) and ((ema200 - ema50) / max(ema50, 1) * 100 >= min_ema_pct)
                cross_short = (ema6 < ema14) and (prev_ema6 >= prev_ema14)
                pullback_short = price < ema50
                short_cond = trend_short and cross_short and pullback_short
                
                if state["ema_wait_cross"]:
                    if long_cond or short_cond:
                        state["ema_wait_cross"] = False
                        state["ema_paused"] = False
                        state["active_direction"] = "long" if long_cond else "short"
                        active_dir = state["active_direction"]
                        
                        spread_pct = float(self.config.get("spread_pct", 1.5))
                        state["upper"] = price * (1 + spread_pct / 200)
                        state["lower"] = price * (1 - spread_pct / 200)
                        state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                        state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                        if self.config.get("budget_mode") == "percent":
                            state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                        else:
                            state["margin_per_level"] = self.margin_per_level
                        trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                        
                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["contracts"] = {}
                        state["entry_times"] = {}
                        state["last_level"] = -1
                    continue
                if state["ema_paused"]:
                    state["ema_wait_cross"] = True
                    continue
            
            if self.grid_mode == "bb_direction":
                current_mid_side = "above" if price > bb_mid else "below"
                if state["bb_dir_wait_cross"]:
                    if state["bb_dir_last_mid"] and current_mid_side != state["bb_dir_last_mid"]:
                        state["bb_dir_wait_cross"] = False
                        state["bb_dir_paused"] = False
                        
                        min_sp = self.config.get("min_spread_pct", 0.3) / 100
                        if (bb_upper - bb_lower) / bb_mid < min_sp:
                            diff = (bb_mid * min_sp) / 2
                            bb_upper = bb_mid + diff
                            bb_lower = bb_mid - diff
                            
                        if bb_upper > bb_lower and price > 0:
                            bb_spread_pct = (bb_upper - bb_lower) / price * 100
                            state["upper"] = price * (1 + bb_spread_pct / 200)
                            state["lower"] = price * (1 - bb_spread_pct / 200)
                            state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                            state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                            if self.config.get("budget_mode") == "percent":
                                state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                            else:
                                state["margin_per_level"] = self.margin_per_level
                            trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["contracts"] = {}
                        state["entry_times"] = {}
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

            # Check liquidation
            cs = 0.01 if "BTC" not in self.config.get("symbol", "") else 0.0001
            liquidated_lvls = []
            for lvl in list(state["filled"]):
                ep = state["entry_prices"][lvl]
                if active_dir == "long":
                    liq_price = ep * (1 - 1/self.leverage + self.fee_pct)
                    if low <= liq_price:
                        liquidated_lvls.append((lvl, liq_price))
                else:
                    liq_price = ep * (1 + 1/self.leverage - self.fee_pct)
                    if high >= liq_price:
                        liquidated_lvls.append((lvl, liq_price))
                        
            for lvl, liq_price in liquidated_lvls:
                state["filled"].discard(lvl)
                ep = state["entry_prices"].pop(lvl)
                lvl_contracts = state["contracts"].pop(lvl)
                entry_ts = state["entry_times"].pop(lvl, ts)
                margin_used = (lvl_contracts * cs * ep) / self.leverage
                pos_val = lvl_contracts * cs * ep
                fee = pos_val * self.fee_pct * 2 # Open + Close fee estimation
                net_pnl = -margin_used
                balance += net_pnl
                trades.append({
                    "entry_ts": entry_ts, "exit_ts": ts, "side": active_dir, "entry": ep, "exit": liq_price,
                    "pnl": net_pnl, "fee": fee, "status": "closed", "lvl": lvl, "qty": lvl_contracts*cs,
                    "margin": margin_used, "position_value": pos_val, "pnl_pct": -100, "exit_reason": "liquidation"
                })
                
            if balance <= 0:
                balance = 0
                break # Account blown up

            # Init bounds if 0 (non-ema)
            if state["upper"] == 0 and self.grid_mode != "ema_trend" and bb_upper > bb_lower:
                min_sp = self.config.get("min_spread_pct", 0.3) / 100
                if (bb_upper - bb_lower) / bb_mid < min_sp:
                    diff = (bb_mid * min_sp) / 2
                    bb_upper = bb_mid + diff
                    bb_lower = bb_mid - diff
                    
                state["upper"], state["lower"] = bb_upper, bb_lower
                state["step"] = (bb_upper - bb_lower) / self.grid_count
                state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                if self.config.get("budget_mode") == "percent":
                    state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                else:
                    state["margin_per_level"] = self.margin_per_level
                trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                
            if not state["levels"]: continue
            
            # Find current level based on low and high
            # To be precise, we check if price crossed levels. For simplicity in OHLCV, we simulate using close.
            current_level = int((price - state["lower"]) / state["step"]) if state["step"] > 0 else 0
            current_level = max(0, min(self.grid_count - 1, current_level))
            
            if state["last_level"] == -1:
                state["last_level"] = current_level
                continue
                
            cs = 0.01 if "BTC" not in self.config.get("symbol", "") else 0.0001
            contracts = max(1, int((state["margin_per_level"] * self.leverage) / (price * cs)))
            
            if active_dir == "long":
                if current_level < state["last_level"] and not skip_buy:
                    for lvl in range(state["last_level"] - 1, current_level - 1, -1):
                        if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                            state["filled"].add(lvl)
                            state["entry_prices"][lvl] = price
                            state["contracts"][lvl] = contracts
                            state["entry_times"][lvl] = ts
                            margin_used = (contracts * cs * price) / self.leverage
                            pos_val = contracts * cs * price
                            trades.append({"entry_ts": ts, "side": "buy", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": 0})
                elif current_level > state["last_level"] and not skip_sell:
                    for lvl in range(state["last_level"], current_level):
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price - state["step"])
                            lvl_contracts = state["contracts"].pop(lvl, contracts)
                            entry_ts = state["entry_times"].pop(lvl, ts)
                            gross = (price - ep) * lvl_contracts * cs
                            fee = (lvl_contracts * cs * ep * self.fee_pct) + (lvl_contracts * cs * price * self.fee_pct)
                            net_pnl = gross - fee
                            balance += net_pnl
                            margin_used = (lvl_contracts * cs * ep) / self.leverage
                            pos_val = lvl_contracts * cs * ep
                            pnl_pct = (net_pnl / margin_used * 100) if margin_used > 0 else 0
                            trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": "buy", "entry": ep, "exit": price, "pnl": net_pnl, "fee": fee, "status": "closed", "lvl": lvl, "qty": lvl_contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": pnl_pct})
            else: # short
                if current_level > state["last_level"] and not skip_buy:
                    for lvl in range(state["last_level"] + 1, current_level + 1):
                        if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                            state["filled"].add(lvl)
                            state["entry_prices"][lvl] = price
                            state["contracts"][lvl] = contracts
                            state["entry_times"][lvl] = ts
                            margin_used = (contracts * cs * price) / self.leverage
                            pos_val = contracts * cs * price
                            trades.append({"entry_ts": ts, "side": "sell", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": 0})
                elif current_level < state["last_level"] and not skip_sell:
                    for lvl in range(state["last_level"], current_level, -1):
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price + state["step"])
                            lvl_contracts = state["contracts"].pop(lvl, contracts)
                            entry_ts = state["entry_times"].pop(lvl, ts)
                            gross = (ep - price) * lvl_contracts * cs
                            fee = (lvl_contracts * cs * ep * self.fee_pct) + (lvl_contracts * cs * price * self.fee_pct)
                            net_pnl = gross - fee
                            balance += net_pnl
                            margin_used = (lvl_contracts * cs * ep) / self.leverage
                            pos_val = lvl_contracts * cs * ep
                            pnl_pct = (net_pnl / margin_used * 100) if margin_used > 0 else 0
                            trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": "sell", "entry": ep, "exit": price, "pnl": net_pnl, "fee": fee, "status": "closed", "lvl": lvl, "qty": lvl_contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": pnl_pct})

            state["last_level"] = current_level
            
            # Band exit (even if not filled, we should close the grid)
            if state["upper"] > 0:
                exited = False
                side = None
                
                if self.grid_mode == "ema_trend":
                    ema_exit_mode = self.config.get("ema_exit_mode", "ema_cross")
                    if ema_exit_mode == "bollinger":
                        if active_dir == "long" and price > bb_upper: exited, side = True, "upper"
                        elif active_dir == "short" and price < bb_lower: exited, side = True, "lower"
                    elif ema_exit_mode == "ema_cross":
                        ema6, ema14 = float(row["ema6"]), float(row["ema14"])
                        if active_dir == "long" and ema6 < ema14: exited, side = True, "upper"
                        elif active_dir == "short" and ema6 > ema14: exited, side = True, "lower"
                    elif ema_exit_mode == "touch_ema50":
                        ema50 = float(row["ema50"])
                        if active_dir == "long" and low <= ema50: exited, side = True, "upper"
                        elif active_dir == "short" and high >= ema50: exited, side = True, "lower"
                    elif ema_exit_mode == "touch_ema200":
                        ema200 = float(row["ema200"])
                        if active_dir == "long" and low <= ema200: exited, side = True, "upper"
                        elif active_dir == "short" and high >= ema200: exited, side = True, "lower"
                else:
                    if active_dir == "long" and price > bb_upper:
                        exited, side = True, "upper"
                    elif active_dir == "short" and price < bb_lower:
                        exited, side = True, "lower"
                    
                if exited:
                    close_lvls = list(state["filled"])
                    for lvl in close_lvls:
                        state["filled"].discard(lvl)
                        ep = state["entry_prices"].pop(lvl, price)
                        lvl_contracts = state["contracts"].pop(lvl, contracts)
                        entry_ts = state["entry_times"].pop(lvl, ts)
                        gross = (price - ep) * lvl_contracts * cs if active_dir == "long" else (ep - price) * lvl_contracts * cs
                        fee = (lvl_contracts * cs * ep * self.fee_pct) + (lvl_contracts * cs * price * self.fee_pct)
                        net_pnl = gross - fee
                        balance += net_pnl
                        margin_used = (lvl_contracts * cs * ep) / self.leverage
                        pos_val = lvl_contracts * cs * ep
                        pnl_pct = (net_pnl / margin_used * 100) if margin_used > 0 else 0
                        trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": active_dir, "entry": ep, "exit": price, "pnl": net_pnl, "fee": fee, "status": "band_exit", "lvl": lvl, "qty": lvl_contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": pnl_pct, "exit_reason": "bb_upper_band" if side == "upper" else "bb_lower_band"})
                    if self.grid_mode == "bb_direction":
                        state["bb_dir_paused"] = True
                    if self.grid_mode == "ema_trend":
                        state["ema_paused"] = True
                    trades.append({"entry_ts": ts, "side": "grid_end", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                    state["upper"] = 0
                    state["lower"] = 0
                    state["levels"] = []
                    continue

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

        # Force close open positions at the end
        if state["filled"]:
            last_price = float(df.iloc[-1]["close"])
            last_ts = int(df.iloc[-1]["time"])
            cs = 0.01 if "BTC" not in self.config.get("symbol", "") else 0.0001
            contracts = max(1, int((state["margin_per_level"] * self.leverage) / (last_price * cs)))
            active_dir = state.get("active_direction", "long") if self.grid_mode == "ema_trend" else self.grid_direction
            
            for lvl in list(state["filled"]):
                ep = state["entry_prices"].get(lvl, last_price)
                lvl_contracts = state["contracts"].get(lvl, contracts)
                gross = (last_price - ep) * lvl_contracts * cs if active_dir == "long" else (ep - last_price) * lvl_contracts * cs
                fee = (lvl_contracts * cs * ep * self.fee_pct) + (lvl_contracts * cs * last_price * self.fee_pct)
                net_pnl = gross - fee
                balance += net_pnl
                margin_used = (lvl_contracts * cs * ep) / self.leverage
                pos_val = lvl_contracts * cs * ep
                pnl_pct = (net_pnl / margin_used * 100) if margin_used > 0 else 0
                trades.append({"entry_ts": last_ts, "exit_ts": last_ts, "side": active_dir, "entry": ep, "exit": last_price, "pnl": net_pnl, "fee": fee, "status": "closed", "lvl": lvl, "qty": lvl_contracts*cs, "margin": margin_used, "position_value": pos_val, "pnl_pct": pnl_pct, "exit_reason": "end_of_data"})

        # Calculate metrics
        closed = [t for t in trades if t["status"] in ("closed", "band_exit")]
        pnls = [t["pnl"] for t in closed]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        
        indicators = {}
        if grid_upper_line:
            indicators["grid_upper"] = grid_upper_line
            indicators["grid_lower"] = grid_lower_line

        fees = [t.get("fee", 0) for t in closed]

        return {
            "total_trades": len(closed),
            "final_balance": round(balance, 2),
            "total_pnl": round(sum(pnls), 2),
            "total_fees": round(sum(fees), 2),
            "total_pnl_pct": round((sum(pnls) / self.initial_balance) * 100, 2) if self.initial_balance>0 else 0,
            "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
            "win_count": len(wins),
            "loss_count": len(losses),
            "max_drawdown_pct": 0,
            "sharpe_ratio": 0,
            "profit_factor": round(sum(wins)/abs(sum(losses)), 2) if sum(losses)!=0 else (99 if wins else 0),
            "best_trade": round(max(pnls), 2) if pnls else 0,
            "worst_trade": round(min(pnls), 2) if pnls else 0,
            "trades": [{"entry_ts": t["entry_ts"], "exit_ts": t.get("exit_ts", t["entry_ts"]), "side": t["side"], "entry": t["entry"], "exit": t["exit"], "pnl": t["pnl"], "fee": t.get("fee", 0), "qty": t["qty"], "margin": t.get("margin", 0), "position_value": t.get("position_value", 0), "pnl_pct": t.get("pnl_pct", 0), "exit_reason": t.get("exit_reason", t["status"])} for t in closed],
            "equity_curve": equity_curve,
            "indicators": indicators,
        }
