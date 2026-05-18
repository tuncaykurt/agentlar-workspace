"""
Coin veri API — zero-fee coinlerin anlık gösterge verileri.
CoinCollector arka plan servisi tarafından toplanan veriler.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models.trade import CoinSnapshot
from typing import Optional

router = APIRouter(tags=["Coins"])


@router.get("/coins/snapshots")
async def get_coin_snapshots(
    exchange: str = "mexc",
    zero_fee_only: bool = True,
    sort_by: str = "base",              # base, rsi_14, atr_pct, volume_ratio, price_change_24h
    sort_dir: str = "asc",              # asc, desc
    search: Optional[str] = None,       # base coin arama
    min_rsi: Optional[float] = None,
    max_rsi: Optional[float] = None,
    min_volume_ratio: Optional[float] = None,
    trend: Optional[str] = None,        # bullish, bearish
    db: AsyncSession = Depends(get_db),
):
    """
    Toplanan coin snapshot verilerini döndürür.
    Filtreleme, sıralama ve arama destekler.
    """
    query = select(CoinSnapshot).where(CoinSnapshot.exchange == exchange)

    if zero_fee_only:
        query = query.where(CoinSnapshot.zero_fee == True)

    if search:
        query = query.where(CoinSnapshot.base.ilike(f"%{search}%"))

    if min_rsi is not None:
        query = query.where(CoinSnapshot.rsi_14 >= min_rsi)
    if max_rsi is not None:
        query = query.where(CoinSnapshot.rsi_14 <= max_rsi)

    if min_volume_ratio is not None:
        query = query.where(CoinSnapshot.volume_ratio >= min_volume_ratio)

    if trend == "bullish":
        query = query.where(CoinSnapshot.supertrend_dir == 1)
    elif trend == "bearish":
        query = query.where(CoinSnapshot.supertrend_dir == -1)

    # Sıralama
    sort_col = getattr(CoinSnapshot, sort_by, CoinSnapshot.base)
    if sort_dir == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(sort_col)

    result = await db.execute(query)
    snapshots = result.scalars().all()

    items = []
    for s in snapshots:
        items.append({
            "symbol": s.symbol,
            "base": s.base,
            "price": s.price,
            "price_change_1h": s.price_change_1h,
            "price_change_24h": s.price_change_24h,
            "rsi_14": s.rsi_14,
            "atr": s.atr,
            "atr_pct": s.atr_pct,
            "ema200": s.ema200,
            "ema200_dist": s.ema200_dist,
            "macd_hist": s.macd_hist,
            "supertrend_dir": s.supertrend_dir,
            "adx": s.adx,
            "volume_ratio": s.volume_ratio,
            "bb_upper": s.bb_upper,
            "bb_lower": s.bb_lower,
            "zero_fee": s.zero_fee,
            "taker_fee": s.taker_fee,
            "maker_fee": s.maker_fee,
            "max_leverage": s.max_leverage,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        })

    return {
        "total": len(items),
        "exchange": exchange,
        "items": items,
    }


@router.get("/coins/summary")
async def get_coins_summary(
    exchange: str = "mexc",
    db: AsyncSession = Depends(get_db),
):
    """Zero-fee coinlerin özet istatistikleri."""
    result = await db.execute(
        select(CoinSnapshot).where(
            CoinSnapshot.exchange == exchange,
            CoinSnapshot.zero_fee == True,
        )
    )
    snapshots = result.scalars().all()

    if not snapshots:
        return {"total": 0, "message": "Henuz veri toplanmadi. Collector 5dk aralikla calisir."}

    rsi_values = [s.rsi_14 for s in snapshots if s.rsi_14]
    atr_values = [s.atr_pct for s in snapshots if s.atr_pct]
    bullish = sum(1 for s in snapshots if s.supertrend_dir == 1)
    bearish = sum(1 for s in snapshots if s.supertrend_dir == -1)

    # En yüksek hacim oranı olan coinler (aktif hareket)
    by_volume = sorted(
        [s for s in snapshots if s.volume_ratio],
        key=lambda s: s.volume_ratio, reverse=True
    )[:5]

    # RSI aşırı bölgeler
    oversold = [s for s in snapshots if s.rsi_14 and s.rsi_14 < 30]
    overbought = [s for s in snapshots if s.rsi_14 and s.rsi_14 > 70]

    return {
        "total": len(snapshots),
        "bullish_count": bullish,
        "bearish_count": bearish,
        "avg_rsi": round(sum(rsi_values) / len(rsi_values), 1) if rsi_values else None,
        "avg_atr_pct": round(sum(atr_values) / len(atr_values), 4) if atr_values else None,
        "oversold_coins": [{"base": s.base, "rsi": s.rsi_14, "price": s.price} for s in oversold],
        "overbought_coins": [{"base": s.base, "rsi": s.rsi_14, "price": s.price} for s in overbought],
        "high_volume_coins": [{"base": s.base, "vol_ratio": s.volume_ratio, "price": s.price} for s in by_volume],
        "updated_at": max((s.updated_at for s in snapshots if s.updated_at), default=None),
    }
