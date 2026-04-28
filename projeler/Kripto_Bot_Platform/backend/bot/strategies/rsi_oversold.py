"""
RSI Aşırı Alım / Aşırı Satım Stratejisi
- RSI oversold bölgeden çıkış → LONG
- RSI overbought bölgeden çıkış → SHORT
- Opsiyonel EMA trend filtresi
"""
import pandas as pd


class RSIOversoldStrategy:
    def __init__(
        self,
        rsi_period: int = 14,
        oversold: int = 30,
        overbought: int = 70,
        rsi_ema_filter: int = 200,
    ):
        self.rsi_period = rsi_period
        self.oversold = oversold
        self.overbought = overbought
        self.ema_filter = rsi_ema_filter

    def calculate(self, ohlcv: list) -> dict:
        need = max(self.rsi_period + 5, self.ema_filter + 5) if self.ema_filter > 0 else self.rsi_period + 5
        if len(ohlcv) < need:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        # RSI hesapla
        delta = df["close"].diff()
        gain = delta.clip(lower=0).rolling(self.rsi_period).mean()
        loss = (-delta.clip(upper=0)).rolling(self.rsi_period).mean()
        rs = gain / loss.replace(0, 1e-10)
        df["rsi"] = 100 - (100 / (1 + rs))

        # EMA trend filtresi
        ema_ok_long = True
        ema_ok_short = True
        if self.ema_filter > 0 and len(df) >= self.ema_filter:
            df["ema_filter"] = df["close"].ewm(span=self.ema_filter, adjust=False).mean()
            ema_ok_long = df["close"].iloc[-1] > df["ema_filter"].iloc[-1]
            ema_ok_short = df["close"].iloc[-1] < df["ema_filter"].iloc[-1]

        prev_rsi = df["rsi"].iloc[-2]
        curr_rsi = df["rsi"].iloc[-1]

        signal = None
        # Oversold'dan çıkış → LONG
        if prev_rsi < self.oversold and curr_rsi >= self.oversold and ema_ok_long:
            signal = "buy"
        # Overbought'tan çıkış → SHORT
        elif prev_rsi > self.overbought and curr_rsi <= self.overbought and ema_ok_short:
            signal = "sell"

        return {
            "signal": signal,
            "rsi": round(float(curr_rsi), 2),
            "prev_rsi": round(float(prev_rsi), 2),
            "oversold": self.oversold,
            "overbought": self.overbought,
            "close": float(df["close"].iloc[-1]),
        }
