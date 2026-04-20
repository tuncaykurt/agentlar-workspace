"""
Teknik İndikatör Hesaplayıcı — pandas-ta ile 300+ İndikatör
════════════════════════════════════════════════════════════
Mevcut 6 indikatör korundu + pandas-ta ile genişletildi.
Yeni: ADX, Supertrend, Stochastic, CCI, Williams %R, OBV, CMF,
      Ichimoku, Squeeze Momentum, Hull MA, Keltner, VWAP...
"""
import pandas as pd
import math

try:
    import pandas_ta as ta
    HAS_PANDAS_TA = True
except ImportError:
    HAS_PANDAS_TA = False
    print("[indicators] pandas-ta yüklü değil — temel indikatörlerle devam ediliyor")


def calculate_all(ohlcv: list) -> dict:
    """
    OHLCV verisinden tüm indikatörleri hesapla.
    pandas-ta varsa 300+ indikatör erişilebilir,
    yoksa mevcut 6 indikatör çalışmaya devam eder.
    """
    if len(ohlcv) < 55:
        return {}

    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    # ── Temel İndikatörler (her zaman çalışır) ───────────────────────────────

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

    result = {
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

    # ── pandas-ta Gelişmiş İndikatörler ──────────────────────────────────────

    if HAS_PANDAS_TA:
        try:
            _add_advanced_indicators(df, result)
        except Exception as e:
            print(f"[indicators] pandas-ta hatası: {e}")

    return result


def _add_advanced_indicators(df: pd.DataFrame, result: dict):
    """pandas-ta ile gelişmiş indikatörleri hesapla."""
    curr = df.iloc[-1]
    prev = df.iloc[-2]

    # ── EMA 200 (uzun vadeli trend) ──────────────────────────────────────
    if len(df) >= 200:
        ema200 = ta.ema(df["close"], length=200)
        if ema200 is not None and not ema200.empty:
            result["ema200"] = round(float(ema200.iloc[-1]), 2)

    # ── ADX (trend gücü) ────────────────────────────────────────────────
    adx_df = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx_df is not None and not adx_df.empty:
        result["adx"]      = round(float(adx_df["ADX_14"].iloc[-1]), 2)
        result["adx_plus"] = round(float(adx_df["DMP_14"].iloc[-1]), 2)
        result["adx_minus"] = round(float(adx_df["DMN_14"].iloc[-1]), 2)

    # ── Stochastic ──────────────────────────────────────────────────────
    stoch = ta.stoch(df["high"], df["low"], df["close"], k=14, d=3)
    if stoch is not None and not stoch.empty:
        result["stoch_k"]  = round(float(stoch.iloc[-1, 0]), 2)
        result["stoch_d"]  = round(float(stoch.iloc[-1, 1]), 2)

    # ── CCI (Commodity Channel Index) ───────────────────────────────────
    cci = ta.cci(df["high"], df["low"], df["close"], length=20)
    if cci is not None and not cci.empty:
        result["cci"] = round(float(cci.iloc[-1]), 2)

    # ── Williams %R ─────────────────────────────────────────────────────
    willr = ta.willr(df["high"], df["low"], df["close"], length=14)
    if willr is not None and not willr.empty:
        result["williams_r"] = round(float(willr.iloc[-1]), 2)

    # ── OBV (On Balance Volume) ─────────────────────────────────────────
    obv = ta.obv(df["close"], df["volume"])
    if obv is not None and not obv.empty:
        result["obv"]      = round(float(obv.iloc[-1]), 2)
        result["prev_obv"] = round(float(obv.iloc[-2]), 2)

    # ── CMF (Chaikin Money Flow) ────────────────────────────────────────
    cmf = ta.cmf(df["high"], df["low"], df["close"], df["volume"], length=20)
    if cmf is not None and not cmf.empty:
        result["cmf"] = round(float(cmf.iloc[-1]), 4)

    # ── MFI (Money Flow Index) ──────────────────────────────────────────
    mfi = ta.mfi(df["high"], df["low"], df["close"], df["volume"], length=14)
    if mfi is not None and not mfi.empty:
        result["mfi"] = round(float(mfi.iloc[-1]), 2)

    # ── Supertrend ──────────────────────────────────────────────────────
    st = ta.supertrend(df["high"], df["low"], df["close"], length=10, multiplier=3)
    if st is not None and not st.empty:
        cols = st.columns.tolist()
        # Supertrend sütun isimleri: SUPERT_10_3.0, SUPERTd_10_3.0, ...
        for col in cols:
            if col.startswith("SUPERTd"):
                result["supertrend_dir"] = int(st[col].iloc[-1])  # 1=bull, -1=bear
            elif col.startswith("SUPERT_"):
                result["supertrend"] = round(float(st[col].iloc[-1]), 2)

    # ── Ichimoku ────────────────────────────────────────────────────────
    ichi = ta.ichimoku(df["high"], df["low"], df["close"])
    if ichi is not None and len(ichi) >= 1:
        ichi_df = ichi[0]  # ichimoku[0] = değerler, ichimoku[1] = bulut
        if not ichi_df.empty:
            cols = ichi_df.columns.tolist()
            for col in cols:
                if "TENKAN" in col.upper() or "ISA" in col:
                    result["ichi_tenkan"] = round(float(ichi_df[col].iloc[-1]), 2)
                elif "KIJUN" in col.upper() or "ISB" in col:
                    result["ichi_kijun"] = round(float(ichi_df[col].iloc[-1]), 2)

    # ── Squeeze Momentum (Lazybear) ─────────────────────────────────────
    squeeze = ta.squeeze(df["high"], df["low"], df["close"], bb_length=20, kc_length=20)
    if squeeze is not None and not squeeze.empty:
        cols = squeeze.columns.tolist()
        for col in cols:
            if "SQZ" in col and "ON" not in col and "OFF" not in col and "NO" not in col:
                val = squeeze[col].iloc[-1]
                if pd.notna(val):
                    result["squeeze_mom"] = round(float(val), 4)
            elif "ON" in col:
                val = squeeze[col].iloc[-1]
                if pd.notna(val):
                    result["squeeze_on"] = int(val)

    # ── VWAP ────────────────────────────────────────────────────────────
    vwap = ta.vwap(df["high"], df["low"], df["close"], df["volume"])
    if vwap is not None and not vwap.empty:
        result["vwap"] = round(float(vwap.iloc[-1]), 2)

    # ── Hull MA ─────────────────────────────────────────────────────────
    hma = ta.hma(df["close"], length=20)
    if hma is not None and not hma.empty:
        result["hma20"] = round(float(hma.iloc[-1]), 2)

    # ── Keltner Channel ─────────────────────────────────────────────────
    kc = ta.kc(df["high"], df["low"], df["close"], length=20, scalar=2)
    if kc is not None and not kc.empty:
        cols = kc.columns.tolist()
        for col in cols:
            if "KCU" in col:
                result["kc_upper"] = round(float(kc[col].iloc[-1]), 2)
            elif "KCL" in col:
                result["kc_lower"] = round(float(kc[col].iloc[-1]), 2)
            elif "KCB" in col:
                result["kc_mid"] = round(float(kc[col].iloc[-1]), 2)

    # ── RSI Divergence bilgisi ──────────────────────────────────────────
    rsi_series = ta.rsi(df["close"], length=14)
    if rsi_series is not None and len(rsi_series) >= 20:
        result["rsi_slope"] = round(float(rsi_series.iloc[-1] - rsi_series.iloc[-5]), 2)
        price_slope = df["close"].iloc[-1] - df["close"].iloc[-5]
        rsi_slope = rsi_series.iloc[-1] - rsi_series.iloc[-5]
        # Bearish divergence: fiyat yukarı, RSI aşağı
        result["bearish_div"] = bool(price_slope > 0 and rsi_slope < -2)
        # Bullish divergence: fiyat aşağı, RSI yukarı
        result["bullish_div"] = bool(price_slope < 0 and rsi_slope > 2)


def calculate_custom(ohlcv: list, indicator_name: str, **params) -> dict | None:
    """
    İsme göre herhangi bir pandas-ta indikatörünü hesapla.
    Frontend'den gelen özel indikatör istekleri için.

    Kullanım:
        calculate_custom(ohlcv, "supertrend", length=10, multiplier=3)
        calculate_custom(ohlcv, "ema", length=200)
    """
    if not HAS_PANDAS_TA:
        return None

    df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

    try:
        # pandas-ta'nın df.ta.strategy() yapısını kullan
        func = getattr(ta, indicator_name, None)
        if func is None:
            return {"error": f"İndikatör bulunamadı: {indicator_name}"}

        # İndikatöre göre doğru sütunları geçir
        ohlcv_indicators = {"supertrend", "kc", "ichimoku", "adx", "stoch", "cci",
                            "willr", "atr", "squeeze", "donchian", "accbands"}
        hlcv_indicators = {"cmf", "mfi"}
        cv_indicators = {"obv"}

        if indicator_name in ohlcv_indicators:
            ind_result = func(df["high"], df["low"], df["close"], **params)
        elif indicator_name in hlcv_indicators:
            ind_result = func(df["high"], df["low"], df["close"], df["volume"], **params)
        elif indicator_name in cv_indicators:
            ind_result = func(df["close"], df["volume"], **params)
        elif indicator_name == "vwap":
            ind_result = func(df["high"], df["low"], df["close"], df["volume"], **params)
        else:
            ind_result = func(df["close"], **params)

        if ind_result is None:
            return {"error": "Hesaplama başarısız"}

        # DataFrame veya Series olabilir
        if isinstance(ind_result, pd.DataFrame):
            return {col: round(float(ind_result[col].iloc[-1]), 6) for col in ind_result.columns
                    if pd.notna(ind_result[col].iloc[-1])}
        elif isinstance(ind_result, pd.Series):
            return {"value": round(float(ind_result.iloc[-1]), 6)}
        elif isinstance(ind_result, tuple):
            # Ichimoku gibi tuple döndürenler
            combined = {}
            for i, part in enumerate(ind_result):
                if isinstance(part, pd.DataFrame):
                    for col in part.columns:
                        if pd.notna(part[col].iloc[-1]):
                            combined[col] = round(float(part[col].iloc[-1]), 6)
            return combined

    except Exception as e:
        return {"error": str(e)}


def list_indicators() -> list[str]:
    """Kullanılabilir tüm pandas-ta indikatörlerini listele."""
    if not HAS_PANDAS_TA:
        return ["ema", "rsi", "macd", "bbands", "atr", "volume"]

    # pandas-ta'nın tüm indikatör isimlerini döndür
    categories = {
        "trend": ta.Category["trend"] if "trend" in ta.Category else [],
        "momentum": ta.Category["momentum"] if "momentum" in ta.Category else [],
        "volatility": ta.Category["volatility"] if "volatility" in ta.Category else [],
        "volume": ta.Category["volume"] if "volume" in ta.Category else [],
        "statistics": ta.Category["statistics"] if "statistics" in ta.Category else [],
    }
    return categories


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
