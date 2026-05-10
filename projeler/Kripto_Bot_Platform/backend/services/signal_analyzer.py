"""
Bot durumu bağımsız sinyal analizi servisi.
Gelen her sinyal için RSI/ATR/EMA200 hesaplar, filtreleri değerlendirir.
Bot pasifse analiz yapar ama işlem açmaz — action="analyzed" olarak kaydeder.
Bot aktifse engine zaten işliyor, bu sadece pasif botlar için devreye girer.
signal_tracker.py outcome="open" olan tüm kayıtları (analyzed dahil) TP/SL takip eder.
"""
import asyncio
import json
from sqlalchemy import select, update
from core.database import async_session
from models.trade import SignalLog, BotFilter


async def run_passive_analysis(
    log_id: int,
    bot_id: int,
    bot_exchange: str,
    symbol: str,
    signal_type: str,
    price: float,
    timeframe: str,
    tp_pct: float,
    sl_pct: float,
):
    """
    Pasif bot için sinyal analizi.
    RSI/ATR/EMA200 hesapla, filtreleri kontrol et, TP/SL hesapla.
    Sonucu SignalLog'a yaz (action='analyzed').
    """
    import ccxt.async_support as ccxt

    exchange_map = {
        "bitget":  lambda: ccxt.bitget({"options": {"defaultType": "swap"}}),
        "mexc":    lambda: ccxt.mexc({"options": {"defaultType": "swap"}}),
        "binance": lambda: ccxt.binance({"options": {"defaultType": "future"}}),
        "bybit":   lambda: ccxt.bybit({"options": {"defaultType": "swap"}}),
    }
    exchange = exchange_map.get(bot_exchange or "mexc", exchange_map["mexc"])()

    ohlcv = []
    rsi_14 = None
    volatility_atr = None
    ema200_dist = None
    analysis_lines = []

    try:
        tf = timeframe or "1h"
        try:
            ohlcv = await asyncio.wait_for(
                exchange.fetch_ohlcv(symbol, tf, limit=210), timeout=20
            )
        except Exception as e:
            print(f"[SignalAnalyzer] OHLCV alınamadı ({symbol} {tf}): {e}")

        if len(ohlcv) > 50:
            from ai.indicators import calculate_all
            ind = calculate_all(ohlcv)

            rsi   = ind.get("rsi")
            atr   = ind.get("atr")
            ema200 = ind.get("ema200")

            if rsi:
                rsi_14 = round(float(rsi), 2)
                analysis_lines.append(f"RSI: {rsi_14:.1f}")
            if atr:
                volatility_atr = round(float(atr), 6)
                analysis_lines.append(f"ATR: {volatility_atr:.4f}")
            if ema200 and ema200 > 0 and price > 0:
                ema200_dist = round((price - ema200) / ema200 * 100, 2)
                trend_ok = not (
                    (signal_type == "buy"  and price < ema200) or
                    (signal_type == "sell" and price > ema200)
                )
                analysis_lines.append(
                    f"EMA200[{'+' if trend_ok else '✗'}]: ema={ema200:.2f} dist={ema200_dist:+.2f}%"
                )

        # ── Filtre analizi (aktif olsun olmasın tüm filtreler değerlendirilir) ──
        filter_lines = []
        async with async_session() as session:
            res = await session.execute(
                select(BotFilter).where(BotFilter.bot_id == bot_id)
            )
            f = res.scalar_one_or_none()

        if not f:
            filter_lines.append("Filtre: yapılandırılmamış")
        else:
            # Haber koruması
            if f.news_protection_enabled:
                from services.economic_calendar import is_news_blackout
                blackout = await is_news_blackout(minutes_buffer=f.news_blackout_minutes or 30)
                if blackout.get("blackout"):
                    filter_lines.append(f"📰 Haber[✗ ENGEL]: {blackout.get('reason', '')}")
                else:
                    filter_lines.append("📰 Haber[✓ serbest]")
            else:
                filter_lines.append("📰 Haber[— kapalı]")

            # Saat filtresi
            if f.smart_hours_enabled and f.blocked_hours:
                import datetime as _dt
                try:
                    blocked = json.loads(f.blocked_hours)
                    cur_h = _dt.datetime.utcnow().hour
                    if cur_h in blocked:
                        filter_lines.append(f"🕐 Saat[✗ ENGEL]: {cur_h}:00 UTC")
                    else:
                        filter_lines.append(f"🕐 Saat[✓ {cur_h}:00 UTC]")
                except Exception:
                    filter_lines.append("🕐 Saat[aktif]")
            else:
                filter_lines.append("🕐 Saat[— kapalı]")

            # Volatilite filtresi
            if f.volatility_filter_enabled and f.max_volatility_atr and volatility_atr:
                if volatility_atr > f.max_volatility_atr:
                    filter_lines.append(f"⚡ Volatilite[✗ ENGEL]: ATR={volatility_atr:.4f} > {f.max_volatility_atr:.4f}")
                else:
                    filter_lines.append(f"⚡ Volatilite[✓ ATR={volatility_atr:.4f}]")
            else:
                filter_lines.append("⚡ Volatilite[— kapalı]")

            # Trend filtresi
            if ema200_dist is not None:
                if f.trend_filter_enabled:
                    trend_fail = (signal_type == "buy" and ema200_dist < 0) or \
                                 (signal_type == "sell" and ema200_dist > 0)
                    if trend_fail:
                        filter_lines.append(f"📈 Trend[✗ ENGEL]: dist={ema200_dist:+.2f}%")
                    else:
                        filter_lines.append(f"📈 Trend[✓ dist={ema200_dist:+.2f}%]")
                else:
                    filter_lines.append(f"📈 Trend[— kapalı] dist={ema200_dist:+.2f}%")
            else:
                filter_lines.append("📈 Trend[— kapalı]")

        full_analysis = " | ".join(analysis_lines + filter_lines)

        # TP/SL hesapla
        tp_price = None
        sl_price = None
        if tp_pct > 0 and sl_pct > 0 and price > 0:
            tp_s = min(tp_pct, 99)
            sl_s = min(sl_pct, 99)
            if signal_type == "buy":
                tp_price = round(price * (1 + tp_s / 100), 6)
                sl_price = round(price * (1 - sl_s / 100), 6)
            else:
                tp_price = round(price * (1 - tp_s / 100), 6)
                sl_price = round(price * (1 + sl_s / 100), 6)

        # SignalLog güncelle
        vals: dict = {
            "rsi_14":         rsi_14,
            "volatility_atr": volatility_atr,
            "ema200_dist":    ema200_dist,
            "reason":         full_analysis or "Pasif analiz tamamlandı",
            "action":         "analyzed",
        }
        if tp_price:
            vals["tp_price"] = tp_price
        if sl_price:
            vals["sl_price"] = sl_price
        if tp_price and sl_price:
            vals["outcome"] = "open"   # signal_tracker TP/SL sonucunu takip eder

        async with async_session() as session:
            await session.execute(
                update(SignalLog).where(SignalLog.id == log_id).values(**vals)
            )
            await session.commit()

        print(f"[SignalAnalyzer] Bot#{bot_id} analiz OK → {full_analysis[:120]}")

    except Exception as e:
        print(f"[SignalAnalyzer] Bot#{bot_id} analiz hatası: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            await exchange.close()
        except Exception:
            pass

async def finalize_previous_signal(
    bot_id: int,
    symbol: str,
    token: str,
    new_signal_price: float,
    bot_exchange: str = "mexc"
):
    """
    Yeni sinyal geldiğinde, bir önceki sinyalin:
    - Hala açıksa takibini sonlandırır (outcome='next_signal').
    - İki sinyal arasındaki maksimum/minimum fiyat hareketini ve max_favorable_pct'yi hesaplar.
    """
    import ccxt.async_support as ccxt
    from datetime import datetime
    
    now = datetime.utcnow()
    
    try:
        async with async_session() as session:
            # En sonki sinyali bul (yeni sinyal henüz DB'ye eklendiyse, kendisini bulmamak için id vs. kontrolü yapmalıyız. 
            # Ya da biz bu fonksiyonu yeni sinyali kaydetmeden hemen önce/sonra çağıracağız. Eğer sonra çağırırsak, created_at < now gibi bir filtre ile de alabiliriz.
            # En güvenlisi, outcome='open' olan en son sinyali veya genel olarak önceki sinyali bulmak.
            # Şimdilik sadece bot_id ve sembole ait EN SON sinyali getirelim (fakat yeni sinyal eklendiyse ondan bir öncekini).
            # Bunun yerine, outcome='open' olan TÜM önceki sinyalleri kapatmak daha mantıklı.
            query = select(SignalLog).where(
                SignalLog.symbol == symbol,
                SignalLog.outcome == "open"
            )
            if bot_id == 0:
                query = query.where(SignalLog.bot_id == 0, SignalLog.raw_payload.contains(token))
            else:
                query = query.where(SignalLog.bot_id == bot_id)
                
            result = await session.execute(query)
            open_signals = result.scalars().all()
            
            if not open_signals:
                return
                
        exchange_map = {
            "bitget":  lambda: ccxt.bitget({"options": {"defaultType": "swap"}}),
            "mexc":    lambda: ccxt.mexc({"options": {"defaultType": "swap"}}),
            "binance": lambda: ccxt.binance({"options": {"defaultType": "future"}}),
            "bybit":   lambda: ccxt.bybit({"options": {"defaultType": "swap"}}),
        }
        exchange = exchange_map.get(bot_exchange or "mexc", exchange_map["mexc"])()

        try:
            for sig in open_signals:
                start_ts = int(sig.created_at.timestamp() * 1000) if sig.created_at else None
                if not start_ts:
                    continue

                # OHLCV verisi çek (5m kullanarak limitleri aşmamaya çalışalım)
                ohlcv = []
                try:
                    ohlcv = await asyncio.wait_for(
                        exchange.fetch_ohlcv(symbol, "5m", since=start_ts, limit=1000),
                        timeout=15
                    )
                except Exception as e:
                    print(f"[SignalAnalyzer] finalize_previous_signal OHLCV hatası: {e}")

                max_p = new_signal_price
                min_p = new_signal_price

                if ohlcv:
                    highs = [candle[2] for candle in ohlcv]
                    lows = [candle[3] for candle in ohlcv]
                    if highs: max_p = max(highs)
                    if lows:  min_p = min(lows)

                max_fav_pct = 0
                max_adv_pct = 0
                pnl_pct = 0
                if sig.price and sig.price > 0:
                    if sig.signal_type == "buy":
                        max_fav_pct = round((max_p - sig.price) / sig.price * 100, 2)
                        max_adv_pct = round((min_p - sig.price) / sig.price * 100, 2)
                        pnl_pct = round((new_signal_price - sig.price) / sig.price * 100, 2)
                    else:
                        max_fav_pct = round((sig.price - min_p) / sig.price * 100, 2)
                        max_adv_pct = round((sig.price - max_p) / sig.price * 100, 2)
                        pnl_pct = round((sig.price - new_signal_price) / sig.price * 100, 2)

                async with async_session() as session:
                    await session.execute(
                        update(SignalLog).where(SignalLog.id == sig.id).values(
                            outcome="next_signal",
                            outcome_price=new_signal_price,
                            outcome_pnl_pct=pnl_pct,
                            outcome_at=now,
                            max_price_in_range=max_p,
                            min_price_in_range=min_p,
                            max_favorable_pct=max_fav_pct,
                            max_adverse_pct=max_adv_pct
                        )
                    )
                    await session.commit()
                    print(f"[SignalAnalyzer] Önceki sinyal kapatıldı #{sig.id}: PnL={pnl_pct}%, MaxFav={max_fav_pct}%, MaxAdv={max_adv_pct}%")

        finally:
            await exchange.close()

    except Exception as e:
        print(f"[SignalAnalyzer] finalize_previous_signal genel hata: {e}")

