"""
Backtest Motoru
═══════════════
Geçmiş OHLCV verisi üzerinde strateji simülasyonu.
- DB'den veri çeker (DataFetcher)
- Seçilen stratejiyi bar bar çalıştırır
- Paper trade simülasyonu: giriş, çıkış, SL/TP
- Cross margin modu: tüm bakiye teminat olarak kullanılır (canlı trade ile aynı)
- Metrikler: win rate, PnL, max drawdown, Sharpe, profit factor
"""
import pandas as pd
import numpy as np
from datetime import datetime
from bot.strategies.ema_cross import EMACrossStrategy
from bot.strategies.rsi_oversold import RSIOversoldStrategy
from bot.strategies.macd_signal import MACDSignalStrategy
from bot.strategies.bollinger_bounce import BollingerBounceStrategy
from bot.strategies.ut_bot import UTBotStrategy
from bot.strategies.supertrend import SupertrendStrategy
from bot.strategies.bb_ema_cross import BBEMACrossStrategy
from ai.indicators import calculate_all


class BacktestEngine:
    def __init__(self, config: dict):
        self.strategy_name = config.get("strategy", "ema_cross")
        self.params = config.get("params", {})
        self.initial_balance = float(config.get("initial_balance", 10000))
        self.risk_per_trade = float(config.get("risk_per_trade", 0.02))
        self.leverage = int(config.get("leverage", 3))
        self.stop_loss_pct = float(config.get("stop_loss_pct", 2.0)) / 100
        self.take_profit_pct = float(config.get("take_profit_pct", 4.0)) / 100
        # MEXC API taker fee: giriş ve çıkışta ayrı ayrı uygulanır
        self.fee_pct = float(config.get("fee_pct", 0.06)) / 100  # MEXC taker fee (0.06% per side)
        self.maintenance_margin_rate = 0.005  # MEXC maintenance margin rate (0.5%)
        self.lookback = int(config.get("lookback", 200))
        self.timeframe = config.get("timeframe", "1h")
        self.reverse_on_signal = bool(config.get("reverse_on_signal", False))

    def _calc_cross_liq_price(self, entry: float, qty: float, side: str, balance: float) -> float:
        """
        Cross margin likidasyon fiyatı hesapla.
        Cross margin'de tüm bakiye teminat olarak kullanılır.

        Long:  liq = entry - (balance - notional * MMR) / qty
        Short: liq = entry + (balance - notional * MMR) / qty

        Eğer bakiye pozisyona göre çok büyükse likidasyon çok uzakta olur.
        """
        notional = entry * qty
        mmr = self.maintenance_margin_rate
        buffer = (balance - notional * mmr) / qty if qty > 0 else 0

        if side == "buy":
            liq = entry - buffer
            return max(0, liq)  # Negatif olamaz
        else:
            liq = entry + buffer
            return liq

    def run(self, ohlcv: list) -> dict:
        """
        ohlcv: [[ts, o, h, l, c, v], ...]
        Tüm veri üzerinde bar bar strateji çalıştırır.
        Cross margin: tüm bakiye teminat, likidasyon tüm bakiyeye göre hesaplanır.
        """
        if len(ohlcv) < self.lookback + 10:
            return {"error": "Yetersiz veri", "candle_count": len(ohlcv)}

        balance = self.initial_balance
        peak_balance = balance
        trades: list[dict] = []
        equity_curve: list[dict] = []
        position = None
        max_drawdown = 0.0

        for i in range(self.lookback, len(ohlcv)):
            window = ohlcv[i - self.lookback: i + 1]
            bar = ohlcv[i]
            ts, o, h, l, c, v = bar[0], bar[1], bar[2], bar[3], bar[4], bar[5]

            # ── Açık pozisyon varsa kontroller ──
            if position:
                # Cross margin: her barda likidasyon fiyatını güncelle (bakiye değişir)
                position["liq_price"] = self._calc_cross_liq_price(
                    position["entry"], position["qty"], position["side"], balance
                )

                if self.reverse_on_signal:
                    hit = self._check_liquidation_only(position, h, l)
                else:
                    hit = self._check_sl_tp(position, h, l)

                if hit:
                    exit_price = hit["exit_price"]
                    pnl = self._calc_pnl(position, exit_price)
                    # Fee: giriş ve çıkış ayrı ayrı notional üzerinden
                    entry_fee = position.get("entry_fee", 0)
                    exit_fee = position["qty"] * exit_price * self.fee_pct
                    net_pnl = pnl - entry_fee - exit_fee

                    if hit["reason"] == "liquidation":
                        # Likidasyon: cross margin'de tüm bakiye gider
                        net_pnl = -balance
                        balance = 0
                    else:
                        balance += net_pnl

                    trades.append(self._make_trade(position, ts, exit_price, net_pnl, entry_fee + exit_fee, hit["reason"]))
                    position = None

                    if balance <= 0:
                        break

            # ── Drawdown takibi ──
            if balance > peak_balance:
                peak_balance = balance
            dd = (peak_balance - balance) / peak_balance if peak_balance > 0 else 0
            if dd > max_drawdown:
                max_drawdown = dd

            # ── Strateji sinyali ──
            signal = self._get_signal(window) if (position is None or self.reverse_on_signal) else None

            # Reverse mod: zıt sinyal gelirse pozisyonu kapat
            if position and self.reverse_on_signal and signal:
                current_side = position["side"]
                opposite = (signal == "buy" and current_side == "sell") or \
                           (signal == "sell" and current_side == "buy")
                if opposite:
                    pnl = self._calc_pnl(position, c)
                    entry_fee = position.get("entry_fee", 0)
                    exit_fee = position["qty"] * c * self.fee_pct
                    net_pnl = pnl - entry_fee - exit_fee
                    balance += net_pnl
                    trades.append(self._make_trade(position, ts, c, net_pnl, entry_fee + exit_fee, "reverse"))
                    position = None

                    if balance <= 0:
                        break
                else:
                    signal = None

            # ── Pozisyon aç ──
            if position is None and signal and balance > 0:
                margin = balance * self.risk_per_trade if self.risk_per_trade <= 1.0 else self.risk_per_trade
                if margin > balance:
                    margin = balance
                position_value = margin * self.leverage
                qty = position_value / c if c > 0 else 0

                if qty > 0 and margin > 0:
                    entry_fee = position_value * self.fee_pct

                    # Cross margin likidasyon: tüm bakiyeye göre
                    liq_price = self._calc_cross_liq_price(c, qty, signal, balance)

                    if signal == "buy":
                        if self.reverse_on_signal:
                            sl = liq_price
                            tp = c * 1e9
                        else:
                            sl = c * (1 - self.stop_loss_pct)
                            tp = c * (1 + self.take_profit_pct)
                            # SL likidasyon fiyatının altına düşemez
                            if sl < liq_price:
                                sl = liq_price
                    else:
                        if self.reverse_on_signal:
                            sl = liq_price
                            tp = 0.0
                        else:
                            sl = c * (1 + self.stop_loss_pct)
                            tp = c * (1 - self.take_profit_pct)
                            if liq_price > 0 and sl > liq_price:
                                sl = liq_price

                    position = {
                        "side": signal,
                        "entry": c,
                        "qty": qty,
                        "margin": margin,
                        "sl": sl,
                        "tp": tp,
                        "liq_price": liq_price,
                        "entry_ts": ts,
                        "entry_fee": entry_fee,
                    }

            # Equity curve
            if i % 10 == 0:
                unrealized = 0.0
                if position:
                    unrealized = self._calc_pnl(position, c)
                equity_curve.append({
                    "time": ts // 1000,
                    "equity": round(balance + unrealized, 2),
                })

        # ── Son barda açık pozisyon varsa kapat ──
        if position:
            last_close = ohlcv[-1][4]
            pnl = self._calc_pnl(position, last_close)
            entry_fee = position.get("entry_fee", 0)
            exit_fee = position["qty"] * last_close * self.fee_pct
            net_pnl = pnl - entry_fee - exit_fee
            balance += net_pnl
            trades.append(self._make_trade(position, ohlcv[-1][0], last_close, net_pnl, entry_fee + exit_fee, "end_of_data"))

        return self._calc_metrics(trades, equity_curve, balance, max_drawdown)

    def _make_trade(self, pos: dict, exit_ts: int, exit_price: float, net_pnl: float, fee: float, reason: str) -> dict:
        """Trade kaydı oluştur."""
        return {
            "entry_ts": pos["entry_ts"],
            "exit_ts": exit_ts,
            "side": pos["side"],
            "entry": pos["entry"],
            "exit": exit_price,
            "qty": round(pos["qty"], 6),
            "margin": round(pos["margin"], 2),
            "position_value": round(pos["margin"] * self.leverage, 2),
            "leverage": self.leverage,
            "pnl": round(net_pnl, 2),
            "fee": round(fee, 4),
            "pnl_pct": round((net_pnl / pos["margin"]) * 100, 2) if pos["margin"] > 0 else 0,
            "exit_reason": reason,
        }

    def _get_signal(self, window: list) -> str | None:
        """Strateji bazlı sinyal üret."""
        p = self.params

        if self.strategy_name == "ema_cross":
            strat = EMACrossStrategy(
                fast=int(p.get("fast_ema", 9)),
                slow=int(p.get("slow_ema", 21)),
                volume_factor=float(p.get("min_volume", 1.2)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "rsi_oversold":
            strat = RSIOversoldStrategy(
                rsi_period=int(p.get("rsi_period", 14)),
                oversold=int(p.get("oversold", 30)),
                overbought=int(p.get("overbought", 70)),
                rsi_ema_filter=int(p.get("rsi_ema_filter", 200)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "macd_signal":
            strat = MACDSignalStrategy(
                fast=int(p.get("fast", 12)),
                slow=int(p.get("slow", 26)),
                signal=int(p.get("signal", 9)),
                hist_threshold=float(p.get("hist_threshold", 0)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "bollinger_bounce":
            strat = BollingerBounceStrategy(
                period=int(p.get("period", 20)),
                std_dev=float(p.get("std_dev", 2.0)),
                squeeze=bool(p.get("squeeze", True)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "ut_bot":
            strat = UTBotStrategy(
                atr_period=int(p.get("atr_period", 10)),
                atr_mult=float(p.get("atr_mult", 3.0)),
                heikin_ashi=bool(p.get("heikin_ashi", False)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "supertrend":
            strat = SupertrendStrategy(
                period=int(p.get("period", 10)),
                mult=float(p.get("mult", 3.0)),
            )
            return strat.calculate(window).get("signal")

        elif self.strategy_name == "bb_ema_cross":
            strat = BBEMACrossStrategy(
                bb_period=int(p.get("bb_period", 20)),
                bb_std=float(p.get("bb_std", 2.0)),
                ema_fast=int(p.get("ema_fast", 5)),
                ema_slow=int(p.get("ema_slow", 13)),
                touch_pct=float(p.get("touch_pct", 0.3)),
                setup_lookback=int(p.get("setup_lookback", 5)),
                direction=str(p.get("direction", "both")),
                exit_at_bands=bool(p.get("exit_at_bands", True)),
            )
            return strat.calculate(window).get("signal")

        # Fallback: indicators generate_signal
        ind = calculate_all(window)
        if ind:
            from ai.indicators import generate_signal
            return generate_signal(ind)
        return None

    def _check_liquidation_only(self, pos: dict, high: float, low: float) -> dict | None:
        """Reverse modda sadece likidasyon kontrolü (SL/TP yok)."""
        liq_price = pos.get("liq_price")
        if liq_price is None or liq_price <= 0:
            return None
        if pos["side"] == "buy" and low <= liq_price:
            return {"exit_price": liq_price, "reason": "liquidation"}
        if pos["side"] == "sell" and high >= liq_price:
            return {"exit_price": liq_price, "reason": "liquidation"}
        return None

    def _check_sl_tp(self, pos: dict, high: float, low: float) -> dict | None:
        """Bar içi SL/TP/Likidasyon kontrolü."""
        liq_price = pos.get("liq_price")
        sl_is_liq = liq_price is not None and liq_price > 0 and abs(pos["sl"] - liq_price) < 1e-9

        if pos["side"] == "buy":
            # Önce likidasyon kontrolü (SL'den önce tetiklenir)
            if liq_price and liq_price > 0 and low <= liq_price:
                return {"exit_price": liq_price, "reason": "liquidation"}
            if low <= pos["sl"]:
                return {"exit_price": pos["sl"], "reason": "stop_loss"}
            if high >= pos["tp"]:
                return {"exit_price": pos["tp"], "reason": "take_profit"}
        else:
            if liq_price and liq_price > 0 and high >= liq_price:
                return {"exit_price": liq_price, "reason": "liquidation"}
            if high >= pos["sl"]:
                return {"exit_price": pos["sl"], "reason": "stop_loss"}
            if low <= pos["tp"]:
                return {"exit_price": pos["tp"], "reason": "take_profit"}
        return None

    def _calc_pnl(self, pos: dict, exit_price: float) -> float:
        """Pozisyon PnL hesapla (fee hariç, brüt)."""
        if pos["side"] == "buy":
            return pos["qty"] * (exit_price - pos["entry"])
        else:
            return pos["qty"] * (pos["entry"] - exit_price)

    def _calc_metrics(self, trades: list, equity_curve: list, final_balance: float, max_drawdown: float) -> dict:
        """Backtest metriklerini hesapla."""
        if not trades:
            return {
                "total_trades": 0,
                "final_balance": round(final_balance, 2),
                "total_pnl": 0,
                "total_pnl_pct": 0,
                "total_fees": 0,
                "win_rate": 0,
                "max_drawdown_pct": 0,
                "sharpe_ratio": 0,
                "profit_factor": 0,
                "avg_trade_pnl": 0,
                "best_trade": 0,
                "worst_trade": 0,
                "avg_win": 0,
                "avg_loss": 0,
                "trades": [],
                "equity_curve": equity_curve,
            }

        pnls = [t["pnl"] for t in trades]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]

        total_pnl = sum(pnls)
        win_rate = len(wins) / len(pnls) * 100 if pnls else 0

        sharpe = 0.0
        if len(equity_curve) > 2:
            equity_vals = np.array([p["equity"] for p in equity_curve])
            returns = np.diff(equity_vals) / equity_vals[:-1]
            if len(returns) > 1 and returns.std() > 0:
                tf_hours = {"1m": 1/60, "5m": 5/60, "15m": 0.25, "30m": 0.5, "1h": 1, "4h": 4, "1d": 24}
                hpc = tf_hours.get(self.timeframe, 1)
                periods_per_year = (365 * 24) / (hpc * 10)
                sharpe = float(returns.mean() / returns.std()) * np.sqrt(periods_per_year)

        gross_profit = sum(wins) if wins else 0
        gross_loss = abs(sum(losses)) if losses else 1e-10
        profit_factor = gross_profit / gross_loss

        durations = []
        for t in trades:
            if t.get("entry_ts") and t.get("exit_ts"):
                dur_hours = (t["exit_ts"] - t["entry_ts"]) / (1000 * 3600)
                durations.append(dur_hours)

        return {
            "total_trades": len(trades),
            "final_balance": round(final_balance, 2),
            "total_pnl": round(total_pnl, 2),
            "total_fees": round(sum(t.get("fee", 0) for t in trades), 2),
            "total_pnl_pct": round((total_pnl / self.initial_balance) * 100, 2),
            "win_rate": round(win_rate, 1),
            "max_drawdown_pct": round(max_drawdown * 100, 2),
            "sharpe_ratio": round(float(sharpe), 2),
            "profit_factor": round(profit_factor, 2),
            "avg_trade_pnl": round(np.mean(pnls), 2) if pnls else 0,
            "best_trade": round(max(pnls), 2) if pnls else 0,
            "worst_trade": round(min(pnls), 2) if pnls else 0,
            "avg_win": round(np.mean(wins), 2) if wins else 0,
            "avg_loss": round(np.mean(losses), 2) if losses else 0,
            "win_count": len(wins),
            "loss_count": len(losses),
            "avg_duration_hours": round(np.mean(durations), 1) if durations else 0,
            "trades": trades,
            "equity_curve": equity_curve,
        }
