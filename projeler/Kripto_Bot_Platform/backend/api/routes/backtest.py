"""
Backtest API Endpoint'leri
──────────────────────────
- Strateji backtesti başlat
- DB'deki geçmiş verilerle simülasyon
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
import pandas as pd
from bot.backtester import BacktestEngine
from bot.grid_backtester import GridBacktestEngine
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher


def _compute_indicators(ohlcv: list, strategy: str, params: dict, step: int, extra: list | None = None) -> dict:
    """Grafik overlay için bar bar indikatör değerleri hesapla."""
    closes = [c[4] for c in ohlcv]
    timestamps = [c[0] // 1000 for c in ohlcv]
    s = pd.Series(closes)
    indicators: dict = {}

    def make_line(series: pd.Series) -> list:
        out = []
        for t, v in zip(timestamps, series):
            if pd.notna(v):
                out.append({"time": int(t), "value": round(float(v), 8)})
        return out[::step]

    if strategy in ("bb_ema_cross", "bollinger_bounce") or (strategy.startswith("grid_") and strategy not in ("grid_ema_trend", "grid_trend_score")):
        period  = int(params.get("bb_period") or params.get("period") or 20)
        std_dev = float(params.get("bb_std") or params.get("std_dev") or 2.0)
        sma   = s.rolling(period).mean()
        std   = s.rolling(period).std()
        indicators["bb_upper"] = make_line(sma + std_dev * std)
        indicators["bb_mid"]   = make_line(sma)
        indicators["bb_lower"] = make_line(sma - std_dev * std)

    if strategy == "grid_trend_score":
        # EMA 21/55/200 overlay
        indicators["custom_ema_21"] = make_line(s.ewm(span=21, adjust=False).mean())
        indicators["custom_ema_55"] = make_line(s.ewm(span=55, adjust=False).mean())
        indicators["custom_ema_200"] = make_line(s.ewm(span=200, adjust=False).mean())
        # Supertrend — grid backtester zaten hesaplıyor ve indicators'a ekliyor
        # BB overlay (referans olarak)
        period  = int(params.get("bb_period") or params.get("BB_Periyot") or 20)
        std_dev = float(params.get("bb_std") or params.get("BB_Sapma") or 2.0)
        sma   = s.rolling(period).mean()
        std   = s.rolling(period).std()
        indicators["bb_upper"] = make_line(sma + std_dev * std)
        indicators["bb_mid"]   = make_line(sma)
        indicators["bb_lower"] = make_line(sma - std_dev * std)

    if strategy == "grid_ema_trend":
        indicators["custom_ema_6"] = make_line(s.ewm(span=6, adjust=False).mean())
        indicators["custom_ema_14"] = make_line(s.ewm(span=14, adjust=False).mean())
        indicators["custom_ema_50"] = make_line(s.ewm(span=50, adjust=False).mean())
        indicators["custom_ema_200"] = make_line(s.ewm(span=200, adjust=False).mean())
        
        ema_exit_mode = params.get("ema_exit_mode", "ema_cross")
        if ema_exit_mode == "bollinger":
            period  = int(params.get("bb_period") or 20)
            std_dev = float(params.get("bb_std") or 2.0)
            sma   = s.rolling(period).mean()
            std   = s.rolling(period).std()
            indicators["bb_upper"] = make_line(sma + std_dev * std)
            indicators["bb_mid"]   = make_line(sma)
            indicators["bb_lower"] = make_line(sma - std_dev * std)

    if strategy == "bb_ema_cross":
        fast = int(params.get("ema_fast", 5))
        slow = int(params.get("ema_slow", 13))
        indicators["ema_fast"] = make_line(s.ewm(span=fast, adjust=False).mean())
        indicators["ema_slow"] = make_line(s.ewm(span=slow, adjust=False).mean())

    if strategy == "ema_cross":
        fast = int(params.get("fast_ema", 9))
        slow = int(params.get("slow_ema", 21))
        indicators["ema_fast"] = make_line(s.ewm(span=fast, adjust=False).mean())
        indicators["ema_slow"] = make_line(s.ewm(span=slow, adjust=False).mean())

    # Ekstra overlay indikatörler (kullanıcı seçimi)
    for ind in (extra or []):
        if ind.startswith("ema_"):
            try:
                period = int(ind.split("_")[1])
                key = f"custom_ema_{period}"
                if key not in indicators:
                    indicators[key] = make_line(s.ewm(span=period, adjust=False).mean())
            except (ValueError, IndexError):
                pass
        elif ind.startswith("bb_"):
            try:
                period = int(ind.split("_")[1])
                std_dev = float(ind.split("_")[2]) if len(ind.split("_")) > 2 else 2.0
                sma = s.rolling(period).mean()
                std = s.rolling(period).std()
                if f"custom_bb_{period}_upper" not in indicators:
                    indicators[f"custom_bb_{period}_upper"] = make_line(sma + std_dev * std)
                    indicators[f"custom_bb_{period}_mid"]   = make_line(sma)
                    indicators[f"custom_bb_{period}_lower"] = make_line(sma - std_dev * std)
            except (ValueError, IndexError):
                pass
        elif ind.startswith("sma_"):
            try:
                period = int(ind.split("_")[1])
                key = f"custom_sma_{period}"
                if key not in indicators:
                    indicators[key] = make_line(s.rolling(period).mean())
            except (ValueError, IndexError):
                pass

    return indicators

router = APIRouter(prefix="/backtest", tags=["backtest"])

_fetcher = DataFetcher(bitget)


class BacktestRequest(BaseModel):
    symbol: str = "BTC/USDT:USDT"
    timeframe: str = "1h"
    strategy: str = "ema_cross"
    days: int = Field(default=90, ge=7, le=365)
    initial_balance: float = Field(default=10000, ge=100)
    risk_per_trade: float = Field(default=0.02, ge=0.005, le=1000000.0)
    leverage: int = Field(default=3, ge=1, le=500)
    stop_loss_pct: float = Field(default=2.0, ge=0.1, le=50)
    take_profit_pct: float = Field(default=4.0, ge=0.1, le=200)
    fee_pct: float = Field(default=0.02, ge=0, le=0.5)  # MEXC Taker fee 0.02% per side
    params: dict = Field(default_factory=dict)
    overlay_indicators: list = Field(default_factory=list)


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

    if req.strategy.startswith("grid_"):
        grid_mode = req.strategy.replace("grid_", "")
        engine = GridBacktestEngine({
            "symbol": req.symbol,
            "grid_mode": grid_mode,
            "grid_direction": "auto" if grid_mode in ("bollinger", "hybrid", "bb_direction", "trend_score") else "long",
            "grid_count": req.params.get("Kademe", 20),
            "bb_period": req.params.get("BB_Periyot", 20),
            "bb_std_dev": req.params.get("BB_Sapma", 2.0),
            "initial_balance": req.initial_balance,
            "order_size": req.risk_per_trade,
            "budget_mode": req.params.get("budget_mode", "fixed"),
            "leverage": req.leverage,
            "fee_pct": req.fee_pct,
            "min_spread_pct": req.params.get("Min_Spread_Pct", 0.3),
            "ema_exit_mode": req.params.get("ema_exit_mode", "ema_cross"),
            "min_ema_pct": req.params.get("min_ema_pct", 1.0),
            "spread_pct": req.params.get("Spread_Pct", 1.5),
            "filters": req.params.get("filters", {"rsi_filter": True, "squeeze_filter": True, "midline_filter": True}),
            # Trend Score parametreleri
            "ts_entry_threshold": req.params.get("ts_entry_threshold", 4),
            "ts_exit_threshold": req.params.get("ts_exit_threshold", 1),
            "ts_adx_period": req.params.get("ts_adx_period", 14),
            "ts_adx_min": req.params.get("ts_adx_min", 20),
            "ts_supertrend_period": req.params.get("ts_supertrend_period", 10),
            "ts_supertrend_mult": req.params.get("ts_supertrend_mult", 3.0),
            "ts_divergence_lookback": req.params.get("ts_divergence_lookback", 14),
        })
    else:
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

    # Grafik için OHLCV verisi — tüm mumlar (boşluk oluşmasın)
    result["ohlcv"] = [
        {"time": c[0] // 1000, "open": c[1], "high": c[2], "low": c[3], "close": c[4]}
        for c in ohlcv
    ]

    # İndikatörler için step (performans — çizgide boşluk olmaz)
    ind_step = max(1, len(ohlcv) // 6000)
    computed_inds = _compute_indicators(ohlcv, req.strategy, req.params, ind_step, req.overlay_indicators)
    if "indicators" in result:
        result["indicators"].update(computed_inds)
    else:
        result["indicators"] = computed_inds

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
            {
                "id": "bb_ema_cross",
                "name": "BB-EMA Cross",
                "description": "Bollinger Band orta kesişim + EMA çaprazı giriş, EMA dokunuş yeniden giriş, BB band çıkışı",
                "params": {
                    "bb_period": 20, "bb_std": 2.0,
                    "ema_fast": 5, "ema_slow": 13,
                    "touch_pct": 0.3, "setup_lookback": 5,
                    "direction": "both", "exit_at_bands": True,
                },
            },
            {
                "id": "grid_bollinger",
                "name": "Bollinger Grid",
                "description": "Bollinger bantlarını grid sınırı olarak kullanan bot",
                "params": {"grid_count": 20, "bb_period": 20, "bb_std_dev": 2.0},
            },
            {
                "id": "grid_hybrid",
                "name": "Hibrit Grid (BB+Filtre)",
                "description": "Bollinger grid ve RSI/Squeeze filtreleri",
                "params": {"grid_count": 20, "bb_period": 20, "bb_std_dev": 2.0},
            },
            {
                "id": "grid_bb_direction",
                "name": "BB Yön (Oto Long/Short)",
                "description": "Tam otomatik yön değişimi, bant dokunuşu çıkışı",
                "params": {"grid_count": 20, "bb_period": 20, "bb_std_dev": 2.0},
            },
        ]
    }
