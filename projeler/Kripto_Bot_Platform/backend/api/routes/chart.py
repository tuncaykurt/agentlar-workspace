"""
Gelişmiş Grafik Veri Endpoint'i
15+ teknik indikatör hesaplama:
  Overlay  : EMA, SMA, BB, VWAP, SAR (Parabolic), İchimoku
  Osilatör : RSI, MACD, Stochastic, Williams %R, ATR, CCI, MFI, OBV
"""
import math
from fastapi import APIRouter
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher
from services.liquidation_collector import get_liquidation_heatmap, get_liquidation_stats

router = APIRouter(prefix="/chart", tags=["chart"])

_fetcher = DataFetcher(bitget)


# ═══════════════════════════════════════════════════════════════
#  Yardımcı hesaplama fonksiyonları
# ═══════════════════════════════════════════════════════════════

def _ema(closes: list[float], period: int) -> list[float | None]:
    if len(closes) < period:
        return [None] * len(closes)
    k = 2 / (period + 1)
    res: list[float | None] = [None] * (period - 1)
    ema = sum(closes[:period]) / period
    res.append(ema)
    for c in closes[period:]:
        ema = c * k + ema * (1 - k)
        res.append(ema)
    return res


def _sma(closes: list[float], period: int) -> list[float | None]:
    res: list[float | None] = [None] * (period - 1)
    for i in range(period - 1, len(closes)):
        res.append(sum(closes[i - period + 1: i + 1]) / period)
    return res


def _stdev(closes: list[float], period: int) -> list[float | None]:
    sma = _sma(closes, period)
    res: list[float | None] = []
    for i, m in enumerate(sma):
        if m is None:
            res.append(None)
        else:
            w = closes[i - period + 1: i + 1]
            res.append(math.sqrt(sum((x - m) ** 2 for x in w) / period))
    return res


def _rsi(closes: list[float], period: int = 14) -> list[float | None]:
    res: list[float | None] = [None] * period
    gains, losses = [], []
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_g = sum(gains) / period
    avg_l = sum(losses) / period
    rs = avg_g / avg_l if avg_l else float("inf")
    res.append(100 - 100 / (1 + rs))
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0))  / period
        avg_l = (avg_l * (period - 1) + max(-d, 0)) / period
        rs = avg_g / avg_l if avg_l else float("inf")
        res.append(100 - 100 / (1 + rs))
    return res


def _macd(closes: list[float], fast=12, slow=26, signal=9):
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    macd_line = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(ema_fast, ema_slow)
    ]
    valid = [(i, v) for i, v in enumerate(macd_line) if v is not None]
    sig_vals = _ema([v for _, v in valid], signal)
    sig_line: list[float | None] = [None] * len(closes)
    hist:     list[float | None] = [None] * len(closes)
    for j, (i, m) in enumerate(valid):
        s = sig_vals[j]
        sig_line[i] = s
        if s is not None:
            hist[i] = m - s
    return macd_line, sig_line, hist


def _stochastic(ohlcv: list, k_period=14, d_period=3):
    highs  = [c[2] for c in ohlcv]
    lows   = [c[3] for c in ohlcv]
    closes = [c[4] for c in ohlcv]
    k_raw: list[float | None] = []
    for i in range(len(closes)):
        if i < k_period - 1:
            k_raw.append(None)
        else:
            h = max(highs[i - k_period + 1: i + 1])
            l = min(lows[i  - k_period + 1: i + 1])
            k_raw.append((closes[i] - l) / (h - l) * 100 if h != l else 50)
    valid_k = [v for v in k_raw if v is not None]
    d_sma   = _sma(valid_k, d_period)
    k_line: list[float | None] = k_raw[:]
    d_line: list[float | None] = [None] * len(closes)
    vi = 0
    for i, v in enumerate(k_raw):
        if v is not None:
            d_line[i] = d_sma[vi]
            vi += 1
    return k_line, d_line


def _atr(ohlcv: list, period=14) -> list[float | None]:
    trs: list[float] = [ohlcv[0][2] - ohlcv[0][3]]
    for i in range(1, len(ohlcv)):
        h, l, pc = ohlcv[i][2], ohlcv[i][3], ohlcv[i - 1][4]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    res: list[float | None] = [None] * period
    atr_val = sum(trs[:period]) / period
    res.append(atr_val)
    for tr in trs[period:]:
        atr_val = (atr_val * (period - 1) + tr) / period
        res.append(atr_val)
    return res


def _cci(ohlcv: list, period=20) -> list[float | None]:
    tp = [(c[2] + c[3] + c[4]) / 3 for c in ohlcv]
    res: list[float | None] = [None] * (period - 1)
    for i in range(period - 1, len(tp)):
        w = tp[i - period + 1: i + 1]
        m = sum(w) / period
        md = sum(abs(x - m) for x in w) / period
        res.append((tp[i] - m) / (0.015 * md) if md else 0)
    return res


def _williams_r(ohlcv: list, period=14) -> list[float | None]:
    highs  = [c[2] for c in ohlcv]
    lows   = [c[3] for c in ohlcv]
    closes = [c[4] for c in ohlcv]
    res: list[float | None] = [None] * (period - 1)
    for i in range(period - 1, len(closes)):
        h = max(highs[i - period + 1: i + 1])
        l = min(lows[i  - period + 1: i + 1])
        res.append((h - closes[i]) / (h - l) * -100 if h != l else -50)
    return res


def _obv(ohlcv: list) -> list[float]:
    obv = 0.0
    res = [0.0]
    for i in range(1, len(ohlcv)):
        vol = ohlcv[i][5]
        obv += vol if ohlcv[i][4] > ohlcv[i - 1][4] else (-vol if ohlcv[i][4] < ohlcv[i - 1][4] else 0)
        res.append(obv)
    return res


def _mfi(ohlcv: list, period=14) -> list[float | None]:
    tp  = [(c[2] + c[3] + c[4]) / 3 for c in ohlcv]
    rmf = [t * c[5] for t, c in zip(tp, ohlcv)]
    res: list[float | None] = [None] * period
    for i in range(period, len(tp)):
        pos = sum(rmf[j] for j in range(i - period, i) if tp[j] > tp[j - 1])
        neg = sum(rmf[j] for j in range(i - period, i) if tp[j] < tp[j - 1])
        res.append(100 - 100 / (1 + pos / neg) if neg else 100)
    return res


def _volume_profile(ohlcv: list, bins: int = 60) -> list:
    """Her fiyat seviyesindeki hacim dağılımını hesaplar (Volume Profile / VPVR)."""
    if not ohlcv:
        return []

    price_high = max(c[2] for c in ohlcv)
    price_low  = min(c[3] for c in ohlcv)
    if price_high <= price_low:
        return []

    bin_size = (price_high - price_low) / bins
    vol_bins = [0.0] * bins

    for c in ohlcv:
        h, l, v = c[2], c[3], c[5]
        candle_range = h - l
        if candle_range < 1e-8:
            idx = min(int((c[4] - price_low) / bin_size), bins - 1)
            vol_bins[idx] += v
            continue
        for b in range(bins):
            bin_low  = price_low + b * bin_size
            bin_high = bin_low + bin_size
            overlap  = max(0.0, min(h, bin_high) - max(l, bin_low))
            if overlap > 0:
                vol_bins[b] += v * overlap / candle_range

    max_vol   = max(vol_bins) if any(v > 0 for v in vol_bins) else 1.0
    poc_idx   = vol_bins.index(max_vol)

    # Value Area: toplam hacmin %70'ini kapsayan merkezi alan
    total_vol   = sum(vol_bins)
    target      = total_vol * 0.70
    cumul       = 0.0
    va_indices  = set()
    for i in sorted(range(bins), key=lambda x: vol_bins[x], reverse=True):
        cumul += vol_bins[i]
        va_indices.add(i)
        if cumul >= target:
            break

    return [
        {
            "price":  round(price_low + (i + 0.5) * bin_size, 4),
            "volume": round(vol_bins[i], 2),
            "pct":    round(vol_bins[i] / max_vol, 4),
            "is_poc": i == poc_idx,
            "is_va":  i in va_indices,
        }
        for i in range(bins)
    ]


def _vwap(ohlcv: list) -> list[float]:
    cum_vol = cum_tp_vol = 0.0
    res = []
    for c in ohlcv:
        tp = (c[2] + c[3] + c[4]) / 3
        cum_tp_vol += tp * c[5]
        cum_vol    += c[5]
        res.append(cum_tp_vol / cum_vol if cum_vol else tp)
    return res


def _bollinger(closes: list[float], period=20, mult=2.0):
    sma_v = _sma(closes, period)
    std_v = _stdev(closes, period)
    upper = [m + mult * s if m is not None and s is not None else None for m, s in zip(sma_v, std_v)]
    lower = [m - mult * s if m is not None and s is not None else None for m, s in zip(sma_v, std_v)]
    return upper, sma_v, lower


def _to_series(times, vals):
    return [{"time": t, "value": round(v, 4)} for t, v in zip(times, vals) if v is not None]


def _ut_bot(ohlcv: list, period: int = 10, mult: float = 3.0) -> dict:
    """UT Bot Alert — ATR tabanlı trailing stop sinyal sistemi."""
    closes = [c[4] for c in ohlcv]
    atr    = _atr(ohlcv, period)
    times  = [c[0] // 1000 for c in ohlcv]

    trail: list[float | None] = [None] * len(closes)
    signals: list[dict] = []
    trail_series: list[dict] = []

    for i in range(1, len(closes)):
        if atr[i] is None:
            continue
        loss = mult * atr[i]
        prev = trail[i - 1] if trail[i - 1] is not None else closes[i]

        if closes[i] > prev and closes[i - 1] > prev:
            trail[i] = max(prev, closes[i] - loss)
        elif closes[i] < prev and closes[i - 1] < prev:
            trail[i] = min(prev, closes[i] + loss)
        else:
            trail[i] = closes[i] - loss if closes[i] > prev else closes[i] + loss

    for i in range(1, len(closes)):
        if trail[i] is None or trail[i - 1] is None:
            continue
        trail_series.append({"time": times[i], "value": round(trail[i], 4)})
        # Buy: fiyat trailing stop'u yukarı kesti
        if closes[i - 1] < trail[i - 1] and closes[i] > trail[i]:
            signals.append({"time": times[i], "type": "buy",  "price": closes[i]})
        # Sell: fiyat trailing stop'u aşağı kesti
        elif closes[i - 1] > trail[i - 1] and closes[i] < trail[i]:
            signals.append({"time": times[i], "type": "sell", "price": closes[i]})

    return {"signals": signals, "trail": trail_series}


def _lr_channel(closes: list[float], times: list[int], period: int = 100) -> dict:
    """Linear Regression Channel — trend yönü ve kanal sınırları."""
    n   = min(period, len(closes))
    y   = closes[-n:]
    t   = times[-n:]
    x   = list(range(n))
    sx  = n * (n - 1) / 2
    sx2 = n * (n - 1) * (2 * n - 1) / 6
    sy  = sum(y)
    sxy = sum(x[i] * y[i] for i in range(n))

    denom = n * sx2 - sx ** 2
    if denom == 0:
        return {"upper": [], "mid": [], "lower": []}

    slope     = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    fitted    = [intercept + slope * i for i in x]
    resid     = [y[i] - fitted[i] for i in range(n)]
    std       = math.sqrt(sum(r ** 2 for r in resid) / n)

    return {
        "upper": [{"time": t[i], "value": round(fitted[i] + 2 * std, 4)} for i in range(n)],
        "mid":   [{"time": t[i], "value": round(fitted[i],           4)} for i in range(n)],
        "lower": [{"time": t[i], "value": round(fitted[i] - 2 * std, 4)} for i in range(n)],
        "slope": round(slope, 6),
    }


def _sr_levels(ohlcv: list, lookback: int = 5, max_levels: int = 10) -> list:
    """Swing high/low tabanlı Destek/Direnç seviyeleri, yakın seviyeleri kümeler."""
    highs  = [c[2] for c in ohlcv]
    lows   = [c[3] for c in ohlcv]
    closes = [c[4] for c in ohlcv]
    current = closes[-1]

    raw: list[float] = []
    for i in range(lookback, len(ohlcv) - lookback):
        if all(highs[i] >= highs[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            raw.append(highs[i])
        if all(lows[i] <= lows[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            raw.append(lows[i])

    # Yakın seviyeleri (%0.4 içinde) kümele
    clustered: list[dict] = []
    for price in sorted(raw):
        if not clustered or abs(price - clustered[-1]["price"]) / clustered[-1]["price"] > 0.004:
            clustered.append({"price": round(price, 4), "strength": 1,
                               "type": "resistance" if price > current else "support"})
        else:
            clustered[-1]["strength"] += 1
            clustered[-1]["price"] = round(
                (clustered[-1]["price"] * (clustered[-1]["strength"] - 1) + price) / clustered[-1]["strength"], 4)

    clustered.sort(key=lambda l: (-l["strength"], abs(l["price"] - current)))
    return clustered[:max_levels]


def _order_blocks(ohlcv: list, n: int = 8) -> list:
    """Order Block tespiti — zaman koordinatı ve fiyat aralığı ile."""
    closes = [c[4] for c in ohlcv]
    current = closes[-1]
    last_time = ohlcv[-1][0] // 1000
    result = []

    for i in range(2, len(ohlcv) - 1):
        body_curr = abs(ohlcv[i][4]   - ohlcv[i][1])
        body_next = abs(ohlcv[i+1][4] - ohlcv[i+1][1])

        # Bearish OB: son bullish mum + ardından güçlü bearish mum
        if (ohlcv[i][4] > ohlcv[i][1] and
                ohlcv[i+1][4] < ohlcv[i+1][1] and
                body_next > body_curr * 1.5):
            result.append({
                "type":       "bearish",
                "time_start": ohlcv[i][0] // 1000,
                "time_end":   last_time,
                "high":       round(ohlcv[i][2], 4),
                "low":        round(ohlcv[i][3], 4),
                "mitigated":  current > ohlcv[i][2],
            })

        # Bullish OB: son bearish mum + ardından güçlü bullish mum
        if (ohlcv[i][4] < ohlcv[i][1] and
                ohlcv[i+1][4] > ohlcv[i+1][1] and
                body_next > body_curr * 1.5):
            result.append({
                "type":       "bullish",
                "time_start": ohlcv[i][0] // 1000,
                "time_end":   last_time,
                "high":       round(ohlcv[i][2], 4),
                "low":        round(ohlcv[i][3], 4),
                "mitigated":  current < ohlcv[i][3],
            })

    # Mitigation edilmemişleri önce, en yakın zamanlıları üste
    result = result[-30:]
    result.sort(key=lambda x: (x["mitigated"], -x["time_start"]))
    return result[:n]


# ═══════════════════════════════════════════════════════════════
#  Endpoint
# ═══════════════════════════════════════════════════════════════

async def _fetch_ohlcv_fallback(symbol: str, interval: str, limit: int) -> list:
    """
    Bitget API başarısız olursa Binance public REST'ten veri çeker.
    Auth gerektirmez — public endpoint.
    """
    import httpx

    # Sembol dönüşümü: BTC/USDT:USDT → BTCUSDT
    binance_symbol = symbol.replace("/", "").replace(":USDT", "").replace(":BTC", "")

    # Binance timeframe → Bitget timeframe eşleşmesi
    tf_map = {
        "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
        "30m": "30m", "1h": "1h", "2h": "2h", "4h": "4h",
        "6h": "6h", "12h": "12h", "1d": "1d",
    }
    binance_tf = tf_map.get(interval, "1h")
    fetch_limit = min(limit, 1000)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.binance.com/api/v3/klines",
                params={"symbol": binance_symbol, "interval": binance_tf, "limit": fetch_limit},
            )
            if resp.status_code == 200:
                raw = resp.json()
                # Binance format: [ts, open, high, low, close, vol, ...]
                return [
                    [int(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), float(c[5])]
                    for c in raw
                ]
    except Exception as e:
        print(f"[Chart] Binance fallback hatası ({symbol}): {e}")
    return []


@router.get("/data")
async def get_chart_data(
    symbol:   str = "BTC/USDT:USDT",
    interval: str = "1h",
    limit:    int = 2000,
):
    """Tüm teknik indikatörleri döner."""
    import asyncio
    liq_stats_task = get_liquidation_stats(symbol)
    liq_heatmap_task = get_liquidation_heatmap(symbol, hours=168)  # 7 gün

    ohlcv = []
    try:
        ohlcv = await _fetcher.get_ohlcv(symbol, interval, limit)
    except Exception as e:
        print(f"[Chart] get_ohlcv hata ({symbol} {interval}): {e}")

    liq_stats, liq_heatmap = await asyncio.gather(liq_stats_task, liq_heatmap_task)

    # ── Fallback: Bitget/cache başarısız olduysa Binance public REST'i dene ──
    if not ohlcv:
        print(f"[Chart] Bitget boş döndü, Binance fallback deneniyor ({symbol} {interval})...")
        ohlcv = await _fetch_ohlcv_fallback(symbol, interval, limit)
        if ohlcv:
            print(f"[Chart] Binance fallback başarılı: {len(ohlcv)} mum")
        else:
            print(f"[Chart] Her iki kaynak da başarısız, boş veri dönüyor.")

    # Timestamp'e göre sırala ve duplikatları kaldır
    ohlcv.sort(key=lambda c: c[0])
    seen = set()
    clean = []
    for c in ohlcv:
        ts = c[0] // 1000  # saniyeye çevir
        if ts not in seen:
            seen.add(ts)
            clean.append(c)
    ohlcv = clean

    closes = [c[4] for c in ohlcv]
    times  = [c[0] // 1000 for c in ohlcv]

    candles = [
        {"time": c[0] // 1000, "open": c[1], "high": c[2], "low": c[3], "close": c[4]}
        for c in ohlcv
    ]
    volume = [
        {"time": c[0] // 1000, "value": c[5],
         "color": "rgba(34,197,94,0.5)" if c[4] >= c[1] else "rgba(239,68,68,0.5)"}
        for c in ohlcv
    ]

    macd_line, sig_line, macd_hist = _macd(closes)
    k_line, d_line = _stochastic(ohlcv)
    bb_upper, bb_mid, bb_lower = _bollinger(closes)

    return {
        "candles": candles,
        "volume":  volume,

        # Overlay indikatörler
        "ema9":    _to_series(times, _ema(closes, 9)),
        "ema21":   _to_series(times, _ema(closes, 21)),
        "ema55":   _to_series(times, _ema(closes, 55)),
        "ema200":  _to_series(times, _ema(closes, 200)),
        "sma20":   _to_series(times, _sma(closes, 20)),
        "vwap":    _to_series(times, _vwap(ohlcv)),
        "bb_upper":_to_series(times, bb_upper),
        "bb_mid":  _to_series(times, bb_mid),
        "bb_lower":_to_series(times, bb_lower),

        # Osilatörler
        "rsi":        _to_series(times, _rsi(closes)),
        "macd_line":  _to_series(times, macd_line),
        "macd_signal":_to_series(times, sig_line),
        "macd_hist":  _to_series(times, macd_hist),
        "stoch_k":    _to_series(times, k_line),
        "stoch_d":    _to_series(times, d_line),
        "atr":        _to_series(times, _atr(ohlcv)),
        "cci":        _to_series(times, _cci(ohlcv)),
        "williams_r":     _to_series(times, _williams_r(ohlcv)),
        "obv":            _to_series(times, _obv(ohlcv)),
        "mfi":            _to_series(times, _mfi(ohlcv)),

        # Hacim Profili (Volume Profile / VPVR)
        "volume_profile": _volume_profile(ohlcv),

        # UT Bot Alert (ATR trailing stop sinyalleri)
        "ut_bot": _ut_bot(ohlcv),

        # Linear Regression Channel (trend kanalı)
        "lr_channel": _lr_channel(closes, times),

        # Destek / Direnç seviyeleri
        "sr_levels": _sr_levels(ohlcv),

        # Order Blocks (dikdörtgen koordinatları)
        "order_blocks": _order_blocks(ohlcv),

        # Likidasyon verileri (Binance WS + opsiyonel Coinglass)
        "liquidations": liq_stats,
        "liq_heatmap": liq_heatmap,
    }
