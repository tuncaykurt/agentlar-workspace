from fastapi import APIRouter
from core.redis_client import get_redis
from exchange.bitget_client import bitget
import json

router = APIRouter(prefix="/market", tags=["market"])


def _find_order_blocks(ohlcv: list, lookback: int = 60) -> list:
    """
    Bullish OB: Güçlü yükseliş hareketinden önce gelen son bearish mum.
    Bearish OB: Güçlü düşüş hareketinden önce gelen son bullish mum.
    """
    obs = []
    end = min(lookback, len(ohlcv) - 3)
    for i in range(2, end):
        idx = len(ohlcv) - 1 - i
        c  = ohlcv[idx]       # aday mum
        n1 = ohlcv[idx + 1]   # sonraki mum (hareket mumu)

        c_body  = abs(c[4] - c[1])
        n1_body = abs(n1[4] - n1[1])

        if c_body == 0:
            continue

        # Bullish OB: bearish mum + sonraki güçlü bullish hareket
        if c[4] < c[1] and n1[4] > n1[1] and n1_body > c_body * 1.5:
            obs.append({
                "type":  "bullish",
                "high":  round(c[2], 4),
                "low":   round(c[3], 4),
                "time":  c[0] // 1000,
            })
        # Bearish OB: bullish mum + sonraki güçlü bearish hareket
        elif c[4] > c[1] and n1[4] < n1[1] and n1_body > c_body * 1.5:
            obs.append({
                "type":  "bearish",
                "high":  round(c[2], 4),
                "low":   round(c[3], 4),
                "time":  c[0] // 1000,
            })

        if len(obs) >= 6:
            break
    return obs


def _find_fvg(ohlcv: list, lookback: int = 60) -> list:
    """
    Bullish FVG: c3.low > c1.high  (boşluk yukarı)
    Bearish FVG: c3.high < c1.low  (boşluk aşağı)
    """
    fvgs = []
    price = ohlcv[-1][4]
    end = min(lookback, len(ohlcv) - 2)

    for i in range(2, end):
        idx = len(ohlcv) - 1 - i
        c1 = ohlcv[idx - 1]
        c3 = ohlcv[idx + 1]

        # Bullish FVG
        if c3[3] > c1[2]:
            size = c3[3] - c1[2]
            if size > price * 0.001:   # en az %0.1 büyüklük
                fvgs.append({
                    "type":   "bullish",
                    "top":    round(c3[3], 4),
                    "bottom": round(c1[2], 4),
                    "time":   c1[0] // 1000,
                })
        # Bearish FVG
        elif c3[2] < c1[3]:
            size = c1[3] - c3[2]
            if size > price * 0.001:
                fvgs.append({
                    "type":   "bearish",
                    "top":    round(c1[3], 4),
                    "bottom": round(c3[2], 4),
                    "time":   c1[0] // 1000,
                })

        if len(fvgs) >= 5:
            break
    return fvgs


def _liq_levels(price: float) -> list:
    """
    Standart leverage oranlarına göre tahmini liquidation seviyeleri.
    %90 maintenance margin faktörü kullanılır.
    """
    levels = []
    for lev, pct in [(5, 0.18), (10, 0.09), (20, 0.045), (50, 0.018)]:
        levels.append({
            "leverage":   lev,
            "long_liq":   round(price * (1 - pct), 2),
            "short_liq":  round(price * (1 + pct), 2),
        })
    return levels


def _bollinger_bands(closes: list, period: int = 20, mult: float = 2.0) -> dict:
    import math
    upper, mid, lower = [], [], []
    for i in range(len(closes)):
        if i < period - 1:
            upper.append(None); mid.append(None); lower.append(None)
        else:
            w = closes[i - period + 1: i + 1]
            sma = sum(w) / period
            std = math.sqrt(sum((x - sma) ** 2 for x in w) / period)
            upper.append(sma + mult * std)
            mid.append(sma)
            lower.append(sma - mult * std)
    return {"upper": upper, "mid": mid, "lower": lower}


def _ema_series(closes: list, period: int) -> list:
    """Tüm mumlar için EMA serisi hesapla."""
    if len(closes) < period:
        return [None] * len(closes)
    k = 2 / (period + 1)
    result: list = [None] * (period - 1)
    ema = sum(closes[:period]) / period
    result.append(ema)
    for close in closes[period:]:
        ema = close * k + ema * (1 - k)
        result.append(ema)
    return result


def _signal_markers(ohlcv: list, ema9: list, ema21: list) -> list:
    """
    EMA 9/21 kesişim noktalarını sinyal olarak işaretle.
    Golden Cross → BUY ▲ | Death Cross → SELL ▼
    """
    markers = []
    for i in range(1, len(ohlcv)):
        e9p, e9c   = ema9[i - 1],  ema9[i]
        e21p, e21c = ema21[i - 1], ema21[i]
        if None in (e9p, e9c, e21p, e21c):
            continue
        if e9p <= e21p and e9c > e21c:          # Golden cross
            markers.append({"time": ohlcv[i][0] // 1000, "type": "buy",  "price": round(ohlcv[i][3], 4)})
        elif e9p >= e21p and e9c < e21c:        # Death cross
            markers.append({"time": ohlcv[i][0] // 1000, "type": "sell", "price": round(ohlcv[i][2], 4)})
    return markers[-20:]  # Son 20 sinyal


@router.get("/ticker")
async def get_ticker(symbol: str = "BTC/USDT:USDT"):
    redis = get_redis()
    raw = await redis.get(f"ticker:{symbol}")
    if raw:
        return json.loads(raw)
    ticker = await bitget.exchange.fetch_ticker(symbol)
    return {"symbol": symbol, "last": ticker["last"], "bid": ticker["bid"], "ask": ticker["ask"]}


@router.get("/kline")
async def get_kline(symbol: str = "BTC/USDT:USDT", interval: str = "1m", limit: int = 200):
    ohlcv = await bitget.get_ohlcv(symbol, interval, limit)
    return [
        {"time": c[0] // 1000, "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
        for c in ohlcv
    ]


@router.get("/funding")
async def get_funding_rate(symbol: str = "BTC/USDT:USDT"):
    rate = await bitget.get_funding_rate(symbol)
    return {"symbol": symbol, "funding_rate": rate, "funding_rate_pct": rate * 100}


@router.get("/balance")
async def get_balance():
    return await bitget.get_balance()


@router.get("/positions")
async def get_positions():
    return await bitget.get_positions()


@router.get("/levels")
async def get_levels(symbol: str = "BTC/USDT:USDT", interval: str = "1h"):
    """Order Block, FVG ve tahmini Liquidation seviyelerini döner."""
    ohlcv = await bitget.get_ohlcv(symbol, interval, 150)

    candles = [
        {"time": c[0] // 1000, "open": c[1], "high": c[2], "low": c[3], "close": c[4]}
        for c in ohlcv
    ]
    price   = ohlcv[-1][4]
    closes  = [c[4] for c in ohlcv]
    times   = [c[0] // 1000 for c in ohlcv]

    ema9_vals  = _ema_series(closes, 9)
    ema21_vals = _ema_series(closes, 21)
    ema55_vals = _ema_series(closes, 55)
    bb         = _bollinger_bands(closes)
    volumes    = [c[5] for c in ohlcv]

    def to_series(vals):
        return [{"time": t, "value": round(v, 4)} for t, v in zip(times, vals) if v is not None]

    return {
        "candles":            candles,
        "order_blocks":       _find_order_blocks(ohlcv),
        "fvgs":               _find_fvg(ohlcv),
        "liquidation_levels": _liq_levels(price),
        "current_price":      price,
        "ema": {
            "ema9":  to_series(ema9_vals),
            "ema21": to_series(ema21_vals),
            "ema55": to_series(ema55_vals),
        },
        "signals": _signal_markers(ohlcv, ema9_vals, ema21_vals),
        "bb": {
            "upper": to_series(bb["upper"]),
            "mid":   to_series(bb["mid"]),
            "lower": to_series(bb["lower"]),
        },
        "volume": [{"time": t, "value": round(v, 2), "color": "rgba(100,116,139,0.4)"} for t, v in zip(times, volumes)],
    }
