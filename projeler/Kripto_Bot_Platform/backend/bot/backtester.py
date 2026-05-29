"""
Backtest Motoru
═══════════════
Geçmiş OHLCV verisi üzerinde strateji simülasyonu.
- DB'den veri çeker (DataFetcher)
- Seçilen stratejiyi bar bar çalıştırır
- Paper trade simülasyonu: giriş, çıkış, SL/TP
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
        self.fee_pct = float(config.get("fee_pct", 0.06)) / 100  # maker+taker avg
        self.lookback = int(config.get("lookback", 200))  # strateji hesabı için gereken bar
        self.timeframe = config.get("timeframe", "1h")
        # Reverse modu: SL/TP yok, her yeni sinyalde pozisyonu ters çevir
        self.reverse_on_signal = bool(config.get("reverse_on_signal", False))

    def run(self, ohlcv: list) -> dict:
        """
        ohlcv: [[ts, o, h, l, c, v], ...]
        Tüm veri üzerinde bar bar strateji çalıştırır.
        """
        if len(ohlcv) < self.lookback + 10:
            return {"error": "Yetersiz veri", "candle_count": len(ohlcv)}

        balance = self.initial_balance
        peak_balance = balance
        trades: list[dict] = []
        equity_curve: list[dict] = []
        position = None  # {"side", "entry", "qty", "sl", "tp", "entry_ts"}
        max_drawdown = 0.0

        for i in range(self.lookback, len(ohlcv)):
            window = ohlcv[i - self.lookback: i + 1]
            bar = ohlcv[i]
            ts, o, h, l, c, v = bar[0], bar[1], bar[2], bar[3], bar[4], bar[5]

            # ── Açık pozisyon varsa SL/TP/Likidasyon kontrolü ──
            # Reverse modda SL/TP yok; yalnız likidasyon kontrol edilir.
            if position:
                if self.reverse_on_signal:
                    hit = self._check_liquidation_only(position, h, l)
                else:
                    hit = self._check_sl_tp(position, h, l)

                if hit:
                    pnl = self._calc_pnl(position, hit["exit_price"])
                    exit_fee = position["qty"] * hit["exit_price"] * self.fee_pct
                    entry_fee = position.get("entry_fee", 0)
                    net_pnl = pnl - exit_fee - entry_fee
                    # Likidasyon güvenliği: margin'den fazla kaybedemezsin
                    if net_pnl < -position["margin"]:
                        net_pnl = -position["margin"]
                    balance += net_pnl

                    trades.append({
                        "entry_ts": position["entry_ts"],
                        "exit_ts": ts,
                        "side": position["side"],
                        "entry": position["entry"],
                        "exit": hit["exit_price"],
                        "qty": round(position["qty"], 6),
                        "margin": round(position["margin"], 2),
                        "position_value": round(position["margin"] * self.leverage, 2),
                        "leverage": self.leverage,
                        "pnl": round(net_pnl, 2),
                        "fee": exit_fee + entry_fee,
                        "pnl_pct": round((net_pnl / position["margin"]) * 100, 2) if position["margin"] > 0 else 0,
                        "exit_reason": hit["reason"],
                    })
                    position = None

            # ── Drawdown takibi ──
            if balance > peak_balance:
                peak_balance = balance
            dd = (peak_balance - balance) / peak_balance
            if dd > max_drawdown:
                max_drawdown = dd

            # ── Strateji sinyali ──
            signal = self._get_signal(window) if (position is None or self.reverse_on_signal) else None

            # Reverse mod: açık pozisyon varsa ve zıt yönde sinyal geldiyse kapat
            if position and self.reverse_on_signal and signal:
                current_side = position["side"]
                opposite = (signal == "buy" and current_side == "sell") or \
                           (signal == "sell" and current_side == "buy")
                if opposite:
                    pnl = self._calc_pnl(position, c)
                    exit_fee = position["qty"] * c * self.fee_pct
                    entry_fee = position.get("entry_fee", 0)
                    net_pnl = pnl - exit_fee - entry_fee
                    if net_pnl < -position["margin"]:
                        net_pnl = -position["margin"]
                    balance += net_pnl
                    trades.append({
                        "entry_ts": position["entry_ts"],
                        "exit_ts": ts,
                        "side": position["side"],
                        "entry": position["entry"],
                        "exit": c,
                        "qty": round(position["qty"], 6),
                        "margin": round(position["margin"], 2),
                        "position_value": round(position["margin"] * self.leverage, 2),
                        "leverage": self.leverage,
                        "pnl": round(net_pnl, 2),
                        "fee": exit_fee + entry_fee,
                        "pnl_pct": round((net_pnl / position["margin"]) * 100, 2) if position["margin"] > 0 else 0,
                        "exit_reason": "reverse",
                    })
                    position = None
                else:
                    signal = None  # aynı yön sinyali → mevcut pozisyonu bırak

            # Pozisyon aç (reverse modda kapanan pozisyonun ardından da buraya düşer)
            if position is None and signal:
                # Gerçek vadeli model:
                #   margin = kasadan ayrılan sermaye (risk_per_trade × balance)
                #   position_value = margin × leverage (borsada açılan pozisyon büyüklüğü)
                #   qty = position_value / fiyat
                # PnL = qty × fiyat_farkı = position_value × fiyat_hareketi_yüzdesi
                margin = balance * self.risk_per_trade
                position_value = margin * self.leverage
                qty = position_value / c if c > 0 else 0

                if qty > 0 and margin > 0:
                    entry_fee = position_value * self.fee_pct
                    # Likidasyon fiyatı (basitleştirilmiş, maintenance margin ihmal)
                    liq_pct = 0.95 / self.leverage
                    if signal == "buy":
                        liq_price = c * (1 - liq_pct)
                        # Reverse modda SL/TP yok — çok uzağa yerleştir, pratik olarak tetiklenmez
                        if self.reverse_on_signal:
                            sl = liq_price  # likidasyon dışında SL yok
                            tp = c * 1e9
                        else:
                            sl = c * (1 - self.stop_loss_pct)
                            tp = c * (1 + self.take_profit_pct)
                            if sl < liq_price:
                                sl = liq_price
                    else:
                        liq_price = c * (1 + liq_pct)
                        if self.reverse_on_signal:
                            sl = liq_price
                            tp = 0.0
                        else:
                            sl = c * (1 + self.stop_loss_pct)
                            tp = c * (1 - self.take_profit_pct)
                            if sl > liq_price:
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

            # Equity curve (her 10 barda bir kaydet — performans)
            if i % 10 == 0:
                unrealized = 0.0
                if position:
                    unrealized = self._calc_pnl(position, c)
                    # Likidasyon sonrası unrealized margin'den fazla negatif olamaz
                    if unrealized < -position["margin"]:
                        unrealized = -position["margin"]
                equity_curve.append({
                    "time": ts // 1000,
                    "equity": round(balance + unrealized, 2),
                })

        # ── Açık pozisyon kaldıysa son bardan kapat ──
        if position:
            last_close = ohlcv[-1][4]
            pnl = self._calc_pnl(position, last_close)
            exit_fee = position["qty"] * last_close * self.fee_pct
            entry_fee = position.get("entry_fee", 0)
            net_pnl = pnl - exit_fee - entry_fee
            if net_pnl < -position["margin"]:
                net_pnl = -position["margin"]
            balance += net_pnl
            trades.append({
                "entry_ts": position["entry_ts"],
                "exit_ts": ohlcv[-1][0],
                "side": position["side"],
                "entry": position["entry"],
                "exit": last_close,
                "qty": round(position["qty"], 6),
                "margin": round(position["margin"], 2),
                "position_value": round(position["margin"] * self.leverage, 2),
                "leverage": self.leverage,
                "pnl": round(net_pnl, 2),
                "fee": exit_fee + entry_fee,
                "pnl_pct": round((net_pnl / position["margin"]) * 100, 2) if position["margin"] > 0 else 0,
                "exit_reason": "end_of_data",
            })

        return self._calc_metrics(trades, equity_curve, balance, max_drawdown)

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

    def _check_sl_tp(self, pos: dict, high: float, low: float) -> dict | None:
        """Bar içi SL/TP/Likidasyon kontrolü."""
        liq_price = pos.get("liq_price")
        # SL fiyatı likidasyona eşitse, SL reason "liquidation" olsun
        sl_is_liq = liq_price is not None and abs(pos["sl"] - liq_price) < 1e-9

        if pos["side"] == "buy":
            if low <= pos["sl"]:
                return {
                    "exit_price": pos["sl"],
                    "reason": "liquidation" if sl_is_liq else "stop_loss",
                }
            if high >= pos["tp"]:
                return {"exit_price": pos["tp"], "reason": "take_profit"}
        else:  # sell/short
            if high >= pos["sl"]:
                return {
                    "exit_price": pos["sl"],
                    "reason": "liquidation" if sl_is_liq else "stop_loss",
                }
            if low <= pos["tp"]:
                return {"exit_price": pos["tp"], "reason": "take_profit"}
        return None

    def _calc_pnl(self, pos: dict, exit_price: float) -> float:
        """Pozisyon PnL hesapla."""
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

        # ── Sharpe Ratio: günlük getiri bazlı (equity_curve üzerinden) ──
        # Per-trade PnL'i sqrt(252) ile çarpmak yanlış — çok şişiriyordu.
        # Doğru yol: equity curve'den günlük return çıkar, yıllıklaştır.
        sharpe = 0.0
        if len(equity_curve) > 2:
            equity_vals = np.array([p["equity"] for p in equity_curve])
            returns = np.diff(equity_vals) / equity_vals[:-1]
            if len(returns) > 1 and returns.std() > 0:
                # equity_curve her 10 barda bir kayıt. Bar → gün çevrimi:
                tf_hours = {"1m": 1/60, "5m": 5/60, "15m": 0.25, "30m": 0.5, "1h": 1, "4h": 4, "1d": 24}
                hpc = tf_hours.get(self.timeframe, 1)
                periods_per_year = (365 * 24) / (hpc * 10)  # 10 bar aralıkla örnekleniyor
                sharpe = float(returns.mean() / returns.std()) * np.sqrt(periods_per_year)

        # Profit Factor
        gross_profit = sum(wins) if wins else 0
        gross_loss = abs(sum(losses)) if losses else 1e-10
        profit_factor = gross_profit / gross_loss

        # Ortalama trade süreleri
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
            "trades": trades,  # Tüm trade'ler (grafik marker için)
            "equity_curve": equity_curve,
        }
