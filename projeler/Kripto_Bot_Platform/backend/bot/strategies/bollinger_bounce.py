"""
Bollinger Band Bounce Stratejisi
- Fiyat alt banda dokunup geri dönerse → LONG
- Fiyat üst banda dokunup geri dönerse → SHORT
- Opsiyonel squeeze filtresi: bantlar önce daralmalı sonra açılmalı
"""
import pandas as pd


class BollingerBounceStrategy:
    def __init__(
        self,
        period: int = 20,
        std_dev: float = 2.0,
        squeeze: bool = True,
    ):
        self.period = period
        self.std_dev = std_dev
        self.squeeze = squeeze

    def calculate(self, ohlcv: list) -> dict:
        if len(ohlcv) < self.period + 10:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        sma = df["close"].rolling(self.period).mean()
        std = df["close"].rolling(self.period).std()
        df["bb_upper"] = sma + (std * self.std_dev)
        df["bb_lower"] = sma - (std * self.std_dev)
        df["bb_mid"] = sma
        df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / df["bb_mid"]

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        # Squeeze filtresi: son 5 barda bant genişliği artmış olmalı (daralma sonrası açılma)
        squeeze_ok = True
        if self.squeeze:
            recent_widths = df["bb_width"].iloc[-5:]
            if len(recent_widths) >= 5:
                squeeze_ok = float(recent_widths.iloc[-1]) > float(recent_widths.iloc[0])

        signal = None

        # Alt banda dokunup geri döndü → LONG
        if prev["close"] <= prev["bb_lower"] and curr["close"] > curr["bb_lower"]:
            if squeeze_ok:
                signal = "buy"

        # Üst banda dokunup geri döndü → SHORT
        elif prev["close"] >= prev["bb_upper"] and curr["close"] < curr["bb_upper"]:
            if squeeze_ok:
                signal = "sell"

        return {
            "signal": signal,
            "bb_upper": round(float(curr["bb_upper"]), 2),
            "bb_lower": round(float(curr["bb_lower"]), 2),
            "bb_mid": round(float(curr["bb_mid"]), 2),
            "bb_width": round(float(curr["bb_width"]), 4),
            "squeeze_ok": squeeze_ok,
            "close": float(curr["close"]),
        }
