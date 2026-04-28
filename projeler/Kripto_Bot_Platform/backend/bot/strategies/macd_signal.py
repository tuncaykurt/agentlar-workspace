"""
MACD Sinyal Stratejisi
- MACD hattı sinyal hattını yukarı keser → LONG
- MACD hattı sinyal hattını aşağı keser → SHORT
- Opsiyonel histogram eşiği filtresi
"""
import pandas as pd


class MACDSignalStrategy:
    def __init__(
        self,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
        hist_threshold: float = 0,
    ):
        self.fast = fast
        self.slow = slow
        self.signal_period = signal
        self.hist_threshold = hist_threshold

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.slow + self.signal_period + 5:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        ema_fast = df["close"].ewm(span=self.fast, adjust=False).mean()
        ema_slow = df["close"].ewm(span=self.slow, adjust=False).mean()
        df["macd"] = ema_fast - ema_slow
        df["macd_signal"] = df["macd"].ewm(span=self.signal_period, adjust=False).mean()
        df["histogram"] = df["macd"] - df["macd_signal"]

        prev = df.iloc[-2]
        curr = df.iloc[-1]

        signal = None
        hist_ok = abs(float(curr["histogram"])) > self.hist_threshold

        # MACD sinyal hattını yukarı keser → LONG
        if prev["macd"] <= prev["macd_signal"] and curr["macd"] > curr["macd_signal"]:
            if hist_ok:
                signal = "buy"
        # MACD sinyal hattını aşağı keser → SHORT
        elif prev["macd"] >= prev["macd_signal"] and curr["macd"] < curr["macd_signal"]:
            if hist_ok:
                signal = "sell"

        return {
            "signal": signal,
            "macd": round(float(curr["macd"]), 6),
            "macd_signal": round(float(curr["macd_signal"]), 6),
            "histogram": round(float(curr["histogram"]), 6),
            "close": float(curr["close"]),
        }
