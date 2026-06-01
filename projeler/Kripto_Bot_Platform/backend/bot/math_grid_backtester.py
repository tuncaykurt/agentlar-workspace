import pandas as pd
import numpy as np
from bot.strategies.math_grid_gemini import MathGridGeminiStrategy

class MathGeminiBacktestEngine:
    def __init__(self, config: dict):
        self.config = config
        self.initial_balance = float(config.get("initial_balance", 10000))
        self.order_size = float(config.get("order_size", 100))  # Total budget
        self.leverage = int(config.get("leverage", 10))
        self.fee_pct = float(config.get("fee_pct", 0.02)) / 100

        # Parse budget
        grid_count = int(config.get("grid_count", 20))
        if config.get("budget_mode") == "percent":
            total_budget = self.initial_balance * (self.order_size / 100)
        else:
            total_budget = self.order_size
            
        per_grid_usdt = total_budget / grid_count

        strat_params = {
            "grid_count": grid_count,
            "per_grid_usdt": per_grid_usdt,
            "atr_period": int(config.get("atr_period", 14)),
            "atr_grid_mult": float(config.get("atr_grid_mult", 0.5)),
            "adx_period": int(config.get("adx_period", 14)),
            "adx_threshold": float(config.get("adx_threshold", 25)),
            "ema_period": int(config.get("ema_period", 200)),
            "breakout_atr_mult": float(config.get("breakout_atr_mult", 1.5)),
            "target_pnl_pct": float(config.get("target_pnl_pct", 5)),
            "max_drawdown_pct": float(config.get("max_drawdown_pct", 15)),
        }
        self.strat = MathGridGeminiStrategy(strat_params)

    def run(self, ohlcv: list) -> dict:
        warmup = max(self.strat.ema_period, self.strat.adx_period, self.strat.atr_period)
        if len(ohlcv) < warmup + 10:
            return {"error": "Yetersiz veri", "candle_count": len(ohlcv)}

        df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
        
        import ta
        ema_ind = ta.trend.EMAIndicator(close=df['close'], window=self.strat.ema_period)
        df['EMA'] = ema_ind.ema_indicator()
        
        ema_line = []
        for i in range(len(df)):
            if not pd.isna(df['EMA'].iloc[i]):
                ema_line.append({"time": int(df['timestamp'].iloc[i]) // 1000, "value": round(float(df['EMA'].iloc[i]), 2)})
        
        trades = []
        equity_curve = []
        balance = self.initial_balance
        
        # Grid lines tracking
        grid_upper_line = []
        grid_lower_line = []

        start_idx = warmup
        
        # State tracking manually (since strat tracks it implicitly)
        # However strat._bought only stores level indexes.
        # We need to track actual trades for BacktestResult format.
        active_trades = {}  # lvl_idx -> trade info
        
        for i in range(start_idx, len(df)):
            row = df.iloc[i]
            ts = int(row["timestamp"])
            price = float(row["close"])
            
            if not self.strat.initialized:
                # Initialize using past data up to this point
                past_ohlcv = ohlcv[0:i]
                self.strat.initialize(price, past_ohlcv)
                
                if self.strat.initialized:
                    trades.append({
                        "entry_ts": ts, "side": "grid_start", "entry": price, 
                        "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0
                    })
            
            if self.strat.initialized:
                sig = self.strat.generate_signal(price)
                
                # Check for grid level lines
                if self.strat.upper_bound > 0:
                    grid_upper_line.append({"time": ts // 1000, "value": round(self.strat.upper_bound, 8)})
                    grid_lower_line.append({"time": ts // 1000, "value": round(self.strat.lower_bound, 8)})
                
                if sig in ("take_profit", "stop_loss"):
                    # Close all
                    if active_trades:
                        for lvl_idx, t in list(active_trades.items()):
                            ep = t["entry"]
                            qty = t["qty"]
                            margin = t["margin"]
                            side = t.get("side", "long")
                            
                            gross = (price - ep) * qty if side == "long" else (ep - price) * qty
                            fee = qty * price * self.fee_pct
                            net_pnl = gross - fee
                            balance += net_pnl
                            
                            trades.append({
                                "entry_ts": t["entry_ts"], "exit_ts": ts, "side": side,
                                "entry": ep, "exit": price, "pnl": round(net_pnl, 4),
                                "fee": round(fee, 4), "status": "closed", "lvl": lvl_idx,
                                "qty": qty, "margin": round(margin, 2), 
                                "position_value": round(qty * ep, 2),
                                "pnl_pct": round((net_pnl / margin * 100), 2) if margin > 0 else 0,
                                "exit_reason": sig
                            })
                        active_trades.clear()
                        trades.append({"entry_ts": ts, "side": "grid_end", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                    
                elif sig in ("buy", "sell"):
                    # Check for newly added positions
                    for lvl_idx in self.strat.bought:
                        if lvl_idx not in active_trades:
                            if self.strat.mode == "short":
                                ep = self.strat.levels[lvl_idx + 1] # Short entry at sell_level
                            else:
                                ep = self.strat.levels[lvl_idx]     # Long entry at buy_level
                                
                            margin = self.strat.per_grid_usdt
                            pos_val = margin * self.leverage
                            qty = pos_val / ep
                            side = "short" if self.strat.mode == "short" else "long"
                            
                            active_trades[lvl_idx] = {
                                "entry_ts": ts, "entry": ep, "qty": qty, "margin": margin, "side": side
                            }
                            trades.append({
                                "entry_ts": ts, "side": side, "entry": ep, "exit": 0,
                                "pnl": 0, "status": "open", "lvl": lvl_idx, "qty": qty,
                                "margin": round(margin, 2), "position_value": round(pos_val, 2),
                                "pnl_pct": 0
                            })
                            
                    # Check for removed positions
                    for lvl_idx, t in list(active_trades.items()):
                        if lvl_idx not in self.strat.bought:
                            ep = t["entry"]
                            qty = t["qty"]
                            margin = t["margin"]
                            side = t["side"]
                            
                            if side == "short":
                                exit_price = self.strat.levels[lvl_idx] # Short closes at lower bound
                                gross = (ep - exit_price) * qty
                            else:
                                exit_price = self.strat.levels[lvl_idx + 1] # Long closes at upper bound
                                gross = (exit_price - ep) * qty
                                
                            fee = qty * exit_price * self.fee_pct
                            net_pnl = gross - fee
                            balance += net_pnl
                            
                            trades.append({
                                "entry_ts": t["entry_ts"], "exit_ts": ts, "side": side,
                                "entry": ep, "exit": exit_price, "pnl": round(net_pnl, 4),
                                "fee": round(fee, 4), "status": "closed", "lvl": lvl_idx,
                                "qty": qty, "margin": round(margin, 2),
                                "position_value": round(qty * ep, 2),
                                "pnl_pct": round((net_pnl / margin * 100), 2) if margin > 0 else 0,
                                "exit_reason": "grid_tp"
                            })
                            del active_trades[lvl_idx]
                            
            if i % 20 == 0:
                equity_curve.append({"time": ts // 1000, "equity": balance})
                
        # Force close open positions at end
        if active_trades:
            last_price = float(df.iloc[-1]["close"])
            last_ts = int(df.iloc[-1]["timestamp"])
            for lvl_idx, t in active_trades.items():
                ep = t["entry"]
                qty = t["qty"]
                margin = t["margin"]
                side = t.get("side", "long")
                
                gross = (last_price - ep) * qty if side == "long" else (ep - last_price) * qty
                fee = qty * last_price * self.fee_pct
                net_pnl = gross - fee
                balance += net_pnl
                trades.append({
                    "entry_ts": t["entry_ts"], "exit_ts": last_ts, "side": side,
                    "entry": ep, "exit": last_price, "pnl": round(net_pnl, 4),
                    "fee": round(fee, 4), "status": "closed", "lvl": lvl_idx,
                    "qty": qty, "margin": round(margin, 2),
                    "position_value": round(qty * ep, 2),
                    "pnl_pct": round((net_pnl / margin * 100), 2) if margin > 0 else 0,
                    "exit_reason": "end_of_data"
                })

        closed = [t for t in trades if t["status"] == "closed"]
        pnls = [t["pnl"] for t in closed]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]
        fees = [t.get("fee", 0) for t in closed]
        
        indicators = {}
        if grid_upper_line:
            indicators["grid_upper"] = grid_upper_line
            indicators["grid_lower"] = grid_lower_line
        if ema_line:
            indicators[f"EMA_{self.strat.ema_period}"] = ema_line

        return {
            "total_trades": len(closed),
            "final_balance": round(balance, 2),
            "total_pnl": round(sum(pnls), 2),
            "total_fees": round(sum(fees), 2),
            "total_pnl_pct": round((sum(pnls) / self.initial_balance) * 100, 2) if self.initial_balance > 0 else 0,
            "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
            "win_count": len(wins),
            "loss_count": len(losses),
            "max_drawdown_pct": 0,
            "sharpe_ratio": 0,
            "profit_factor": round(sum(wins)/abs(sum(losses)), 2) if sum(losses)!=0 else (99 if wins else 0),
            "best_trade": round(max(pnls), 2) if pnls else 0,
            "worst_trade": round(min(pnls), 2) if pnls else 0,
            "trades": closed,
            "equity_curve": equity_curve,
            "indicators": indicators,
        }
