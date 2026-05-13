"""
Sinyal Sonuç Takipçisi
- outcome="open" olan sinyalleri periyodik kontrol eder
- Fiyat TP'ye ulaştıysa → tp_hit, SL'ye ulaştıysa → sl_hit
- Fiyat aralığını gerçek zamanlı günceller (max_price_in_range, min_price_in_range)
- 72 saatten eski açık sinyaller → expired
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
        print(f"[SignalTracker] Fiyat alinamadi {symbol}: {e}")
        return None
    finally:
        try:
            await exchange.close()
        except Exception:
            pass


async def check_open_signals():
    """Açık sinyalleri kontrol et, TP/SL vuruşlarını ve fiyat aralığını kaydet."""
    async with async_session() as session:
        result = await session.execute(
            select(SignalLog).where(SignalLog.outcome == "open")
        )
        open_signals = result.scalars().all()

    if not open_signals:
        return

    now = datetime.utcnow()
    closed_updates = []    # outcome değişecekler
    range_updates = []     # sadece range güncellenecekler

    for sig in open_signals:
        # 72 saatten eski → expired
        if sig.created_at and (now - sig.created_at.replace(tzinfo=None)) > timedelta(hours=72):
            price = await _get_price(sig.symbol)
            pnl_pct = 0.0
            if price and sig.price:
                if sig.signal_type == "buy":
                    pnl_pct = round((price - sig.price) / sig.price * 100, 2)
                else:
                    pnl_pct = round((sig.price - price) / sig.price * 100, 2)
            closed_updates.append({
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

        is_long = sig.signal_type == "buy"

        # Fiyat aralığını güncelle
        cur_max = sig.max_price_in_range or price
        cur_min = sig.min_price_in_range or price
        new_max = max(cur_max, price)
        new_min = min(cur_min, price)

        if is_long:
            max_fav_pct   = round((new_max - sig.price) / sig.price * 100, 2)
            tp_reachable  = new_max >= sig.tp_price
            sl_was_hit_val= new_min <= sig.sl_price
        else:
            max_fav_pct   = round((sig.price - new_min) / sig.price * 100, 2)
            tp_reachable  = new_min <= sig.tp_price
            sl_was_hit_val= new_max >= sig.sl_price

        # TP/SL tetiklendi mi?
        # Hem anlık fiyatı hem de şimdiye kadarki min/max aralığını kontrol et
        # (30s aralıkta fiyat TP/SL'yi geçip geri dönebilir)
        outcome = None
        pnl_pct = 0.0

        if is_long:
            sl_touched = new_min <= sig.sl_price
            tp_touched = new_max >= sig.tp_price
            if sl_touched and tp_touched:
                # İkisi de vurulduysa, mevcut fiyata göre karar ver
                if price <= sig.sl_price:
                    outcome = "sl_hit"
                elif price >= sig.tp_price:
                    outcome = "tp_hit"
                else:
                    # Fiyat ortada — SL önce vurulmuş olma ihtimali daha yüksek (min daha düşük)
                    outcome = "sl_hit"
            elif sl_touched:
                outcome = "sl_hit"
            elif tp_touched:
                outcome = "tp_hit"

            if outcome == "tp_hit":
                pnl_pct = round((sig.tp_price - sig.price) / sig.price * 100, 2)
            elif outcome == "sl_hit":
                pnl_pct = round((sig.sl_price - sig.price) / sig.price * 100, 2)
        else:
            sl_touched = new_max >= sig.sl_price
            tp_touched = new_min <= sig.tp_price
            if sl_touched and tp_touched:
                if price >= sig.sl_price:
                    outcome = "sl_hit"
                elif price <= sig.tp_price:
                    outcome = "tp_hit"
                else:
                    outcome = "sl_hit"
            elif sl_touched:
                outcome = "sl_hit"
            elif tp_touched:
                outcome = "tp_hit"

            if outcome == "tp_hit":
                pnl_pct = round((sig.price - sig.tp_price) / sig.price * 100, 2)
            elif outcome == "sl_hit":
                pnl_pct = round((sig.price - sig.sl_price) / sig.price * 100, 2)

        common_range = {
            "max_price_in_range": new_max,
            "min_price_in_range": new_min,
            "max_favorable_pct":  max_fav_pct,
            "tp_was_reachable":   tp_reachable,
            "sl_was_hit":         sl_was_hit_val,
        }

        if outcome:
            closed_updates.append({
                "id": sig.id,
                "outcome": outcome,
                "outcome_price": price,
                "outcome_pnl_pct": pnl_pct,
                "outcome_at": now,
                **common_range,
            })
        else:
            range_updates.append({"id": sig.id, **common_range})

    # Toplu güncelleme
    if closed_updates or range_updates:
        async with async_session() as session:
            for u in closed_updates:
                uid = u.pop("id")
                await session.execute(
                    update(SignalLog).where(SignalLog.id == uid).values(**u)
                )
            for u in range_updates:
                uid = u.pop("id")
                await session.execute(
                    update(SignalLog).where(SignalLog.id == uid).values(**u)
                )
            await session.commit()

        tp_c  = sum(1 for u in closed_updates if u.get("outcome") == "tp_hit")
        sl_c  = sum(1 for u in closed_updates if u.get("outcome") == "sl_hit")
        exp_c = sum(1 for u in closed_updates if u.get("outcome") == "expired")
        if closed_updates:
            print(f"[SignalTracker] {len(closed_updates)} sinyal kapandi: TP={tp_c} SL={sl_c} Expired={exp_c}")
        if range_updates:
            print(f"[SignalTracker] {len(range_updates)} sinyalin fiyat araligi guncellendi")


async def start_signal_tracker():
    """Arka plan gorevi: her 30 saniyede acik sinyalleri kontrol et."""
    print("[SignalTracker] Sinyal sonuc takipcisi basladi (30s aralik).")
    while True:
        try:
            await check_open_signals()
        except Exception as e:
            print(f"[SignalTracker] Hata: {e}")
        await asyncio.sleep(30)
