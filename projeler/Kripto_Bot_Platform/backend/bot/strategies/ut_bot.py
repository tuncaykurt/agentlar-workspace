"""
UT Bot Alert Stratejisi (ATR Trailing Stop)
- ATR tabanlı dinamik trailing stop çizgisi hesaplar
- Fiyat stopu yukarı keser → LONG
- Fiyat stopu aşağı keser → SHORT
- Opsiyonel Heikin Ashi mumları ile daha düzgün sinyal
"""
import pandas as pd
import numpy as np


class UTBotStrategy:
    def __init__(
        self,
        atr_period: int = 10,
        atr_mult: float = 3.0,
        heikin_ashi: bool = False,
    ):
        self.atr_period = atr_period
        self.atr_mult = atr_mult
        self.heikin_ashi = heikin_ashi

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.atr_period + 10:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        # Heikin Ashi dönüşümü
        if self.heikin_ashi:
            ha_close = (df["open"] + df["high"] + df["low"] + df["close"]) / 4
            ha_open = df["open"].copy()
            for i in range(1, len(df)):
                ha_open.iloc[i] = (ha_open.iloc[i - 1] + ha_close.iloc[i - 1]) / 2
            df["close"] = ha_close
            df["open"] = ha_open
            df["high"] = df[["high", "open", "close"]].max(axis=1)
            df["low"] = df[["low", "open", "close"]].min(axis=1)

        # ATR hesapla
        prev_close = df["close"].shift(1)
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ], axis=1).max(axis=1)
        atr = tr.ewm(span=self.atr_period, adjust=False).mean()

        # ATR trailing stop hesapla
        n_loss = self.atr_mult * atr
        trail_stop = [0.0] * len(df)

        for i in range(1, len(df)):
            if pd.isna(n_loss.iloc[i]):
                continue

            close_i = df["close"].iloc[i]
            close_prev = df["close"].iloc[i - 1]
            prev_stop = trail_stop[i - 1]

            if close_i > prev_stop and close_prev > prev_stop:
                trail_stop[i] = max(prev_stop, close_i - n_loss.iloc[i])
            elif close_i < prev_stop and close_prev < prev_stop:
                trail_stop[i] = min(prev_stop, close_i + n_loss.iloc[i])
            elif close_i > prev_stop:
                trail_stop[i] = close_i - n_loss.iloc[i]
            else:
                trail_stop[i] = close_i + n_loss.iloc[i]

        df["trail_stop"] = trail_stop

        curr_close = df["close"].iloc[-1]
        prev_close_val = df["close"].iloc[-2]
        curr_stop = trail_stop[-1]
        prev_stop = trail_stop[-2]

        signal = None
        # Fiyat stopu yukarı keser → LONG
        if prev_close_val <= prev_stop and curr_close > curr_stop:
            signal = "buy"
        # Fiyat stopu aşağı keser → SHORT
        elif prev_close_val >= prev_stop and curr_close < curr_stop:
            signal = "sell"

        return {
            "signal": signal,
            "trail_stop": round(float(curr_stop), 2),
            "atr": round(float(atr.iloc[-1]), 2),
            "close": float(curr_close),
            "heikin_ashi": self.heikin_ashi,
        }
