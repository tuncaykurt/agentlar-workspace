"""
Backtest API Endpoint'leri
──────────────────────────
- Strateji backtesti başlat
- DB'deki geçmiş verilerle simülasyon
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from bot.backtester import BacktestEngine
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher

router = APIRouter(prefix="/backtest", tags=["backtest"])

_fetcher = DataFetcher(bitget)


class BacktestRequest(BaseModel):
    symbol: str = "BTC/USDT:USDT"
    timeframe: str = "1h"
    strategy: str = "ema_cross"
    days: int = Field(default=90, ge=7, le=365)
    initial_balance: float = Field(default=10000, ge=100)
    risk_per_trade: float = Field(default=0.02, ge=0.005, le=0.1)
    leverage: int = Field(default=3, ge=1, le=500)
    stop_loss_pct: float = Field(default=2.0, ge=0.5, le=10)
    take_profit_pct: float = Field(default=4.0, ge=1.0, le=20)
    fee_pct: float = Field(default=0.06, ge=0, le=0.5)
    params: dict = Field(default_factory=dict)


@router.post("/run")
async def run_backtest(req: BacktestRequest):
    """Geçmiş veri üzerinde strateji simülasyonu çalıştır."""
    # Timeframe'e göre gereken mum sayısını hesapla
    hours_per_candle = {"1m": 1/60, "5m": 5/60, "15m": 0.25, "1h": 1, "4h": 4, "1d": 24}
    hpc = hours_per_candle.get(req.timeframe, 1)
    needed_candles = int((req.days * 24) / hpc)

    # Veriyi DB'den çek
    ohlcv = await _fetcher.get_ohlcv(req.symbol, req.timeframe, needed_candles)

    if len(ohlcv) < 100:
        return {
            "error": f"Yetersiz veri: {len(ohlcv)} mum bulundu. Önce /api/data/fetch-historical ile veri çekin.",
            "candle_count": len(ohlcv),
        }

    engine = BacktestEngine({
        "strategy": req.strategy,
        "params": req.params,
        "initial_balance": req.initial_balance,
        "risk_per_trade": req.risk_per_trade,
        "leverage": req.leverage,
        "stop_loss_pct": req.stop_loss_pct,
        "take_profit_pct": req.take_profit_pct,
        "fee_pct": req.fee_pct,
        "timeframe": req.timeframe,
    })

    result = engine.run(ohlcv)
    result["config"] = {
        "symbol": req.symbol,
        "timeframe": req.timeframe,
        "strategy": req.strategy,
        "days": req.days,
        "candle_count": len(ohlcv),
    }

    # Grafik için OHLCV verisi (max 3000 mum — performans)
    step = max(1, len(ohlcv) // 3000)
    result["ohlcv"] = [
        {"time": c[0] // 1000, "open": c[1], "high": c[2], "low": c[3], "close": c[4]}
        for c in ohlcv[::step]
    ]

    return result


@router.post("/signals")
async def get_signals(req: BacktestRequest):
    """
    Canlı grafik üstünde strateji sinyallerini göstermek için.
    Sadece entry noktalarını döner (SL/TP simülasyonu yok, sadece işaretçiler).
    """
    hours_per_candle = {"1m": 1/60, "5m": 5/60, "15m": 0.25, "1h": 1, "4h": 4, "1d": 24}
    hpc = hours_per_candle.get(req.timeframe, 1)
    needed_candles = int((req.days * 24) / hpc)

    ohlcv = await _fetcher.get_ohlcv(req.symbol, req.timeframe, needed_candles)

    if len(ohlcv) < 100:
        return {"error": f"Yetersiz veri: {len(ohlcv)} mum", "signals": []}

    engine = BacktestEngine({
        "strategy": req.strategy,
        "params": req.params,
        "timeframe": req.timeframe,
    })

    lookback = engine.lookback
    signals = []
    last_signal = None  # Aynı sinyali tekrar üretme (spam'ı önle)

    for i in range(lookback, len(ohlcv)):
        window = ohlcv[i - lookback: i + 1]
        sig = engine._get_signal(window)
        if sig and sig != last_signal:
            signals.append({
                "time": ohlcv[i][0] // 1000,
                "price": ohlcv[i][4],
                "signal": sig,
            })
            last_signal = sig

    return {
        "symbol": req.symbol,
        "timeframe": req.timeframe,
        "strategy": req.strategy,
        "candle_count": len(ohlcv),
        "signal_count": len(signals),
        "signals": signals,
    }


@router.get("/strategies")
async def list_strategies():
    """Kullanılabilir backtest stratejilerini listele."""
    return {
        "strategies": [
            {
                "id": "ema_cross",
                "name": "EMA Crossover",
                "description": "Hızlı/yavaş EMA kesişimi",
                "params": {"fast_ema": 9, "slow_ema": 21, "min_volume": 1.2},
            },
            {
                "id": "rsi_oversold",
                "name": "RSI Oversold/Overbought",
                "description": "RSI aşırı bölgelerden çıkış sinyali",
                "params": {"rsi_period": 14, "oversold": 30, "overbought": 70, "rsi_ema_filter": 200},
            },
            {
                "id": "macd_signal",
                "name": "MACD Signal",
                "description": "MACD/sinyal hattı kesişimi",
                "params": {"fast": 12, "slow": 26, "signal": 9, "hist_threshold": 0},
            },
            {
                "id": "bollinger_bounce",
                "name": "Bollinger Bounce",
                "description": "Bollinger bandı sınır dokunuşu",
                "params": {"period": 20, "std_dev": 2.0, "squeeze": True},
            },
            {
                "id": "ut_bot",
                "name": "UT Bot Alert",
                "description": "ATR trailing stop kırılımı",
                "params": {"atr_period": 10, "atr_mult": 3.0, "heikin_ashi": False},
            },
            {
                "id": "supertrend",
                "name": "Supertrend",
                "description": "ATR tabanlı trend takip",
                "params": {"period": 10, "mult": 3.0},
            },
        ]
    }
