"""
Teknik İndikatör Hesaplayıcı — Saf Pandas ile 20+ İndikatör
════════════════════════════════════════════════════════════
Harici kütüphane gerektirmez. Tüm hesaplamalar saf pandas + math.
"""
import pandas as pd
import numpy as np
import math


def calculate_all(ohlcv: list) -> dict:
    """OHLCV verisinden tüm indikatörleri hesapla."""
    if len(ohlcv) < 55:
        return {}

    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    # ── EMA'lar ──────────────────────────────────────────────────────────────
    df["ema9"]  = df["close"].ewm(span=9,  adjust=False).mean()
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema55"] = df["close"].ewm(span=55, adjust=False).mean()
    if len(df) >= 200:
        df["ema200"] = df["close"].ewm(span=200, adjust=False).mean()

    # ── RSI ──────────────────────────────────────────────────────────────────
    delta = df["close"].diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, 1e-10)
    df["rsi"] = 100 - (100 / (1 + rs))

    # ── MACD ─────────────────────────────────────────────────────────────────
    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"]        = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # ── Bollinger Bands ──────────────────────────────────────────────────────
    sma20         = df["close"].rolling(20).mean()
    std20         = df["close"].rolling(20).std()
    df["bb_upper"] = sma20 + (std20 * 2)
    df["bb_lower"] = sma20 - (std20 * 2)
    df["bb_mid"]   = sma20

    # ── ATR ──────────────────────────────────────────────────────────────────
    prev_close = df["close"].shift(1)
    df["tr"] = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"]  - prev_close).abs(),
    ], axis=1).max(axis=1)
    df["atr"] = df["tr"].ewm(span=14, adjust=False).mean()

    # ── Volume ───────────────────────────────────────────────────────────────
    df["vol_avg"] = df["volume"].rolling(20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]

    # ── ADX (Average Directional Index) ──────────────────────────────────────
    _calc_adx(df, 14)

    # ── Stochastic ───────────────────────────────────────────────────────────
    _calc_stochastic(df, 14, 3)

    # ── CCI (Commodity Channel Index) ────────────────────────────────────────
    _calc_cci(df, 20)

    # ── Williams %R ──────────────────────────────────────────────────────────
    _calc_williams_r(df, 14)

    # ── OBV (On Balance Volume) ──────────────────────────────────────────────
    _calc_obv(df)

    # ── CMF (Chaikin Money Flow) ─────────────────────────────────────────────
    _calc_cmf(df, 20)

    # ── MFI (Money Flow Index) ───────────────────────────────────────────────
    _calc_mfi(df, 14)

    # ── Supertrend ───────────────────────────────────────────────────────────
    _calc_supertrend(df, 10, 3.0)

    # ── VWAP ─────────────────────────────────────────────────────────────────
    tp = (df["high"] + df["low"] + df["close"]) / 3
    cum_tp_vol = (tp * df["volume"]).cumsum()
    cum_vol = df["volume"].cumsum()
    df["vwap"] = cum_tp_vol / cum_vol

    # ── RSI Divergence ───────────────────────────────────────────────────────
    rsi_slope = float(df["rsi"].iloc[-1] - df["rsi"].iloc[-5]) if len(df) >= 5 else 0
    price_slope = float(df["close"].iloc[-1] - df["close"].iloc[-5]) if len(df) >= 5 else 0

    curr = df.iloc[-1]
    prev = df.iloc[-2]

    result = {
        # Temel
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
        # Gelişmiş
        "adx":          _safe_round(curr, "adx"),
        "adx_plus":     _safe_round(curr, "adx_plus"),
        "adx_minus":    _safe_round(curr, "adx_minus"),
        "stoch_k":      _safe_round(curr, "stoch_k"),
        "stoch_d":      _safe_round(curr, "stoch_d"),
        "cci":          _safe_round(curr, "cci"),
        "williams_r":   _safe_round(curr, "williams_r"),
        "obv":          _safe_round(curr, "obv"),
        "prev_obv":     _safe_round(prev, "obv"),
        "cmf":          _safe_round(curr, "cmf", 4),
        "mfi":          _safe_round(curr, "mfi"),
        "supertrend":   _safe_round(curr, "supertrend"),
        "supertrend_dir": int(curr["supertrend_dir"]) if "supertrend_dir" in curr.index and pd.notna(curr["supertrend_dir"]) else None,
        "vwap":         _safe_round(curr, "vwap"),
        # Divergence
        "rsi_slope":    round(rsi_slope, 2),
        "bullish_div":  bool(price_slope < 0 and rsi_slope > 2),
        "bearish_div":  bool(price_slope > 0 and rsi_slope < -2),
    }

    if "ema200" in curr.index and pd.notna(curr["ema200"]):
        result["ema200"] = round(float(curr["ema200"]), 2)

    return result


# ═══════════════════════════════════════════════════════════════
#  Saf Pandas İndikatör Hesaplayıcılar
# ═══════════════════════════════════════════════════════════════

def _safe_round(row, col, decimals=2):
    """NaN-safe round helper."""
    if col in row.index and pd.notna(row[col]):
        return round(float(row[col]), decimals)
    return None


def _calc_adx(df: pd.DataFrame, period: int = 14):
    """ADX — trend gücü ölçer (25+ = güçlü trend)."""
    high = df["high"]
    low = df["low"]
    close = df["close"]

    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)

    atr = df["atr"]
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)

    dx = (abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, 1e-10)) * 100
    df["adx"] = dx.ewm(span=period, adjust=False).mean()
    df["adx_plus"] = plus_di
    df["adx_minus"] = minus_di


def _calc_stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3):
    """Stochastic Oscillator — aşırı alım/satım."""
    low_min = df["low"].rolling(k_period).min()
    high_max = df["high"].rolling(k_period).max()
    df["stoch_k"] = ((df["close"] - low_min) / (high_max - low_min).replace(0, 1e-10)) * 100
    df["stoch_d"] = df["stoch_k"].rolling(d_period).mean()


def _calc_cci(df: pd.DataFrame, period: int = 20):
    """CCI — fiyatın ortalamadan sapması."""
    tp = (df["high"] + df["low"] + df["close"]) / 3
    sma_tp = tp.rolling(period).mean()
    mad = tp.rolling(period).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    df["cci"] = (tp - sma_tp) / (0.015 * mad).replace(0, 1e-10)


def _calc_williams_r(df: pd.DataFrame, period: int = 14):
    """Williams %R — momentum osilatör."""
    high_max = df["high"].rolling(period).max()
    low_min = df["low"].rolling(period).min()
    df["williams_r"] = ((high_max - df["close"]) / (high_max - low_min).replace(0, 1e-10)) * -100


def _calc_obv(df: pd.DataFrame):
    """OBV — hacim akışı göstergesi."""
    obv = [0.0]
    for i in range(1, len(df)):
        if df["close"].iloc[i] > df["close"].iloc[i - 1]:
            obv.append(obv[-1] + df["volume"].iloc[i])
        elif df["close"].iloc[i] < df["close"].iloc[i - 1]:
            obv.append(obv[-1] - df["volume"].iloc[i])
        else:
            obv.append(obv[-1])
    df["obv"] = obv


def _calc_cmf(df: pd.DataFrame, period: int = 20):
    """CMF — para akışı yönü."""
    mfm = ((df["close"] - df["low"]) - (df["high"] - df["close"])) / (df["high"] - df["low"]).replace(0, 1e-10)
    mfv = mfm * df["volume"]
    df["cmf"] = mfv.rolling(period).sum() / df["volume"].rolling(period).sum().replace(0, 1e-10)


def _calc_mfi(df: pd.DataFrame, period: int = 14):
    """MFI — hacim ağırlıklı RSI."""
    tp = (df["high"] + df["low"] + df["close"]) / 3
    rmf = tp * df["volume"]
    tp_diff = tp.diff()

    pos_flow = rmf.where(tp_diff > 0, 0).rolling(period).sum()
    neg_flow = rmf.where(tp_diff < 0, 0).rolling(period).sum()
    mfi = 100 - (100 / (1 + pos_flow / neg_flow.replace(0, 1e-10)))
    df["mfi"] = mfi


def _calc_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0):
    """Supertrend — trend takip göstergesi."""
    hl2 = (df["high"] + df["low"]) / 2
    atr = df["tr"].ewm(span=period, adjust=False).mean()

    upper_band = hl2 + multiplier * atr
    lower_band = hl2 - multiplier * atr

    supertrend = [0.0] * len(df)
    direction = [1] * len(df)

    for i in range(1, len(df)):
        if pd.isna(upper_band.iloc[i]):
            continue

        # Final bands
        if lower_band.iloc[i] > 0:
            lower_band.iloc[i] = max(lower_band.iloc[i],
                                      lower_band.iloc[i-1]) if direction[i-1] == 1 else lower_band.iloc[i]
        if upper_band.iloc[i] > 0:
            upper_band.iloc[i] = min(upper_band.iloc[i],
                                      upper_band.iloc[i-1]) if direction[i-1] == -1 else upper_band.iloc[i]

        # Direction
        if direction[i-1] == 1:
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

    df["supertrend"] = supertrend
    df["supertrend_dir"] = direction


def calculate_bb_for_grid(ohlcv: list, period: int = 20, std_dev: float = 2.0) -> dict:
    """Grid bot için hafif BB + ATR + RSI hesaplayıcı.
    calculate_all() 20+ indikatör hesaplıyor — grid recalc loop'u için ağır.
    Bu fonksiyon sadece grid kararları için gereken 3 indikatörü hesaplar.
    """
    if len(ohlcv) < max(period, 14) + 5:
        return {}

    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    # ── Bollinger Bands ──────────────────────────────────────────────────
    sma = df["close"].rolling(period).mean()
    std = df["close"].rolling(period).std()
    bb_upper = sma + (std * std_dev)
    bb_lower = sma - (std * std_dev)
    bb_mid = sma
    bb_width = (bb_upper - bb_lower) / bb_mid  # Bant genişliği oranı

    # ── ATR (min step hesabı için) ───────────────────────────────────────
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.ewm(span=14, adjust=False).mean()

    # ── RSI (giriş/çıkış filtresi için) ─────────────────────────────────
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, 1e-10)
    rsi = 100 - (100 / (1 + rs))

    # ── ADX (trend gücü — grid vs trend karar) ──────────────────────────
    high = df["high"]
    low = df["low"]
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
    plus_di = 100 * (plus_dm.ewm(span=14, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=14, adjust=False).mean() / atr)
    dx = (abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, 1e-10)) * 100
    adx = dx.ewm(span=14, adjust=False).mean()

    curr = df.iloc[-1]
    
    # ── EMAs (EMA Trend strategy için) ───────────────────────────────────
    ema6 = df["close"].ewm(span=6, adjust=False).mean()
    ema14 = df["close"].ewm(span=14, adjust=False).mean()
    ema50 = df["close"].ewm(span=50, adjust=False).mean()
    ema200 = df["close"].ewm(span=200, adjust=False).mean()

    return {
        "bb_upper": round(float(bb_upper.iloc[-1]), 8),
        "bb_lower": round(float(bb_lower.iloc[-1]), 8),
        "bb_mid": round(float(bb_mid.iloc[-1]), 8),
        "bb_width": round(float(bb_width.iloc[-1]), 6),
        "atr": round(float(atr.iloc[-1]), 8),
        "rsi": round(float(rsi.iloc[-1]), 2),
        "adx": round(float(adx.iloc[-1]), 2),
        "close": float(curr["close"]),
        "candle_ts": int(curr["ts"]),
        "ema6": round(float(ema6.iloc[-1]), 8),
        "ema14": round(float(ema14.iloc[-1]), 8),
        "ema50": round(float(ema50.iloc[-1]), 8),
        "ema200": round(float(ema200.iloc[-1]), 8),
        "prev_ema6": round(float(ema6.iloc[-2]), 8),
        "prev_ema14": round(float(ema14.iloc[-2]), 8),
    }


def calculate_custom(ohlcv: list, indicator_name: str, **params) -> dict | None:
    """İsme göre indikatör hesapla."""
    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    calculators = {
        "ema": lambda: {"value": round(float(df["close"].ewm(span=params.get("length", 14), adjust=False).mean().iloc[-1]), 2)},
        "sma": lambda: {"value": round(float(df["close"].rolling(params.get("length", 14)).mean().iloc[-1]), 2)},
        "rsi": lambda: {"value": round(float(calculate_all(ohlcv).get("rsi", 0)), 2)},
        "atr": lambda: {"value": round(float(calculate_all(ohlcv).get("atr", 0)), 2)},
        "adx": lambda: {"value": round(float(calculate_all(ohlcv).get("adx", 0)), 2)},
        "supertrend": lambda: {
            "value": calculate_all(ohlcv).get("supertrend"),
            "direction": calculate_all(ohlcv).get("supertrend_dir"),
        },
        "stochastic": lambda: {
            "k": calculate_all(ohlcv).get("stoch_k"),
            "d": calculate_all(ohlcv).get("stoch_d"),
        },
    }

    calc = calculators.get(indicator_name)
    if calc:
        return calc()
    return {"error": f"İndikatör bulunamadı: {indicator_name}"}


def list_indicators() -> dict:
    """Kullanılabilir indikatörleri listele."""
    return {
        "trend": ["ema", "sma", "supertrend", "adx"],
        "momentum": ["rsi", "stochastic", "cci", "williams_r", "macd", "mfi"],
        "volatility": ["atr", "bollinger_bands", "keltner"],
        "volume": ["obv", "cmf", "vwap", "volume_ratio"],
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
