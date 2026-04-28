"""
Supertrend Stratejisi
- ATR tabanlı dinamik trend çizgisi
- Supertrend yeşile döner (direction 1→-1 değişir) → LONG
- Supertrend kırmızıya döner (direction -1→1 değişir) → SHORT
"""
import pandas as pd


class SupertrendStrategy:
    def __init__(self, period: int = 10, mult: float = 3.0):
        self.period = period
        self.mult = mult

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.period + 10:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        # ATR
        prev_close = df["close"].shift(1)
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ], axis=1).max(axis=1)
        atr = tr.ewm(span=self.period, adjust=False).mean()

        hl2 = (df["high"] + df["low"]) / 2
        upper_band = hl2 + self.mult * atr
        lower_band = hl2 - self.mult * atr

        supertrend = [0.0] * len(df)
        direction = [1] * len(df)  # 1 = bullish (yeşil), -1 = bearish (kırmızı)

        for i in range(1, len(df)):
            if pd.isna(upper_band.iloc[i]):
                continue

            # Final bands — önceki değerlerle karşılaştırarak sıkıştır
            if direction[i - 1] == 1:
                lower_band.iloc[i] = max(lower_band.iloc[i], lower_band.iloc[i - 1])
            else:
                upper_band.iloc[i] = min(upper_band.iloc[i], upper_band.iloc[i - 1])

            # Direction belirleme
            if direction[i - 1] == 1:
                if df["close"].iloc[i] < lower_band.iloc[i]:
                    direction[i] = -1
                    supertrend[i] = upper_band.iloc[i]
                else:
                    direction[i] = 1
                    supertrend[i] = lower_band.iloc[i]
            else:
                if df["close"].iloc[i] > upper_band.iloc[i]:
                    direction[i] = 1
                    supertrend[i] = lower_band.iloc[i]
                else:
                    direction[i] = -1
                    supertrend[i] = upper_band.iloc[i]

        signal = None
        # Kırmızıdan yeşile → LONG
        if direction[-2] == -1 and direction[-1] == 1:
            signal = "buy"
        # Yeşilden kırmızıya → SHORT
        elif direction[-2] == 1 and direction[-1] == -1:
            signal = "sell"

        return {
            "signal": signal,
            "supertrend": round(float(supertrend[-1]), 2),
            "direction": direction[-1],
            "prev_direction": direction[-2],
            "close": float(df["close"].iloc[-1]),
        }
