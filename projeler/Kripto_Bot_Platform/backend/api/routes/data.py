"""
Geçmiş Veri API Endpoint'leri
─────────────────────────────
- Geçmiş veri çekme tetikleme
- Senkronizasyon
- DB istatistikleri
- OHLCV sorgulama
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher
from services.liquidation_collector import get_liquidation_heatmap, get_liquidation_stats

router = APIRouter(prefix="/data", tags=["data"])

fetcher = DataFetcher(bitget)


class FetchHistoricalRequest(BaseModel):
    symbol: str = "BTC/USDT:USDT"
    timeframe: str = "1h"
    days: int = Field(default=90, ge=1, le=365)


class FetchAllRequest(BaseModel):
    symbols: list[str] = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
    timeframes: list[str] = ["1h", "4h", "1d"]
    days: int = Field(default=90, ge=1, le=365)


@router.post("/fetch-historical")
async def fetch_historical(req: FetchHistoricalRequest):
    """Geçmişe dönük veri çek ve DB'ye yaz."""
    count = await fetcher.fetch_historical(req.symbol, req.timeframe, req.days)
    return {"symbol": req.symbol, "timeframe": req.timeframe, "days": req.days, "candles_written": count}


@router.post("/fetch-all")
async def fetch_all(req: FetchAllRequest):
    """Birden fazla sembol ve timeframe için toplu geçmiş veri çek."""
    count = await fetcher.fetch_all(req.symbols, req.timeframes, req.days)
    return {"symbols": req.symbols, "timeframes": req.timeframes, "days": req.days, "total_candles": count}


@router.post("/sync")
async def sync_latest(
    symbol: str = Query(default="BTC/USDT:USDT"),
    timeframe: str = Query(default="1h"),
):
    """Son eksik mumları senkronize et."""
    count = await fetcher.sync_latest(symbol, timeframe)
    return {"symbol": symbol, "timeframe": timeframe, "new_candles": count}


@router.post("/sync-all")
async def sync_all(
    symbols: str = Query(default="BTC/USDT:USDT,ETH/USDT:USDT"),
    timeframes: str = Query(default="1h,4h"),
):
    """Tüm sembol + timeframe çiftlerini senkronize et."""
    sym_list = [s.strip() for s in symbols.split(",")]
    tf_list = [t.strip() for t in timeframes.split(",")]
    count = await fetcher.sync_all(sym_list, tf_list)
    return {"symbols": sym_list, "timeframes": tf_list, "new_candles": count}


@router.get("/stats")
async def get_stats():
    """DB'deki veri istatistikleri: sembol başına mum sayısı ve tarih aralığı."""
    stats = await fetcher.get_stats()
    return {"data": stats}


@router.get("/ohlcv")
async def get_ohlcv(
    symbol: str = Query(default="BTC/USDT:USDT"),
    timeframe: str = Query(default="1h"),
    limit: int = Query(default=200, ge=1, le=5000),
    days: int = Query(default=0, ge=0, le=365),
):
    """
    OHLCV verisi getir (3 katmanlı: Redis → DB → Borsa).
    Chart ve indikatör hesaplamaları için kullanılır.
    days > 0 verilirse limit otomatik hesaplanır.
    """
    if days > 0:
        hours_per_candle = {"1m": 1/60, "5m": 5/60, "15m": 0.25, "1h": 1, "4h": 4, "1d": 24}
        hpc = hours_per_candle.get(timeframe, 1)
        limit = min(5000, int((days * 24) / hpc) + 50)
    candles = await fetcher.get_ohlcv(symbol, timeframe, limit)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "count": len(candles),
        "candles": [
            {
                "time": c[0] // 1000,
                "open": c[1],
                "high": c[2],
                "low": c[3],
                "close": c[4],
                "volume": c[5],
            }
            for c in candles
        ],
    }


@router.get("/liquidations")
async def liquidation_heatmap(
    symbol: str = Query(default="BTC/USDT:USDT"),
    hours: int = Query(default=24, ge=1, le=168),
):
    """Likidasyon heatmap — DB'deki gerçek verilerden."""
    heatmap = await get_liquidation_heatmap(symbol, hours)
    stats = await get_liquidation_stats(symbol)
    return {"heatmap": heatmap, "stats": stats, "symbol": symbol}
