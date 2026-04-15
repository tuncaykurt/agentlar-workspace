"""
EMA Crossover Stratejisi
- Sinyal: Hızlı EMA yavaş EMA'yı yukarı keser → LONG
- Sinyal: Hızlı EMA yavaş EMA'yı aşağı keser → SHORT
- Filtre: Hacim ortalamanın üzerinde olmalı
"""
import pandas as pd


class EMACrossStrategy:
    def __init__(self, fast: int = 9, slow: int = 21, volume_factor: float = 1.2):
        self.fast = fast
        self.slow = slow
        self.volume_factor = volume_factor

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.slow + 5:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ema_fast"] = df["close"].ewm(span=self.fast, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=self.slow, adjust=False).mean()
        df["vol_avg"] = df["volume"].rolling(20).mean()

        prev = df.iloc[-2]
        curr = df.iloc[-1]

        volume_ok = curr["volume"] > curr["vol_avg"] * self.volume_factor

        signal = None
        if prev["ema_fast"] <= prev["ema_slow"] and curr["ema_fast"] > curr["ema_slow"]:
            if volume_ok:
                signal = "buy"
        elif prev["ema_fast"] >= prev["ema_slow"] and curr["ema_fast"] < curr["ema_slow"]:
            if volume_ok:
                signal = "sell"

        return {
            "signal": signal,
            "ema_fast": round(curr["ema_fast"], 4),
            "ema_slow": round(curr["ema_slow"], 4),
            "close": curr["close"],
            "volume": curr["volume"],
            "volume_ok": volume_ok,
        }
