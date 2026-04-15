"""
Teknik İndikatör Hesaplayıcı
Çoklu indikatör ile güçlü sinyal üretimi.
"""
import pandas as pd
import math


def calculate_all(ohlcv: list) -> dict:
    """
    OHLCV verisinden tüm indikatörleri hesapla.
    """
    if len(ohlcv) < 55:
        return {}

    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    # EMA'lar
    df["ema9"]  = df["close"].ewm(span=9,  adjust=False).mean()
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema55"] = df["close"].ewm(span=55, adjust=False).mean()

    # RSI
    delta = df["close"].diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, 1e-10)
    df["rsi"] = 100 - (100 / (1 + rs))

    # MACD
    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]        = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # Bollinger Bands
    sma20         = df["close"].rolling(20).mean()
    std20         = df["close"].rolling(20).std()
    df["bb_upper"] = sma20 + (std20 * 2)
    df["bb_lower"] = sma20 - (std20 * 2)
    df["bb_mid"]   = sma20

    # ATR
    prev_close = df["close"].shift(1)
    df["tr"] = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"]  - prev_close).abs(),
    ], axis=1).max(axis=1)
    df["atr"] = df["tr"].ewm(span=14, adjust=False).mean()

    # Volume
    df["vol_avg"] = df["volume"].rolling(20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]

    curr = df.iloc[-1]
    prev = df.iloc[-2]

    return {
        "ema9":         round(float(curr["ema9"]),  2),
        "ema21":        round(float(curr["ema21"]), 2),
        "ema55":        round(float(curr["ema55"]), 2),
        "rsi":          round(float(curr["rsi"]),   2),
        "macd":         round(float(curr["macd"]),  6),
        "macd_signal":  round(float(curr["macd_signal"]), 6),
        "macd_hist":    round(float(curr["macd_hist"]),   6),
        "bb_upper":     round(float(curr["bb_upper"]), 2),
        "bb_lower":     round(float(curr["bb_lower"]), 2),
        "bb_mid":       round(float(curr["bb_mid"]),   2),
        "atr":          round(float(curr["atr"]),  2),
        "vol_ratio":    round(float(curr["vol_ratio"]), 2),
        "prev_ema9":    round(float(prev["ema9"]),  2),
        "prev_ema21":   round(float(prev["ema21"]), 2),
        "prev_macd_hist": round(float(prev["macd_hist"]), 6),
        "close":        float(curr["close"]),
    }


def generate_signal(ind: dict) -> str | None:
    """
    Çoklu indikatör konfirmasyonu ile sinyal üret.
    Tüm koşullar sağlanmalı — tek indikatör yetmez.
    """
    if not ind:
        return None

    close    = ind["close"]
    ema9     = ind["ema9"]
    ema21    = ind["ema21"]
    rsi      = ind["rsi"]
    macd_h   = ind["macd_hist"]
    prev_mh  = ind["prev_macd_hist"]
    bb_upper = ind["bb_upper"]
    bb_lower = ind["bb_lower"]
    vol      = ind["vol_ratio"]

    # LONG koşulları (hepsi sağlanmalı)
    long_conditions = [
        ema9 > ema21,                          # EMA trend yukarı
        ind["prev_ema9"] <= ind["prev_ema21"], # EMA yeni crossover
        rsi > 40 and rsi < 70,                 # RSI aşırı bölgede değil
        macd_h > 0 or macd_h > prev_mh,       # MACD pozitif veya artıyor
        close > ind["bb_mid"],                 # Fiyat BB ortasının üstünde
        vol > 1.2,                             # Hacim ortalamanın üstünde
    ]

    # SHORT koşulları
    short_conditions = [
        ema9 < ema21,
        ind["prev_ema9"] >= ind["prev_ema21"],
        rsi > 30 and rsi < 60,
        macd_h < 0 or macd_h < prev_mh,
        close < ind["bb_mid"],
        vol > 1.2,
    ]

    long_score  = sum(long_conditions)
    short_score = sum(short_conditions)

    if long_score >= 4:
        return "buy"
    if short_score >= 4:
        return "sell"
    return None


def volume_change_pct(ohlcv: list) -> float:
    if len(ohlcv) < 2:
        return 0
    curr_vol = ohlcv[-1][5]
    prev_vol = ohlcv[-60][5] if len(ohlcv) >= 60 else ohlcv[0][5]
    if prev_vol == 0:
        return 0
    return ((curr_vol - prev_vol) / prev_vol) * 100
