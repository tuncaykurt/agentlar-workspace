"""
Sinyal Sonuç Takipçisi
- outcome="open" olan sinyalleri periyodik kontrol eder
- Fiyat TP'ye ulaştıysa → tp_hit, SL'ye ulaştıysa → sl_hit
- 24 saatten eski açık sinyaller → expired
"""
import asyncio
from datetime import datetime, timedelta

import ccxt.async_support as ccxt
from sqlalchemy import select, update
from core.database import async_session
from models.trade import SignalLog


# Fiyat cache — aynı sembolü her sinyal için tekrar çekmemek için
_price_cache: dict[str, tuple[float, float]] = {}  # symbol → (price, timestamp)


async def _get_price(symbol: str) -> float | None:
    """CCXT ile güncel fiyat al (60sn cache)."""
    now = asyncio.get_event_loop().time()
    if symbol in _price_cache:
        price, ts = _price_cache[symbol]
        if now - ts < 60:
            return price

    exchange = ccxt.mexc({"options": {"defaultType": "swap"}})
    try:
        ticker = await exchange.fetch_ticker(symbol)
        price = float(ticker["last"])
        _price_cache[symbol] = (price, now)
        return price
    except Exception as e:
        print(f"[SignalTracker] Fiyat alınamadı {symbol}: {e}")
        return None
    finally:
        await exchange.close()


async def check_open_signals():
    """Açık sinyalleri kontrol et, TP/SL vuruşlarını kaydet."""
    async with async_session() as session:
        result = await session.execute(
            select(SignalLog).where(SignalLog.outcome == "open")
        )
        open_signals = result.scalars().all()

    if not open_signals:
        return

    now = datetime.utcnow()
    updates = []

    for sig in open_signals:
        # 24 saatten eski → expired
        if sig.created_at and (now - sig.created_at.replace(tzinfo=None)) > timedelta(hours=24):
            price = await _get_price(sig.symbol)
            pnl_pct = 0
            if price and sig.price:
                if sig.signal_type == "buy":
                    pnl_pct = round((price - sig.price) / sig.price * 100, 2)
                else:
                    pnl_pct = round((sig.price - price) / sig.price * 100, 2)
            updates.append({
                "id": sig.id,
                "outcome": "expired",
                "outcome_price": price,
                "outcome_pnl_pct": pnl_pct,
                "outcome_at": now,
            })
            continue

        if not sig.tp_price or not sig.sl_price or not sig.price:
            continue

        price = await _get_price(sig.symbol)
        if not price:
            continue

        outcome = None
        pnl_pct = 0

        if sig.signal_type == "buy":
            if price >= sig.tp_price:
                outcome = "tp_hit"
                pnl_pct = round((sig.tp_price - sig.price) / sig.price * 100, 2)
            elif price <= sig.sl_price:
                outcome = "sl_hit"
                pnl_pct = round((sig.sl_price - sig.price) / sig.price * 100, 2)
        else:  # sell / short
            if price <= sig.tp_price:
                outcome = "tp_hit"
                pnl_pct = round((sig.price - sig.tp_price) / sig.price * 100, 2)
            elif price >= sig.sl_price:
                outcome = "sl_hit"
                pnl_pct = round((sig.price - sig.sl_price) / sig.price * 100, 2)

        if outcome:
            updates.append({
                "id": sig.id,
                "outcome": outcome,
                "outcome_price": price,
                "outcome_pnl_pct": pnl_pct,
                "outcome_at": now,
            })

    # Toplu güncelleme
    if updates:
        async with async_session() as session:
            for u in updates:
                await session.execute(
                    update(SignalLog).where(SignalLog.id == u["id"]).values(
                        outcome=u["outcome"],
                        outcome_price=u["outcome_price"],
                        outcome_pnl_pct=u["outcome_pnl_pct"],
                        outcome_at=u["outcome_at"],
                    )
                )
            await session.commit()
        tp_count = sum(1 for u in updates if u["outcome"] == "tp_hit")
        sl_count = sum(1 for u in updates if u["outcome"] == "sl_hit")
        exp_count = sum(1 for u in updates if u["outcome"] == "expired")
        print(f"[SignalTracker] {len(updates)} sinyal güncellendi: TP={tp_count} SL={sl_count} Expired={exp_count}")


async def start_signal_tracker():
    """Arka plan görevi: her 60 saniyede açık sinyalleri kontrol et."""
    print("[SignalTracker] Sinyal sonuç takipçisi başlatıldı.")
    while True:
        try:
            await check_open_signals()
        except Exception as e:
            print(f"[SignalTracker] Hata: {e}")
        await asyncio.sleep(60)
