"""
EMA Crossover Stratejisi
- Sinyal: Hızlı EMA yavaş EMA'yı yukarı keser → LONG
- Sinyal: Hızlı EMA yavaş EMA'yı aşağı keser → SHORT
- Filtre: Hacim ortalamanın üzerinde olmalı
- ADX filtresi: Zayıf trendlerde (ADX<20) sinyal vermez
"""
import pandas as pd


class EMACrossStrategy:
    def __init__(self, fast: int = 9, slow: int = 21, volume_factor: float = 1.2, min_adx: float = 20.0):
        self.fast = fast
        self.slow = slow
        self.volume_factor = volume_factor
        self.min_adx = min_adx

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.slow + 5:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ema_fast"] = df["close"].ewm(span=self.fast, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=self.slow, adjust=False).mean()
        df["vol_avg"] = df["volume"].rolling(20).mean()

        # ── ADX hesaplama (trend gücü filtresi) ──
        prev_close = df["close"].shift(1)
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ], axis=1).max(axis=1)

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

        # ADX filtresi: Zayıf trendlerde sinyal verme
        if signal and current_adx < self.min_adx:
            signal = None

        return {
            "signal": signal,
            "ema_fast": round(curr["ema_fast"], 4),
            "ema_slow": round(curr["ema_slow"], 4),
            "close": curr["close"],
            "volume": curr["volume"],
            "volume_ok": volume_ok,
            "adx": round(current_adx, 1),
        }
