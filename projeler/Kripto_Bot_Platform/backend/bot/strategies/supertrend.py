"""
Supertrend Stratejisi
- ATR tabanlı dinamik trend çizgisi
- Supertrend yeşile döner (direction 1→-1 değişir) → LONG
- Supertrend kırmızıya döner (direction -1→1 değişir) → SHORT
- ADX filtresi: Zayıf trendlerde (ADX<20) sinyal vermez
"""
import pandas as pd


class SupertrendStrategy:
    def __init__(self, period: int = 10, mult: float = 3.0, min_adx: float = 20.0):
        self.period = period
        self.mult = mult
        self.min_adx = min_adx

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

        # ── ADX hesaplama (trend gücü filtresi) ──
        plus_dm = df["high"].diff()
        minus_dm = -df["low"].diff()
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

        atr_smooth = tr.ewm(span=14, adjust=False).mean()
        plus_di = 100 * (plus_dm.ewm(span=14, adjust=False).mean() / atr_smooth)
        minus_di = 100 * (minus_dm.ewm(span=14, adjust=False).mean() / atr_smooth)
        dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10))
        adx = dx.ewm(span=14, adjust=False).mean()
        current_adx = float(adx.iloc[-1]) if not pd.isna(adx.iloc[-1]) else 0

        signal = None
        # Kırmızıdan yeşile → LONG
        if direction[-2] == -1 and direction[-1] == 1:
            signal = "buy"
        # Yeşilden kırmızıya → SHORT
        elif direction[-2] == 1 and direction[-1] == -1:
            signal = "sell"

        # ADX filtresi: Zayıf trendlerde sinyal verme
        if signal and current_adx < self.min_adx:
            signal = None

        return {
            "signal": signal,
            "supertrend": round(float(supertrend[-1]), 2),
            "direction": direction[-1],
            "prev_direction": direction[-2],
            "close": float(df["close"].iloc[-1]),
            "adx": round(current_adx, 1),
        }
