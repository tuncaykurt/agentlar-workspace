"""
Scanner Simülatör — Bot açmadan AI/Manuel seçim sonuçlarını takip eder.

Akış:
1. coin_snapshots'tan verileri oku
2. AI veya Manuel mod ile coin seç (gerçek scanner ile aynı mantık)
3. "Sanal işlem" aç → scanner_simulations tablosuna yaz
4. Açık simülasyonları kontrol et: TP/SL hit mi? → sonucu kaydet
5. AI öğrenme: geçmiş sonuçları yeni prompt'a besle

Bot açmadan çalışır, sadece gözlem ve öğrenme amaçlıdır.
"""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import ccxt.async_support as ccxt
from sqlalchemy import text as sql_text

from core.database import async_session
from core.redis_client import get_redis
from core.config import settings
from bot.strategies.smart_scanner import (
    ManualCriteria, score_coin_manual, build_ai_prompt, determine_trade_direction, clamp_tp_sl
)


async def _get_price_from_redis(symbol: str) -> float | None:
    """Redis'ten MEXC WebSocket fiyatını oku. Yoksa None döner (REST fallback gerekir)."""
    try:
        redis = get_redis()
        raw = await redis.get(f"ticker:mexc:{symbol}")
        if raw:
            data = json.loads(raw)
            price = float(data.get("last", 0))
            if price > 0:
                return price
    except Exception:
        pass
    return None


async def _get_price(symbol: str, exchange=None) -> float | None:
    """Önce Redis (WebSocket), yoksa REST fallback ile fiyat al."""
    # 1. Redis (WebSocket-fed) — anlık, ~0ms
    price = await _get_price_from_redis(symbol)
    if price:
        return price

    # 2. REST fallback — yavaş (~1-3s)
    if exchange:
        try:
            ticker = await asyncio.wait_for(exchange.fetch_ticker(symbol), timeout=8)
            return float(ticker["last"])
        except Exception:
            pass
    return None


# Simülasyon ayarları
SIM_INTERVAL = 120          # tarama aralığı (sn)
SIM_MAX_OPEN = 5            # aynı anda max açık simülasyon
SIM_EXPIRY_HOURS = 24       # kapanmamış simülasyonlar bu sürede expire olur
SIM_MARGIN = 100            # her simülasyonda sanal $100 margin
SIM_LEVERAGE = 50           # varsayılan kaldıraç
SIM_TP_PCT = 1.5
SIM_SL_PCT = 0.8
SIM_MODE = "ai"             # "ai" veya "manual"
SIM_MIN_CONFIDENCE = 65     # AI mod minimum güven

# ─── Portföy Yönetimi ────────────────────────────────────────────────────

PORTFOLIO_KEY = "scanner_sim:portfolio"


async def _get_portfolio(redis) -> dict:
    """Redis'ten sanal portföy durumunu oku."""
    raw = await redis.get(PORTFOLIO_KEY)
    if raw:
        return json.loads(raw)
    return {
        "initial_balance": 1000.0,   # Başlangıç bakiyesi
        "balance": 1000.0,           # Mevcut kullanılabilir bakiye
        "reserved": 0.0,             # Açık işlemlerde bağlı margin
        "total_pnl": 0.0,           # Toplam gerçekleşen PnL
        "peak_equity": 1000.0,       # En yüksek equity (drawdown için)
        "max_drawdown": 0.0,         # En büyük drawdown %
        "total_trades": 0,
        "total_wins": 0,
    }


async def _save_portfolio(redis, portfolio: dict):
    """Portföy durumunu Redis'e kaydet."""
    await redis.set(PORTFOLIO_KEY, json.dumps(portfolio))


async def _calculate_margin(cfg: dict, portfolio: dict, leverage: int) -> float:
    """İşlem için kullanılacak margin'i hesapla."""
    mode = cfg.get("trade_size_mode", "fixed")  # fixed / percent / auto_exchange
    value = cfg.get("trade_size_value", 100)     # $ veya %

    if mode == "percent":
        # Mevcut bakiyenin yüzdesi
        equity = portfolio["balance"] + portfolio["reserved"]
        margin = equity * value / 100
    elif mode in ["auto_exchange", "exchange_pct"]:
        # Global simülatör gerçek bir borsaya bağlı değil, sanal portföyü baz al
        margin = portfolio["balance"] * value / 100
    else:
        # Sabit miktar
        margin = float(value)

    # Bakiye kontrolü — yeterli yoksa küçült
    available = portfolio["balance"]
    if margin > available:
        margin = available

    return round(margin, 2)


async def _reserve_margin(redis, margin: float) -> bool:
    """Portföyden margin ayır. Yeterli bakiye yoksa False döner."""
    portfolio = await _get_portfolio(redis)
    if portfolio["balance"] < margin:
        return False
    portfolio["balance"] -= margin
    portfolio["reserved"] += margin
    await _save_portfolio(redis, portfolio)
    return True


async def _release_margin(redis, margin: float, pnl: float):
    """İşlem kapanınca margin'i geri bırak + PnL uygula."""
    portfolio = await _get_portfolio(redis)
    portfolio["reserved"] = max(0, portfolio["reserved"] - margin)
    portfolio["balance"] += margin + pnl
    portfolio["total_pnl"] += pnl
    portfolio["total_trades"] += 1
    if pnl > 0:
        portfolio["total_wins"] += 1

    # Equity & drawdown takibi
    equity = portfolio["balance"] + portfolio["reserved"]
    if equity > portfolio["peak_equity"]:
        portfolio["peak_equity"] = equity
    if portfolio["peak_equity"] > 0:
        dd = (portfolio["peak_equity"] - equity) / portfolio["peak_equity"] * 100
        if dd > portfolio["max_drawdown"]:
            portfolio["max_drawdown"] = round(dd, 2)

    await _save_portfolio(redis, portfolio)


async def _get_sim_settings(redis) -> dict:
    """Redis'ten simülasyon ayarlarını oku (frontend'den değiştirilebilir)."""
    raw = await redis.get("scanner_sim:settings")
    if raw:
        return json.loads(raw)
    return {
        "enabled": True,
        "mode": SIM_MODE,
        "interval": SIM_INTERVAL,
        "leverage": SIM_LEVERAGE,
        "min_leverage": 3,
        "max_leverage": 75,
        "tp_pct": SIM_TP_PCT,
        "sl_pct": SIM_SL_PCT,
        "auto_scale_tp_sl": True,       # Kaldıraca göre TP/SL otomatik ölçekle
        "scale_base_leverage": 10,       # Baz kaldıraç (bu değerde TP/SL aynen kalır)
        "trailing_enabled": False,       # Trailing stop aktif mi
        "trailing_activate_pct": 0.3,    # Kâr bu %'ye ulaşınca trailing aktif
        "trailing_callback_pct": 0.15,   # Zirveden bu % geri çekilince kapat
        "min_confidence": SIM_MIN_CONFIDENCE,
        "max_open": SIM_MAX_OPEN,
        "expiry_hours": SIM_EXPIRY_HOURS,
        # Hedge modu
        "hedge_enabled": False,          # Hedge modu aktif mi
        "hedge_tp_pct": 0.4,             # Hedge TP %
        "hedge_sl_pct": 0.1,             # Hedge SL %
        "hedge_use_max_leverage": True,   # Coinin max kaldıracını kullan
        "hedge_min_atr_pct": 0.3,        # Min volatilite (hedge için)
        "hedge_min_volume_ratio": 1.5,    # Min hacim (likidite için)
        # Portföy yönetimi
        "portfolio_enabled": True,        # Portföy takibi aktif mi
        "trade_size_mode": "fixed",       # fixed / percent / auto_exchange
        "trade_size_value": 100,          # $ veya % (moda göre)
    }


async def _get_coins_from_db() -> list[dict]:
    """coin_snapshots'tan tüm zero-fee coinleri oku. Yeni kolonlar yoksa da çalışır."""
    async with async_session() as session:
        # funding_rate/fear_greed kolonları henüz yoksa hata vermemesi için
        # önce kolon varlığını kontrol et
        has_funding = False
        try:
            test = await session.execute(sql_text(
                "SELECT funding_rate FROM coin_snapshots LIMIT 1"
            ))
            has_funding = True
        except Exception:
            await session.rollback()

        if has_funding:
            result = await session.execute(sql_text("""
                SELECT base, symbol, price, price_change_1h, price_change_24h,
                       rsi_14, atr, atr_pct, ema200, ema200_dist,
                       macd_hist, supertrend_dir, adx, volume_ratio,
                       bb_upper, bb_lower, max_leverage, zero_fee,
                       funding_rate, fear_greed
                FROM coin_snapshots
                WHERE zero_fee = true AND price > 0
                ORDER BY updated_at DESC
            """))
        else:
            result = await session.execute(sql_text("""
                SELECT base, symbol, price, price_change_1h, price_change_24h,
                       rsi_14, atr, atr_pct, ema200, ema200_dist,
                       macd_hist, supertrend_dir, adx, volume_ratio,
                       bb_upper, bb_lower, max_leverage, zero_fee
                FROM coin_snapshots
                WHERE zero_fee = true AND price > 0
                ORDER BY updated_at DESC
            """))
        rows = result.fetchall()

    coins = []
    for r in rows:
        coin = {
            "base": r[0], "symbol": r[1], "price": float(r[2] or 0),
            "price_change_1h": float(r[3]) if r[3] else None,
            "price_change_24h": float(r[4]) if r[4] else None,
            "rsi_14": float(r[5]) if r[5] else None,
            "atr": float(r[6]) if r[6] else None,
            "atr_pct": float(r[7]) if r[7] else None,
            "ema200": float(r[8]) if r[8] else None,
            "ema200_dist": float(r[9]) if r[9] else None,
            "macd_hist": float(r[10]) if r[10] else None,
            "supertrend_dir": int(r[11]) if r[11] is not None else None,
            "adx": float(r[12]) if r[12] else None,
            "volume_ratio": float(r[13]) if r[13] else None,
            "bb_upper": float(r[14]) if r[14] else None,
            "bb_lower": float(r[15]) if r[15] else None,
            "max_leverage": int(r[16]) if r[16] else None,
            "zero_fee": bool(r[17]),
            "funding_rate": None,
            "fear_greed": None,
        }
        if has_funding:
            coin["funding_rate"] = float(r[18]) if r[18] is not None else None
            coin["fear_greed"] = int(r[19]) if r[19] is not None else None
        coins.append(coin)
    return coins


async def _get_open_sims() -> list[dict]:
    """Açık simülasyonları getir."""
    # margin_usdt kolonu var mı kontrol
    has_margin = False
    try:
        async with async_session() as sess:
            await sess.execute(sql_text("SELECT margin_usdt FROM scanner_simulations LIMIT 0"))
            has_margin = True
    except Exception:
        pass

    margin_col = ", margin_usdt" if has_margin else ""
    async with async_session() as session:
        result = await session.execute(sql_text(f"""
            SELECT id, coin, symbol, direction, entry_price, tp_price, sl_price,
                   leverage, created_at, max_favorable_pct, max_adverse_pct, first_move{margin_col}
            FROM scanner_simulations
            WHERE status = 'open'
            ORDER BY created_at DESC
        """))
        cols = ["id", "coin", "symbol", "direction", "entry_price", "tp_price", "sl_price",
                "leverage", "created_at", "max_favorable_pct", "max_adverse_pct", "first_move"]
        if has_margin:
            cols.append("margin_usdt")
        rows = []
        for row in result.fetchall():
            d = dict(zip(cols, row))
            if not has_margin:
                d["margin_usdt"] = SIM_MARGIN
            rows.append(d)
        return rows


async def _get_past_results(limit: int = 50) -> list[dict]:
    """AI öğrenme için geçmiş simülasyon sonuçlarını getir (genişletilmiş)."""
    async with async_session() as session:
        result = await session.execute(sql_text("""
            SELECT coin, direction, confidence, entry_price, exit_price,
                   pnl_pct, status, reason, ai_review,
                   rsi_14, adx, funding_rate, fear_greed,
                   exit_reason, duration_minutes, first_move, first_move_pct,
                   leverage, max_favorable_pct, max_adverse_pct,
                   volume_ratio, atr_pct, supertrend_dir, tp_pct, sl_pct,
                   closed_at
            FROM scanner_simulations
            WHERE status IN ('win', 'loss')
            ORDER BY closed_at DESC
            LIMIT :limit
        """), {"limit": limit})
        cols = ["coin", "direction", "confidence", "entry_price", "exit_price",
                "pnl_pct", "status", "reason", "ai_review",
                "rsi_14", "adx", "funding_rate", "fear_greed",
                "exit_reason", "duration_minutes", "first_move", "first_move_pct",
                "leverage", "max_favorable_pct", "max_adverse_pct",
                "volume_ratio", "atr_pct", "supertrend_dir", "tp_pct", "sl_pct",
                "closed_at"]
        rows = []
        for row in result.fetchall():
            try:
                rows.append(dict(zip(cols, row)))
            except Exception:
                # Eski tablo yapısı — eksik kolonları None ile doldur
                d = dict(zip(cols[:len(row)], row))
                for c in cols[len(row):]:
                    d[c] = None
                rows.append(d)
        return rows


def _build_learning_context(past_results: list[dict], leverage_range: tuple = None) -> str:
    """
    Geçmiş sonuçlardan AI öğrenme metni oluştur.
    Gösterge-bazlı pattern analizi ile hangi koşullarda kazanıp kaybettiğini tespit eder.
    leverage_range: (min, max) — bot config'den gelen kaldıraç aralığı
    """
    if not past_results:
        return ""

    wins = [r for r in past_results if r["status"] == "win"]
    losses = [r for r in past_results if r["status"] == "loss"]
    total = len(past_results)
    win_rate = len(wins) / total * 100 if total else 0
    avg_win = sum(r["pnl_pct"] or 0 for r in wins) / max(1, len(wins))
    avg_loss = sum(abs(r["pnl_pct"] or 0) for r in losses) / max(1, len(losses))
    total_pnl = sum(r["pnl_pct"] or 0 for r in past_results)

    # ── 1. Yön bazlı analiz ──
    long_trades = [r for r in past_results if r["direction"] == "long"]
    short_trades = [r for r in past_results if r["direction"] == "short"]
    long_wins = len([r for r in long_trades if r["status"] == "win"])
    short_wins = len([r for r in short_trades if r["status"] == "win"])

    # ── 2. Coin bazlı performans (genişletilmiş) ──
    coin_stats = {}
    for r in past_results:
        c = r["coin"]
        if c not in coin_stats:
            coin_stats[c] = {"win": 0, "loss": 0, "pnl": 0}
        coin_stats[c][r["status"]] += 1
        coin_stats[c]["pnl"] += (r["pnl_pct"] or 0)

    best_coins = sorted(coin_stats.items(),
                        key=lambda x: x[1]["pnl"], reverse=True)[:5]
    worst_coins = sorted(coin_stats.items(),
                         key=lambda x: x[1]["pnl"])[:3]

    # ── 3. RSI BÖLGE ANALİZİ — En kritik öğrenme ──
    rsi_buckets = {
        "aşırı_düşük (RSI<20)": {"range": (0, 20), "wins": 0, "total": 0, "pnl": 0},
        "düşük (RSI 20-30)": {"range": (20, 30), "wins": 0, "total": 0, "pnl": 0},
        "nötr_düşük (RSI 30-45)": {"range": (30, 45), "wins": 0, "total": 0, "pnl": 0},
        "nötr (RSI 45-55)": {"range": (45, 55), "wins": 0, "total": 0, "pnl": 0},
        "nötr_yüksek (RSI 55-70)": {"range": (55, 70), "wins": 0, "total": 0, "pnl": 0},
        "yüksek (RSI 70-80)": {"range": (70, 80), "wins": 0, "total": 0, "pnl": 0},
        "aşırı_yüksek (RSI>80)": {"range": (80, 100), "wins": 0, "total": 0, "pnl": 0},
    }
    for r in past_results:
        rsi = r.get("rsi_14")
        if rsi is None:
            continue
        for name, bucket in rsi_buckets.items():
            lo, hi = bucket["range"]
            if lo <= rsi < hi:
                bucket["total"] += 1
                if r["status"] == "win":
                    bucket["wins"] += 1
                bucket["pnl"] += (r["pnl_pct"] or 0)
                break

    rsi_lines = []
    for name, b in rsi_buckets.items():
        if b["total"] >= 2:
            wr = round(b["wins"] / b["total"] * 100)
            rsi_lines.append(f"  {name}: {b['total']} işlem → %{wr} kazanma, Net: %{b['pnl']:+.1f}")

    # ── 4. ADX (TREND GÜCÜ) ANALİZİ ──
    adx_buckets = {
        "zayıf_trend (ADX<20)": (0, 20),
        "orta_trend (ADX 20-30)": (20, 30),
        "güçlü_trend (ADX 30-50)": (30, 50),
        "çok_güçlü (ADX>50)": (50, 200),
    }
    adx_lines = []
    for name, (lo, hi) in adx_buckets.items():
        bucket = [r for r in past_results if r.get("adx") is not None and lo <= r["adx"] < hi]
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            bp = sum(r["pnl_pct"] or 0 for r in bucket)
            adx_lines.append(f"  {name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma, Net: %{bp:+.1f}")

    # ── 5. VOLATİLİTE (ATR%) ANALİZİ ──
    atr_lines = []
    atr_buckets = {"düşük_vol (ATR<2%)": (0, 2), "orta_vol (ATR 2-5%)": (2, 5), "yüksek_vol (ATR>5%)": (5, 100)}
    for name, (lo, hi) in atr_buckets.items():
        bucket = [r for r in past_results if r.get("atr_pct") is not None and lo <= r["atr_pct"] < hi]
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            bp = sum(r["pnl_pct"] or 0 for r in bucket)
            atr_lines.append(f"  {name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma, Net: %{bp:+.1f}")

    # ── 6. HACIM ORANI ANALİZİ ──
    vol_lines = []
    vol_buckets = {"düşük_hacim (<1x)": (0, 1), "normal_hacim (1-2x)": (1, 2), "yüksek_hacim (>2x)": (2, 100)}
    for name, (lo, hi) in vol_buckets.items():
        bucket = [r for r in past_results if r.get("volume_ratio") is not None and lo <= r["volume_ratio"] < hi]
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            bp = sum(r["pnl_pct"] or 0 for r in bucket)
            vol_lines.append(f"  {name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma, Net: %{bp:+.1f}")

    # ── 7. TREND YÖNÜ ANALİZİ (Supertrend) ──
    trend_up = [r for r in past_results if r.get("supertrend_dir") == 1]
    trend_down = [r for r in past_results if r.get("supertrend_dir") == -1]
    trend_lines = []
    if len(trend_up) >= 2:
        tw = len([r for r in trend_up if r["status"] == "win"])
        trend_lines.append(f"  Supertrend YUKARI: {len(trend_up)} işlem → %{round(tw/len(trend_up)*100)} kazanma")
    if len(trend_down) >= 2:
        tw = len([r for r in trend_down if r["status"] == "win"])
        trend_lines.append(f"  Supertrend AŞAĞI: {len(trend_down)} işlem → %{round(tw/len(trend_down)*100)} kazanma")

    # ── 8. FEAR & GREED ANALİZİ ──
    fg_buckets = {"aşırı_korku (0-25)": (0, 25), "korku (25-45)": (25, 45), "nötr (45-55)": (45, 55),
                  "açgözlülük (55-75)": (55, 75), "aşırı_açgözlülük (75-100)": (75, 101)}
    fg_lines = []
    for name, (lo, hi) in fg_buckets.items():
        bucket = [r for r in past_results if r.get("fear_greed") is not None and lo <= r["fear_greed"] < hi]
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            fg_lines.append(f"  {name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma")

    # ── 9. KALDIRAC ANALİZİ (dinamik — bot config'e göre) ──
    min_lev = leverage_range[0] if leverage_range else 3
    max_lev = leverage_range[1] if leverage_range else 75
    lev_span = max_lev - min_lev
    if lev_span <= 0:
        lev_span = 1
    # 4 eşit dilime böl
    q1 = min_lev + lev_span // 4
    q2 = min_lev + lev_span // 2
    q3 = min_lev + (3 * lev_span) // 4
    lev_buckets = {
        f"düşük ({min_lev}-{q1}x)": (min_lev, q1 + 1),
        f"orta ({q1+1}-{q2}x)": (q1 + 1, q2 + 1),
        f"yüksek ({q2+1}-{q3}x)": (q2 + 1, q3 + 1),
        f"çok_yüksek ({q3+1}-{max_lev}x)": (q3 + 1, max_lev + 1),
    }
    lev_lines = []
    for name, (lo, hi) in lev_buckets.items():
        bucket = [r for r in past_results if r.get("leverage") is not None and lo <= r["leverage"] < hi]
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            bp = sum(r["pnl_pct"] or 0 for r in bucket)
            lev_lines.append(f"  {name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma, Net: %{bp:+.1f}")

    # ── 10. İLK HAREKET ANALİZİ ──
    first_move_data = [r for r in past_results if r.get("first_move")]
    fm_favorable = [r for r in first_move_data if r["first_move"] == "favorable"]
    fm_adverse = [r for r in first_move_data if r["first_move"] == "adverse"]
    fm_fav_wins = len([r for r in fm_favorable if r["status"] == "win"])
    fm_adv_wins = len([r for r in fm_adverse if r["status"] == "win"])

    # ── 11. SÜRE ANALİZİ ──
    durations = [r["duration_minutes"] for r in past_results if r.get("duration_minutes")]
    avg_dur = sum(durations) / max(1, len(durations)) if durations else 0
    win_durs = [r["duration_minutes"] for r in wins if r.get("duration_minutes")]
    loss_durs = [r["duration_minutes"] for r in losses if r.get("duration_minutes")]
    avg_win_dur = sum(win_durs) / max(1, len(win_durs)) if win_durs else 0
    avg_loss_dur = sum(loss_durs) / max(1, len(loss_durs)) if loss_durs else 0

    # ── 12. TP/SL OPTİMİZASYON ANALİZİ ──
    tp_sl_lines = []
    # Kayıplardan: max_favorable_pct > 0 olan — TP'ye ulaşmadan döndü mü?
    missed_tp = [r for r in losses if (r.get("max_favorable_pct") or 0) > 0.5]
    if missed_tp:
        avg_missed = sum(r["max_favorable_pct"] for r in missed_tp) / len(missed_tp)
        tp_sl_lines.append(f"  {len(missed_tp)} kayıptan fiyat ortalama %{avg_missed:.1f} lehte gidip geri döndü → TP daha dar olmalı mı?")
    # Kazançlardan: max_adverse_pct yüksek olanlar — SL çok yakın olsaydı stop olurdu
    close_sl = [r for r in wins if (r.get("max_adverse_pct") or 0) > 1.5]
    if close_sl:
        avg_adverse = sum(r["max_adverse_pct"] for r in close_sl) / len(close_sl)
        tp_sl_lines.append(f"  {len(close_sl)} kazançta fiyat ortalama %{avg_adverse:.1f} aleyhte gidip sonra kazandı → SL çok dar koyma")

    # ── 13. KOMBİNASYON PATTERN'LERİ — En değerli öğrenme ──
    pattern_lines = []
    # RSI düşük + trend yukarı + LONG = ?
    combo1 = [r for r in past_results if r.get("rsi_14") and r["rsi_14"] < 35 and r.get("supertrend_dir") == 1 and r["direction"] == "long"]
    if len(combo1) >= 2:
        cw = len([r for r in combo1 if r["status"] == "win"])
        pattern_lines.append(f"  RSI<35 + Trend↑ + LONG: {len(combo1)} işlem → %{round(cw/len(combo1)*100)} kazanma {'✅ GÜÇLÜ' if cw/len(combo1) > 0.6 else '⚠️ ZAYIF'}")
    # RSI yüksek + trend aşağı + SHORT
    combo2 = [r for r in past_results if r.get("rsi_14") and r["rsi_14"] > 65 and r.get("supertrend_dir") == -1 and r["direction"] == "short"]
    if len(combo2) >= 2:
        cw = len([r for r in combo2 if r["status"] == "win"])
        pattern_lines.append(f"  RSI>65 + Trend↓ + SHORT: {len(combo2)} işlem → %{round(cw/len(combo2)*100)} kazanma {'✅ GÜÇLÜ' if cw/len(combo2) > 0.6 else '⚠️ ZAYIF'}")
    # Güçlü trend + yüksek hacim
    combo3 = [r for r in past_results if r.get("adx") and r["adx"] > 30 and r.get("volume_ratio") and r["volume_ratio"] > 1.5]
    if len(combo3) >= 2:
        cw = len([r for r in combo3 if r["status"] == "win"])
        pattern_lines.append(f"  ADX>30 + Hacim>1.5x: {len(combo3)} işlem → %{round(cw/len(combo3)*100)} kazanma {'✅ GÜÇLÜ' if cw/len(combo3) > 0.6 else '⚠️ ZAYIF'}")
    # Düşük volatilite girişleri
    combo4 = [r for r in past_results if r.get("atr_pct") and r["atr_pct"] < 2]
    if len(combo4) >= 2:
        cw = len([r for r in combo4 if r["status"] == "win"])
        pattern_lines.append(f"  Düşük volatilite (ATR<2%): {len(combo4)} işlem → %{round(cw/len(combo4)*100)} kazanma")
    # Negatif funding + LONG (kalabalığın tersine)
    combo5 = [r for r in past_results if r.get("funding_rate") is not None and r["funding_rate"] < -0.01 and r["direction"] == "long"]
    if len(combo5) >= 2:
        cw = len([r for r in combo5 if r["status"] == "win"])
        pattern_lines.append(f"  Negatif funding + LONG (kontrarian): {len(combo5)} işlem → %{round(cw/len(combo5)*100)} kazanma")

    # ── 14. SAAT/GÜN BAZLI SESSION ANALİZİ ──
    session_lines = []
    hour_buckets = {
        "Asya (00-08 UTC)": (0, 8),
        "Avrupa (08-14 UTC)": (8, 14),
        "ABD (14-21 UTC)": (14, 21),
        "Gece (21-00 UTC)": (21, 24),
    }
    for ses_name, (h_lo, h_hi) in hour_buckets.items():
        bucket = []
        for r in past_results:
            ca = r.get("closed_at")
            if ca is None:
                continue
            try:
                if hasattr(ca, 'hour'):
                    h = ca.hour
                else:
                    from datetime import datetime as _dt
                    h = _dt.fromisoformat(str(ca).replace("Z", "+00:00")).hour
                if h_lo <= h < h_hi:
                    bucket.append(r)
            except Exception:
                continue
        if len(bucket) >= 2:
            bw = len([r for r in bucket if r["status"] == "win"])
            bp = sum(r["pnl_pct"] or 0 for r in bucket)
            session_lines.append(f"  {ses_name}: {len(bucket)} işlem → %{round(bw/len(bucket)*100)} kazanma, Net: %{bp:+.1f}")

    # Hafta günü analizi
    day_buckets = {}
    for r in past_results:
        ca = r.get("closed_at")
        if ca is None:
            continue
        try:
            if hasattr(ca, 'weekday'):
                wd = ca.weekday()
            else:
                from datetime import datetime as _dt
                wd = _dt.fromisoformat(str(ca).replace("Z", "+00:00")).weekday()
            day_name = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][wd]
            day_buckets.setdefault(day_name, []).append(r)
        except Exception:
            continue
    day_lines = []
    for day_name, trades in sorted(day_buckets.items(), key=lambda x: len(x[1]), reverse=True):
        if len(trades) >= 2:
            dw = len([r for r in trades if r["status"] == "win"])
            dp = sum(r["pnl_pct"] or 0 for r in trades)
            day_lines.append(f"  {day_name}: {len(trades)} işlem → %{round(dw/len(trades)*100)} kazanma, Net: %{dp:+.1f}")

    # ── 15. COİN KATEGORİ BAZLI ÖĞRENME ──
    major_coins = {"BTC", "ETH"}
    mid_coins = {"SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI"}
    cat_buckets = {"Major (BTC/ETH)": [], "Mid-Cap": [], "Altcoin": []}
    for r in past_results:
        coin = r.get("coin", "")
        if coin in major_coins:
            cat_buckets["Major (BTC/ETH)"].append(r)
        elif coin in mid_coins:
            cat_buckets["Mid-Cap"].append(r)
        else:
            cat_buckets["Altcoin"].append(r)
    cat_lines = []
    for cat_name, trades in cat_buckets.items():
        if len(trades) >= 2:
            cw = len([r for r in trades if r["status"] == "win"])
            cp = sum(r["pnl_pct"] or 0 for r in trades)
            avg_lev = sum(r.get("leverage") or 0 for r in trades) / max(1, len(trades))
            cat_lines.append(f"  {cat_name}: {len(trades)} işlem → %{round(cw/len(trades)*100)} kazanma, Net: %{cp:+.1f}, Ort.Kaldıraç: {avg_lev:.0f}x")

    # ── 16. DRAWDOWN KORUMA — Ardışık kayıp tespiti ──
    consecutive_losses = 0
    max_consecutive_losses = 0
    recent_streak = 0  # son streak (negatif = kayıp, pozitif = kazanç)
    for r in past_results:
        if r["status"] == "loss":
            consecutive_losses += 1
            max_consecutive_losses = max(max_consecutive_losses, consecutive_losses)
        else:
            consecutive_losses = 0
    # Son 5 trade'in streak'i
    last_5 = past_results[:5]
    last_5_losses = sum(1 for r in last_5 if r["status"] == "loss")
    drawdown_mode = last_5_losses >= 4  # Son 5'te 4+ kayıp = savunmacı mod
    drawdown_lines = []
    drawdown_lines.append(f"  Max ardışık kayıp: {max_consecutive_losses}")
    drawdown_lines.append(f"  Son 5 işlem: {5 - last_5_losses}W/{last_5_losses}L")
    if drawdown_mode:
        drawdown_lines.append(f"  🔴 SAVUNMACI MOD AKTİF — Son 5 işlemde {last_5_losses} kayıp! Düşük kaldıraç + yüksek güven eşiği kullan")

    # ── 17. FUNDING RATE DERİN ANALİZ ──
    funding_lines = []
    # Agresif funding (>0.03% veya <-0.03%)
    high_pos_funding = [r for r in past_results if r.get("funding_rate") is not None and r["funding_rate"] > 0.03]
    high_neg_funding = [r for r in past_results if r.get("funding_rate") is not None and r["funding_rate"] < -0.03]
    normal_funding = [r for r in past_results if r.get("funding_rate") is not None and abs(r["funding_rate"]) <= 0.03]
    if len(high_pos_funding) >= 2:
        fw = len([r for r in high_pos_funding if r["status"] == "win"])
        long_in_high = [r for r in high_pos_funding if r["direction"] == "long"]
        short_in_high = [r for r in high_pos_funding if r["direction"] == "short"]
        funding_lines.append(f"  Yüksek pozitif funding (>0.03%): {len(high_pos_funding)} işlem → %{round(fw/len(high_pos_funding)*100)} kazanma")
        if len(long_in_high) >= 1 and len(short_in_high) >= 1:
            lw = sum(1 for r in long_in_high if r["status"] == "win")
            sw = sum(1 for r in short_in_high if r["status"] == "win")
            funding_lines.append(f"    → LONG: %{round(lw/max(1,len(long_in_high))*100)} | SHORT: %{round(sw/max(1,len(short_in_high))*100)}")
    if len(high_neg_funding) >= 2:
        fw = len([r for r in high_neg_funding if r["status"] == "win"])
        funding_lines.append(f"  Yüksek negatif funding (<-0.03%): {len(high_neg_funding)} işlem → %{round(fw/len(high_neg_funding)*100)} kazanma")
    if len(normal_funding) >= 2:
        fw = len([r for r in normal_funding if r["status"] == "win"])
        funding_lines.append(f"  Normal funding (±0.03%): {len(normal_funding)} işlem → %{round(fw/len(normal_funding)*100)} kazanma")

    # Son 8 işlem detayı (genişletilmiş)
    recent_lines = []
    for r in past_results[:8]:
        emoji = "✅" if r["status"] == "win" else "❌"
        pnl = f"{r['pnl_pct']:+.2f}%" if r["pnl_pct"] else "?"
        exit_r = r.get("exit_reason", "?")
        dur = f"{r.get('duration_minutes', '?')}dk"
        fm = "→lehte" if r.get("first_move") == "favorable" else "→aleyhte" if r.get("first_move") == "adverse" else ""
        lev = f"{r.get('leverage', '?')}x"
        recent_lines.append(
            f"  {emoji} {r['coin']} {r['direction'].upper()} {lev} → {r['status']}[{exit_r}] ({pnl}) "
            f"[{dur}] {fm} RSI={r.get('rsi_14','?')} ADX={r.get('adx','?')} ATR={r.get('atr_pct','?')}%"
        )

    # ── KURALLARI ÇIKAR — En önemli kısım ──
    rules = []
    # RSI kuralı
    best_rsi = None
    best_rsi_wr = 0
    for name, b in rsi_buckets.items():
        if b["total"] >= 3:
            wr = b["wins"] / b["total"]
            if wr > best_rsi_wr:
                best_rsi_wr = wr
                best_rsi = name
    if best_rsi and best_rsi_wr > 0.55:
        rules.append(f"→ EN İYİ RSI BÖLGESİ: {best_rsi} (%{round(best_rsi_wr*100)} kazanma) — bu bölgedeki coinleri öncelikle seç")

    worst_rsi = None
    worst_rsi_wr = 1.0
    for name, b in rsi_buckets.items():
        if b["total"] >= 3:
            wr = b["wins"] / b["total"]
            if wr < worst_rsi_wr:
                worst_rsi_wr = wr
                worst_rsi = name
    if worst_rsi and worst_rsi_wr < 0.4:
        rules.append(f"→ KAÇIN: {worst_rsi} (%{round(worst_rsi_wr*100)} kazanma) — bu RSI bölgesinde işlem AÇMA")

    # Yön kuralı
    if len(long_trades) >= 5 and len(short_trades) >= 5:
        long_wr = long_wins / len(long_trades)
        short_wr = short_wins / len(short_trades)
        if long_wr > short_wr + 0.15:
            rules.append(f"→ LONG daha başarılı (%{round(long_wr*100)} vs %{round(short_wr*100)}) — LONG pozisyonları tercih et")
        elif short_wr > long_wr + 0.15:
            rules.append(f"→ SHORT daha başarılı (%{round(short_wr*100)} vs %{round(long_wr*100)}) — SHORT pozisyonları tercih et")

    # Kaldıraç kuralı
    for name, (lo, hi) in lev_buckets.items():
        bucket = [r for r in past_results if r.get("leverage") is not None and lo <= r["leverage"] < hi]
        if len(bucket) >= 3:
            bw = len([r for r in bucket if r["status"] == "win"])
            wr = bw / len(bucket)
            if wr < 0.35:
                rules.append(f"→ {name} kaldıraçta kazanma oranı çok düşük (%{round(wr*100)}) — bu aralıktan KAÇIN")

    return f"""
═══════════════════════════════════════════════════════════════
   GEÇMİŞ SİMÜLASYON ANALİZİ — GÖSTERGE BAZLI ÖĞRENME
═══════════════════════════════════════════════════════════════
Toplam: {total} işlem | Win Rate: %{win_rate:.0f} ({len(wins)}W/{len(losses)}L) | Net PnL: %{total_pnl:+.1f}
Ort. Kazanç: %{avg_win:.2f} | Ort. Kayıp: %{avg_loss:.2f}
Long: {long_wins}/{len(long_trades)} başarılı | Short: {short_wins}/{len(short_trades)} başarılı

───────── RSI BÖLGELERİNE GÖRE PERFORMANS ─────────
{chr(10).join(rsi_lines) if rsi_lines else '  Yeterli veri yok'}

───────── TREND GÜCÜNE GÖRE (ADX) ─────────
{chr(10).join(adx_lines) if adx_lines else '  Yeterli veri yok'}

───────── VOLATİLİTEYE GÖRE (ATR%) ─────────
{chr(10).join(atr_lines) if atr_lines else '  Yeterli veri yok'}

───────── HACİM ORANINA GÖRE ─────────
{chr(10).join(vol_lines) if vol_lines else '  Yeterli veri yok'}

───────── TREND YÖNÜNE GÖRE (Supertrend) ─────────
{chr(10).join(trend_lines) if trend_lines else '  Yeterli veri yok'}

───────── FEAR & GREED ENDEKSİ ─────────
{chr(10).join(fg_lines) if fg_lines else '  Yeterli veri yok'}

───────── KALDIRAC PERFORMANSI ─────────
{chr(10).join(lev_lines) if lev_lines else '  Yeterli veri yok'}

───────── KOMBİNASYON PATTERN'LERİ (Çoklu Gösterge) ─────────
{chr(10).join(pattern_lines) if pattern_lines else '  Yeterli veri yok'}

───────── TP/SL OPTİMİZASYON İPUÇLARI ─────────
{chr(10).join(tp_sl_lines) if tp_sl_lines else '  Yeterli veri yok'}

───────── İLK HAREKET ANALİZİ ─────────
{'  Lehte: ' + str(len(fm_favorable)) + ' → ' + str(fm_fav_wins) + 'W (%' + str(round(fm_fav_wins/max(1,len(fm_favorable))*100)) + ')' if fm_favorable else ''}{chr(10)}{'  Aleyhte: ' + str(len(fm_adverse)) + ' → ' + str(fm_adv_wins) + 'W (%' + str(round(fm_adv_wins/max(1,len(fm_adverse))*100)) + ')' if fm_adverse else ''}

───────── SÜRE ANALİZİ ─────────
  Ort: {avg_dur:.0f}dk | Kazançlar: {avg_win_dur:.0f}dk | Kayıplar: {avg_loss_dur:.0f}dk

───────── SAAT/SESSION ANALİZİ ─────────
{chr(10).join(session_lines) if session_lines else '  Yeterli veri yok'}
  Gün bazlı:
{chr(10).join(day_lines) if day_lines else '  Yeterli veri yok'}

───────── COİN KATEGORİ PERFORMANSI ─────────
{chr(10).join(cat_lines) if cat_lines else '  Yeterli veri yok'}

───────── DRAWDOWN / KAYIP SERİSİ ─────────
{chr(10).join(drawdown_lines)}

───────── FUNDING RATE DERİN ANALİZ ─────────
{chr(10).join(funding_lines) if funding_lines else '  Yeterli veri yok'}

───────── EN İYİ / EN KÖTÜ COİNLER ─────────
  En Kârlı: {', '.join(f"{c[0]}(%{c[1]['pnl']:+.1f})" for c in best_coins) if best_coins else '-'}
  En Zararlı: {', '.join(f"{c[0]}(%{c[1]['pnl']:+.1f})" for c in worst_coins) if worst_coins else '-'}

───────── SON 8 İŞLEM ─────────
{chr(10).join(recent_lines) if recent_lines else '  Henüz sonuç yok'}

{'═' * 63}
  🎯 VERİDEN ÇIKARILAN KURALLAR (BUNLARA MUTLAKA UY!)
{'═' * 63}
{chr(10).join(rules) if rules else '→ Henüz yeterli veri yok, kural çıkarılamadı'}
→ Yukarıdaki pattern verilerine göre coin ve yön seçimini optimize et
→ Kaybettiren kombinasyonlardan KAÇIN, kazandıran pattern'leri TEKRARLA
→ TP/SL ipuçlarına dikkat et — gereksiz yere geniş TP veya dar SL koyma
"""


def _extract_rules_summary(past_results: list[dict], leverage_range: tuple = None) -> str:
    """
    Geçmiş veriden çıkarılan kritik kuralları kısa özet olarak döndür.
    Prompt'un BAŞINA eklenir — AI'ın ilk okuduğu şey olur.
    leverage_range: (min, max) — bot config'den gelen kaldıraç aralığı
    """
    if len(past_results) < 5:
        return ""

    rules = []
    wins = [r for r in past_results if r["status"] == "win"]
    total = len(past_results)
    win_rate = len(wins) / total * 100

    # Genel uyarı
    if win_rate < 40:
        rules.append(f"⚠️ Genel kazanma oranın %{win_rate:.0f} — ÇOK SEÇİCİ OL, sadece en güçlü sinyalleri seç!")
    elif win_rate > 65:
        rules.append(f"✅ Kazanma oranın %{win_rate:.0f} — mevcut strateji çalışıyor, benzer pattern'leri devam ettir")

    # RSI kuralı
    rsi_zones = {}
    for r in past_results:
        rsi = r.get("rsi_14")
        if rsi is None:
            continue
        zone = "oversold" if rsi < 30 else "overbought" if rsi > 70 else "mid"
        rsi_zones.setdefault(zone, []).append(r["status"] == "win")
    for zone, results in rsi_zones.items():
        if len(results) >= 3:
            wr = sum(results) / len(results)
            label = {"oversold": "RSI<30 (aşırı satım)", "overbought": "RSI>70 (aşırı alım)", "mid": "RSI 30-70 (nötr)"}[zone]
            if wr < 0.35:
                rules.append(f"🚫 {label} bölgesinde kazanma oranın düşük (%{round(wr*100)}) — bu bölgede İŞLEM AÇMA")
            elif wr > 0.65:
                rules.append(f"🎯 {label} bölgesinde başarılısın (%{round(wr*100)}) — bu bölgeye ODAKLAN")

    # Yön kuralı
    long_t = [r for r in past_results if r["direction"] == "long"]
    short_t = [r for r in past_results if r["direction"] == "short"]
    if len(long_t) >= 5 and len(short_t) >= 5:
        long_wr = sum(1 for r in long_t if r["status"] == "win") / len(long_t)
        short_wr = sum(1 for r in short_t if r["status"] == "win") / len(short_t)
        if long_wr > short_wr + 0.2:
            rules.append(f"📈 LONG pozisyonlar çok daha başarılı (%{round(long_wr*100)} vs %{round(short_wr*100)}) — LONG tercih et")
        elif short_wr > long_wr + 0.2:
            rules.append(f"📉 SHORT pozisyonlar daha başarılı (%{round(short_wr*100)} vs %{round(long_wr*100)}) — SHORT tercih et")

    # Kaldıraç kuralı — dinamik aralıklara göre
    min_lev = leverage_range[0] if leverage_range else 3
    max_lev = leverage_range[1] if leverage_range else 75
    mid_lev = (min_lev + max_lev) // 2
    # Üst yarı vs alt yarı karşılaştırması
    upper_half = [r for r in past_results if r.get("leverage") is not None and r["leverage"] > mid_lev]
    lower_half = [r for r in past_results if r.get("leverage") is not None and r["leverage"] <= mid_lev]
    if len(upper_half) >= 3 and len(lower_half) >= 3:
        upper_wr = sum(1 for r in upper_half if r["status"] == "win") / len(upper_half)
        lower_wr = sum(1 for r in lower_half if r["status"] == "win") / len(lower_half)
        if upper_wr < lower_wr - 0.15:
            rules.append(f"⚠️ Yüksek kaldıraç (>{mid_lev}x) daha başarısız (%{round(upper_wr*100)} vs %{round(lower_wr*100)}) — kaldıracı {mid_lev}x altında tut")
        elif upper_wr > lower_wr + 0.15:
            rules.append(f"💪 Yüksek kaldıraç (>{mid_lev}x) daha başarılı (%{round(upper_wr*100)} vs %{round(lower_wr*100)}) — kaldıracı artırabilirsin")

    # Drawdown koruması — son 5 trade ardışık kayıp kontrolü
    last_5 = past_results[:5]
    last_5_losses = sum(1 for r in last_5 if r["status"] == "loss")
    if last_5_losses >= 4:
        rules.append(f"🔴 SAVUNMACI MOD: Son 5 işlemde {last_5_losses} kayıp! Düşük kaldıraç ({min_lev}-{mid_lev}x) + sadece %75+ güvenli sinyaller seç")
    elif last_5_losses >= 3:
        rules.append(f"⚠️ DİKKAT: Son 5 işlemde {last_5_losses} kayıp — temkinli ol, kaldıracı düşük tut")

    # Coin kategori kuralı
    major_coins = {"BTC", "ETH"}
    mid_coins = {"SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI"}
    cat_stats = {}
    for cat_name, coin_set in [("major", major_coins), ("mid", mid_coins)]:
        cat_trades = [r for r in past_results if r.get("coin", "") in coin_set]
        if len(cat_trades) >= 3:
            cwr = sum(1 for r in cat_trades if r["status"] == "win") / len(cat_trades)
            cat_stats[cat_name] = cwr
    alt_trades = [r for r in past_results if r.get("coin", "") not in major_coins and r.get("coin", "") not in mid_coins]
    if len(alt_trades) >= 3:
        cat_stats["alt"] = sum(1 for r in alt_trades if r["status"] == "win") / len(alt_trades)
    # En başarılı kategori
    if cat_stats:
        best_cat = max(cat_stats, key=cat_stats.get)
        worst_cat = min(cat_stats, key=cat_stats.get)
        cat_label = {"major": "Major (BTC/ETH)", "mid": "Mid-Cap", "alt": "Altcoin"}
        if cat_stats[best_cat] > cat_stats[worst_cat] + 0.15:
            rules.append(f"🎯 {cat_label.get(best_cat, best_cat)} coinlerde başarı daha yüksek (%{round(cat_stats[best_cat]*100)}) — bu kategoriyi öncelikle seç")

    # Session kuralı
    session_stats = {}
    for ses_name, (h_lo, h_hi) in [("Asya (00-08)", (0, 8)), ("Avrupa (08-14)", (8, 14)),
                                     ("ABD (14-21)", (14, 21)), ("Gece (21-00)", (21, 24))]:
        bucket = []
        for r in past_results:
            ca = r.get("closed_at")
            if ca is None:
                continue
            try:
                h = ca.hour if hasattr(ca, 'hour') else None
                if h is not None and h_lo <= h < h_hi:
                    bucket.append(r)
            except Exception:
                continue
        if len(bucket) >= 3:
            swr = sum(1 for r in bucket if r["status"] == "win") / len(bucket)
            session_stats[ses_name] = (swr, len(bucket))
    # En kötü session uyarısı
    for ses, (swr, cnt) in session_stats.items():
        if swr < 0.30:
            rules.append(f"🚫 {ses} session'ında kazanma oranı çok düşük (%{round(swr*100)}, {cnt} işlem) — bu saatlerde DİKKATLİ OL")
        elif swr > 0.70:
            rules.append(f"✅ {ses} session'ında başarılısın (%{round(swr*100)}, {cnt} işlem)")

    # Agresif funding kuralı
    high_funding = [r for r in past_results if r.get("funding_rate") is not None and abs(r["funding_rate"]) > 0.03]
    if len(high_funding) >= 3:
        hfw = sum(1 for r in high_funding if r["status"] == "win") / len(high_funding)
        if hfw < 0.35:
            rules.append(f"⚠️ Agresif funding (>0.03%) dönemlerinde kayıp oranı yüksek (%{round((1-hfw)*100)}) — bu dönemlerde kaldıracı düşür")

    if not rules:
        return ""

    return (
        "🔴 KRİTİK: Aşağıdaki kurallar geçmiş {total} işlemden çıkarıldı. MUTLAKA UY!\n"
        + "\n".join(rules)
        + "\n" + "─" * 60
    ).replace("{total}", str(total))


async def _run_selection(coins: list[dict], cfg: dict, open_sims: list[dict],
                         past_results: list[dict]) -> list[dict]:
    """AI veya Manuel mod ile coin seç."""
    from ai.openrouter import _call

    mode = cfg.get("mode", "ai")
    active_coins = [s["coin"] for s in open_sims]
    available = [c for c in coins if c["base"] not in active_coins]

    selections = []

    if mode == "ai":
        # AI ön-filtreleme
        def _interest_score(c):
            s = 0
            rsi = c.get("rsi_14")
            if rsi and (rsi < 30 or rsi > 70): s += 20
            if rsi and (rsi < 20 or rsi > 80): s += 15
            adx = c.get("adx")
            if adx and adx > 25: s += 15
            vol = c.get("volume_ratio")
            if vol and vol > 2: s += 15
            atr = c.get("atr_pct")
            if atr and atr > 0.5: s += 10
            funding = c.get("funding_rate")
            if funding and abs(funding) > 0.03: s += 12
            return s

        available.sort(key=_interest_score, reverse=True)
        top = available[:20]

        # Prompt oluştur — öğrenme bağlamı ile zenginleştirilmiş
        lev_range = (cfg.get("min_leverage", 3), cfg.get("max_leverage", 75))
        max_open = cfg.get("max_open", SIM_MAX_OPEN)
        remaining_slots = max_open - len(active_coins)
        # past_performance dict oluştur (prompt'un kendi bölümünde kullanacak)
        _sim_perf = None
        if past_results:
            _wins = [r for r in past_results if r["status"] == "win"]
            _losses = [r for r in past_results if r["status"] == "loss"]
            _strat_map = {}
            for r in past_results:
                er = r.get("exit_reason", "") or ""
                cat = "trailing" if "TRAILING" in er.upper() else "hedge" if "HEDGE" in er.upper() else "normal_tp_sl"
                _strat_map.setdefault(cat, []).append(float(r.get("pnl_pct") or 0))
            _by_strat = {}
            for cat, pnls in _strat_map.items():
                wc = sum(1 for p in pnls if p > 0)
                _by_strat[cat] = {"count": len(pnls), "win_rate": wc / len(pnls) * 100, "avg_pnl": sum(pnls) / len(pnls)}
            _sim_perf = {
                "total": len(past_results), "wins": len(_wins), "losses": len(_losses),
                "win_rate": len(_wins) / len(past_results) * 100,
                "avg_win_pct": sum(r.get("pnl_pct", 0) or 0 for r in _wins) / max(1, len(_wins)),
                "avg_loss_pct": sum(r.get("pnl_pct", 0) or 0 for r in _losses) / max(1, len(_losses)),
                "total_pnl_pct": sum(r.get("pnl_pct", 0) or 0 for r in past_results),
                "by_strategy": _by_strat,
                "recent_trades": [
                    {"coin": r["coin"], "direction": r["direction"], "leverage": r.get("leverage"),
                     "pnl_pct": r.get("pnl_pct", 0), "exit_reason": r.get("exit_reason", "?"),
                     "strategy": "trailing" if "TRAILING" in (r.get("exit_reason") or "").upper()
                                 else "hedge" if "HEDGE" in (r.get("exit_reason") or "").upper()
                                 else "normal_tp_sl"}
                    for r in past_results[:10]
                ],
                "best_coins": [], "worst_coins": [],
            }

        prompt = build_ai_prompt(top, active_coins, leverage_range=lev_range,
                                  max_selections=remaining_slots, past_performance=_sim_perf,
                                  bot_config=cfg)
        learning = _build_learning_context(past_results, leverage_range=lev_range)

        # Likidasyon verisi — top coinler için paralel çek
        liq_section = ""
        try:
            from services.liquidation_collector import get_liquidation_stats
            liq_tasks = [get_liquidation_stats(c["base"]) for c in top[:10]]
            liq_results = await asyncio.gather(*liq_tasks, return_exceptions=True)
            liq_lines = []
            for i, lr in enumerate(liq_results):
                if isinstance(lr, Exception) or not lr:
                    continue
                coin = top[i]["base"]
                long_cnt = lr.get("long_liq_count", 0)
                short_cnt = lr.get("short_liq_count", 0)
                long_vol = lr.get("long_liq_volume", 0)
                short_vol = lr.get("short_liq_volume", 0)
                signal = lr.get("signal", "neutral")
                if long_cnt + short_cnt > 0:
                    liq_lines.append(
                        f"  {coin}: Long tasfiye {long_cnt}(${long_vol:,.0f}) | Short tasfiye {short_cnt}(${short_vol:,.0f}) → {signal}"
                    )
            if liq_lines:
                liq_section = (
                    "\n───────── LİKİDASYON VERİSİ (Son 24s) ─────────\n"
                    + chr(10).join(liq_lines)
                    + "\n→ Çok tasfiye olan tarafın TERSİNE işlem aç (shorts_liquidated → LONG fırsatı)\n"
                )
        except Exception:
            pass

        if learning:
            # Kuralları hem başa hem sona koy — AI attention başı ve sonu en iyi okur
            rules_section = _extract_rules_summary(past_results, leverage_range=lev_range)
            if rules_section:
                prompt = rules_section + "\n\n" + prompt + "\n" + liq_section + "\n" + learning
            else:
                prompt = prompt + "\n" + liq_section + "\n" + learning
        elif liq_section:
            prompt = prompt + "\n" + liq_section

        try:
            model = settings.AI_DEEP_MODEL
            ai_resp = await asyncio.wait_for(
                _call(model, prompt, max_tokens=1200),
                timeout=45,
            )

            # AI konuşma logunu hazırla (kısaltılmış prompt + tam yanıt)
            prompt_summary = prompt[:1500] + "\n...(kısaltıldı)" if len(prompt) > 1500 else prompt
            ai_log_text = json.dumps({
                "model": model,
                "prompt_summary": prompt_summary,
                "ai_response": ai_resp,
                "market_summary": ai_resp.get("market_summary", ""),
            }, ensure_ascii=False, default=str)

            for sel in ai_resp.get("selections", []):
                coin_name = sel.get("coin", "")
                if coin_name in active_coins:
                    continue
                if sel.get("confidence", 0) < cfg.get("min_confidence", 65):
                    continue
                matched = next((c for c in coins if c["base"] == coin_name), None)
                if not matched:
                    continue

                # Kaldıraç: AI önerisini al, min/max aralığa ve coinin borsadaki max'ına sınırla
                ai_lev = sel.get("leverage_suggestion", cfg.get("leverage", SIM_LEVERAGE))
                coin_max_lev = matched.get("max_leverage") or 200
                user_min = cfg.get("min_leverage", 3)
                user_max = cfg.get("max_leverage", 75)
                final_lev = max(user_min, min(ai_lev, user_max, coin_max_lev))

                # AI exit_strategy kararı
                ai_exit_strategy = sel.get("exit_strategy", "normal_tp_sl")
                if ai_exit_strategy not in ("trailing", "normal_tp_sl", "hedge"):
                    ai_exit_strategy = "normal_tp_sl"

                # ── ATR + Kaldıraç bazlı TP/SL optimizasyonu ──
                ai_tp = float(sel.get("tp_suggestion_pct") or cfg.get("tp_pct", SIM_TP_PCT))
                ai_sl = float(sel.get("sl_suggestion_pct") or cfg.get("sl_pct", SIM_SL_PCT))
                coin_atr = matched.get("atr_pct")  # Coin'in gerçek volatilitesi
                old_tp, old_sl = ai_tp, ai_sl
                ai_tp, ai_sl = clamp_tp_sl(ai_tp, ai_sl, final_lev, coin_atr_pct=coin_atr)
                if old_tp != ai_tp or old_sl != ai_sl:
                    print(f"[SimScanner] {coin_name} TP/SL clamp (lev={final_lev}x ATR={coin_atr or '?'}%): "
                          f"TP {old_tp}%→{ai_tp}% | SL {old_sl}%→{ai_sl}%")

                selections.append({
                    "coin": coin_name,
                    "symbol": matched["symbol"],
                    "direction": sel.get("direction", "long"),
                    "confidence": sel.get("confidence", 50),
                    "reason": sel.get("entry_reason", "AI seçimi"),
                    "tp_pct": ai_tp,
                    "sl_pct": ai_sl,
                    "leverage": final_lev,
                    "indicators": matched,
                    "ai_log": ai_log_text,
                    "exit_strategy": ai_exit_strategy,
                    "trailing_callback_pct": float(sel.get("trailing_callback_pct") or cfg.get("trailing_callback_pct", 0.1)),
                })

        except Exception as e:
            print(f"[SimScanner] AI hatası: {e}")

    else:
        # Manuel mod
        criteria = ManualCriteria(min_adx=20, min_atr_pct=0.3, max_atr_pct=5,
                                  min_volume_ratio=1.2, min_leverage=20)
        scored = []
        for c in available:
            sc = score_coin_manual(c, criteria)
            if sc is not None:
                scored.append((c, sc))
        scored.sort(key=lambda x: x[1], reverse=True)

        for c, sc in scored[:3]:
            direction = determine_trade_direction(c, criteria)
            selections.append({
                "coin": c["base"],
                "symbol": c["symbol"],
                "direction": direction,
                "confidence": int(min(sc, 100)),
                "reason": f"Skor:{sc:.0f} RSI:{c.get('rsi_14','?')} ADX:{c.get('adx','?')}",
                "tp_pct": cfg.get("tp_pct", SIM_TP_PCT),
                "sl_pct": cfg.get("sl_pct", SIM_SL_PCT),
                "leverage": cfg.get("leverage", SIM_LEVERAGE),
                "indicators": c,
            })

    return selections


async def _select_hedge_coins(coins: list[dict], cfg: dict, open_sims: list[dict]) -> list[dict]:
    """Hedge modu: yüksek volatilite + yüksek likidite coinleri seç, çift yönlü pozisyon aç."""
    from ai.openrouter import _call

    active_coins = [s["coin"] for s in open_sims]
    min_atr = cfg.get("hedge_min_atr_pct", 0.3)
    min_vol = cfg.get("hedge_min_volume_ratio", 1.5)

    # Hedge için uygun coinleri filtrele
    candidates = []
    for c in coins:
        if c["base"] in active_coins:
            continue
        atr = c.get("atr_pct") or 0
        vol = c.get("volume_ratio") or 0
        max_lev = c.get("max_leverage") or 0
        if atr >= min_atr and vol >= min_vol and max_lev >= 20:
            # Hedge skoru: volatilite × hacim × kaldıraç
            score = atr * vol * min(max_lev, 200) / 100
            candidates.append((c, score))

    candidates.sort(key=lambda x: x[1], reverse=True)
    top = candidates[:10]

    if not top:
        return []

    # AI'ya hedge coin seçtir
    coin_list = "\n".join(
        f"  {c['base']:>10} | ATR:{c.get('atr_pct',0):.2f}% | Vol:{c.get('volume_ratio',0):.1f}x | "
        f"MaxLev:{c.get('max_leverage','?')}x | RSI:{c.get('rsi_14',0):.0f} | ADX:{c.get('adx',0):.0f}"
        for c, _ in top
    )

    prompt = f"""Sen bir hedge trading uzmanısın. Aşağıdaki coinlerden HEDGE İŞLEM için en uygun 1-2 coin seç.

HEDGE STRATEJİSİ:
- Aynı anda LONG + SHORT açılacak (aynı coin, aynı fiyat)
- TP: %{cfg.get('hedge_tp_pct', 0.4)} | SL: %{cfg.get('hedge_sl_pct', 0.1)}
- Fiyat bir yöne hareket edince bir taraf TP'ye ulaşır, diğeri SL'e
- Net kâr = TP% - SL% = %{cfg.get('hedge_tp_pct', 0.4) - cfg.get('hedge_sl_pct', 0.1):.1f}
- MAX kaldıraç kullanılacak → küçük % bile büyük kâr

İDEAL HEDGE COİN:
- Yüksek ATR% → fiyat hızlı hareket eder, TP'ye çabuk ulaşır
- Yüksek hacim → likidite var, slippage düşük
- Yüksek max kaldıraç → daha fazla kâr
- RSI aşırı bölgelerde DEĞİL → yön belirsiz, hedge için ideal

COIN VERİLERİ:
{coin_list}

JSON formatında yanıt ver:
{{
  "selections": [
    {{
      "coin": "COINNAME",
      "reason": "Neden bu coin hedge için ideal",
      "confidence": 80
    }}
  ]
}}
"""

    try:
        ai_resp = await asyncio.wait_for(
            _call(settings.AI_DEEP_MODEL, prompt, max_tokens=500),
            timeout=30,
        )

        results = []
        for sel in ai_resp.get("selections", []):
            coin_name = sel.get("coin", "")
            matched = next((c for c, _ in top if c["base"] == coin_name), None)
            if not matched:
                continue
            results.append({
                "coin": coin_name,
                "symbol": matched["symbol"],
                "confidence": sel.get("confidence", 70),
                "reason": sel.get("reason", "Hedge seçimi"),
                "indicators": matched,
                "ai_log": json.dumps({
                    "model": settings.AI_DEEP_MODEL,
                    "mode": "hedge",
                    "ai_response": ai_resp,
                }, ensure_ascii=False, default=str),
            })
        return results

    except Exception as e:
        print(f"[SimScanner] Hedge AI hatası: {e}")
        # Fallback: en yüksek skorlu coini seç
        if top:
            c, _ = top[0]
            return [{
                "coin": c["base"],
                "symbol": c["symbol"],
                "confidence": 65,
                "reason": f"Auto-hedge: ATR:{c.get('atr_pct',0):.2f}% Vol:{c.get('volume_ratio',0):.1f}x",
                "indicators": c,
            }]
        return []


async def _save_simulation(sel: dict, price: float, margin: float = SIM_MARGIN) -> int | None:
    """Yeni simülasyonu DB'ye kaydet. Dönen ID'yi döndürür."""
    tp_pct = float(sel["tp_pct"])
    sl_pct = float(sel["sl_pct"])
    is_long = sel["direction"] == "long"

    # Gerçekçi slippage simülasyonu: market order giriş fiyatı %0.03-0.05 kayabilir
    # Long'da fiyat yukarı kayar (aleyhte), short'ta aşağı kayar (aleyhte)
    slippage_pct = 0.03  # %0.03 ortalama slippage
    if is_long:
        price = round(price * (1 + slippage_pct / 100), 6)  # Long: daha pahalıya girer
    else:
        price = round(price * (1 - slippage_pct / 100), 6)  # Short: daha ucuza girer

    tp_price = round(price * (1 + tp_pct / 100), 6) if is_long else round(price * (1 - tp_pct / 100), 6)
    sl_price = round(price * (1 - sl_pct / 100), 6) if is_long else round(price * (1 + sl_pct / 100), 6)
    ind = sel.get("indicators", {})
    is_hedge = sel.get("is_hedge", False)
    hedge_pair_id = sel.get("hedge_pair_id")

    # Ekstra kolonlar — varsa ekle
    extra_cols = ""
    extra_vals = ""
    extra_params = {}
    for col, val in [("ai_log", sel.get("ai_log")), ("is_hedge", is_hedge), ("hedge_pair_id", hedge_pair_id)]:
        try:
            async with async_session() as sess:
                await sess.execute(sql_text(f"SELECT {col} FROM scanner_simulations LIMIT 0"))
            extra_cols += f", {col}"
            extra_vals += f", :{col}"
            extra_params[col] = val
        except Exception:
            pass

    # margin_usdt kolonu varsa ekle
    for col, val in [("margin_usdt", margin)]:
        try:
            async with async_session() as sess:
                await sess.execute(sql_text(f"SELECT {col} FROM scanner_simulations LIMIT 0"))
            extra_cols += f", {col}"
            extra_vals += f", :{col}"
            extra_params[col] = val
        except Exception:
            pass

    # max_favorable_pct, max_adverse_pct, first_move → başlangıç değerleri set et
    for col, val in [
        ("max_favorable_pct", 0.0),
        ("max_adverse_pct", 0.0),
        ("first_move", None),
        ("first_move_pct", None),
    ]:
        try:
            async with async_session() as sess:
                await sess.execute(sql_text(f"SELECT {col} FROM scanner_simulations LIMIT 0"))
            extra_cols += f", {col}"
            extra_vals += f", :{col}"
            extra_params[col] = val
        except Exception:
            pass

    sim_id = None
    async with async_session() as session:
        result = await session.execute(sql_text(f"""
            INSERT INTO scanner_simulations
                (coin, symbol, direction, selection_mode, confidence, reason,
                 entry_price, tp_price, sl_price, tp_pct, sl_pct, leverage,
                 rsi_14, adx, volume_ratio, funding_rate, fear_greed, atr_pct, supertrend_dir,
                 status{extra_cols})
            VALUES
                (:coin, :symbol, :direction, :mode, :confidence, :reason,
                 :entry, :tp, :sl, :tp_pct, :sl_pct, :lev,
                 :rsi, :adx, :vol, :fund, :fg, :atr, :st,
                 'open'{extra_vals})
            RETURNING id
        """), {
            "coin": sel["coin"], "symbol": sel["symbol"],
            "direction": sel["direction"], "mode": sel.get("mode", "ai"),
            "confidence": sel.get("confidence"), "reason": sel.get("reason"),
            "entry": price, "tp": tp_price, "sl": sl_price,
            "tp_pct": tp_pct, "sl_pct": sl_pct, "lev": sel.get("leverage", SIM_LEVERAGE),
            "rsi": ind.get("rsi_14"), "adx": ind.get("adx"),
            "vol": ind.get("volume_ratio"), "fund": ind.get("funding_rate"),
            "fg": ind.get("fear_greed"), "atr": ind.get("atr_pct"),
            "st": ind.get("supertrend_dir"),
            **extra_params,
        })
        row = result.fetchone()
        sim_id = row[0] if row else None
        await session.commit()
    return sim_id


async def _check_open_simulations(exchange, expiry_hours: int = SIM_EXPIRY_HOURS,
                                  trailing_cfg: dict = None, portfolio_enabled: bool = False):
    """Açık simülasyonları kontrol et: TP/SL hit mi? Trailing stop? Expire mi?"""
    open_sims = await _get_open_sims()
    if not open_sims:
        return

    redis = get_redis() if portfolio_enabled else None
    now = datetime.now(timezone.utc)

    for sim in open_sims:
        sim_id = sim["id"]
        symbol = sim["symbol"]
        entry = sim["entry_price"]
        tp = sim["tp_price"]
        sl = sim["sl_price"]
        direction = sim["direction"]
        is_long = direction == "long"
        created = sim["created_at"]
        # Naive datetime ise UTC olarak işaretle
        if created and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        max_fav = sim.get("max_favorable_pct") or 0
        max_adv = sim.get("max_adverse_pct") or 0

        # Zaman aşımı kontrolü
        if created and (now - created).total_seconds() > expiry_hours * 3600:
            sim_margin = float(sim.get("margin_usdt") or SIM_MARGIN)
            cur_price = await _get_price(symbol, exchange)
            if cur_price:
                pnl_pct = ((cur_price - entry) / entry * 100) if is_long else ((entry - cur_price) / entry * 100)
                pnl_usdt = sim_margin * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100
            else:
                cur_price = entry
                pnl_pct = 0
                pnl_usdt = 0

            duration_min = int((now - created).total_seconds() / 60) if created else None
            async with async_session() as session:
                await session.execute(sql_text("""
                    UPDATE scanner_simulations
                    SET status = 'expired', exit_price = :price, pnl_pct = :pnl,
                        pnl_usdt = :pnl_usdt, exit_reason = 'EXPIRED',
                        duration_minutes = :dur, closed_at = NOW()
                    WHERE id = :id
                """), {"price": cur_price, "pnl": round(pnl_pct, 4),
                       "pnl_usdt": round(pnl_usdt, 2), "dur": duration_min, "id": sim_id})
                await session.commit()

            # Portföy güncelle
            if portfolio_enabled and redis:
                await _release_margin(redis, sim_margin, round(pnl_usdt, 2))

            print(f"[SimScanner] {sim['coin']} expired: {pnl_pct:+.2f}% (${pnl_usdt:+.1f}) [{duration_min}dk]")
            continue

        # Fiyat kontrolü — önce Redis (WS), yoksa REST
        cur_price = await _get_price(symbol, exchange)
        if not cur_price:
            continue

        # Lehte/aleyhte hareket takibi
        if is_long:
            favorable = max(0, (cur_price - entry) / entry * 100)
            adverse = max(0, (entry - cur_price) / entry * 100)
        else:
            favorable = max(0, (entry - cur_price) / entry * 100)
            adverse = max(0, (cur_price - entry) / entry * 100)

        new_max_fav = max(max_fav, favorable)
        new_max_adv = max(max_adv, adverse)

        # İlk hareket yönü takibi — sadece ilk kontrolde (first_move henüz set edilmemişse)
        if not sim.get("first_move") and (favorable > 0.01 or adverse > 0.01):
            first_move = "favorable" if favorable >= adverse else "adverse"
            first_move_pct = round(favorable if first_move == "favorable" else adverse, 4)
            async with async_session() as session:
                await session.execute(sql_text("""
                    UPDATE scanner_simulations
                    SET first_move = :fm, first_move_pct = :fmp
                    WHERE id = :id
                """), {"fm": first_move, "fmp": first_move_pct, "id": sim_id})
                await session.commit()

        # Trailing Stop kontrolü
        trailing_close = False
        if trailing_cfg and trailing_cfg.get("enabled"):
            activate_pct = trailing_cfg.get("activate_pct", 0.3)
            callback_pct = trailing_cfg.get("callback_pct", 0.15)
            # Trailing aktif mi? → max favorable activate_pct'yi geçmişse
            if new_max_fav >= activate_pct:
                # Zirveden geri çekilme = max_fav - current_favorable
                pullback = new_max_fav - favorable
                if pullback >= callback_pct:
                    trailing_close = True

        # TP/SL kontrol
        hit_tp = (is_long and cur_price >= tp) or (not is_long and cur_price <= tp)
        hit_sl = (is_long and cur_price <= sl) or (not is_long and cur_price >= sl)

        if hit_tp or hit_sl or trailing_close:
            sim_margin = float(sim.get("margin_usdt") or SIM_MARGIN)
            if trailing_close:
                status = "win"
                exit_price = cur_price
                reason_tag = "TRAILING"
            elif hit_tp and hit_sl:
                # İkisi de aynı anda hit ise (büyük mum) — SL öncelikli (gerçekçi)
                status = "loss"
                exit_price = sl
                reason_tag = "SL"
            else:
                status = "win" if hit_tp else "loss"
                # Gerçekçi exit: TP/SL hedef fiyatı yerine gerçek fiyatı kullan
                # Borsada slippage olur — fiyat tam TP/SL'de durmaz
                if hit_tp:
                    exit_price = cur_price  # Gerçek fiyat TP'yi geçmiş olabilir
                    reason_tag = "TP"
                else:
                    exit_price = cur_price  # Gerçek fiyat SL'yi geçmiş olabilir
                    reason_tag = "SL"
            raw_pnl_pct = ((exit_price - entry) / entry * 100) if is_long else ((entry - exit_price) / entry * 100)
            # Komisyon düşümü: MEXC futures açma %0.02 + kapama %0.02 = %0.04 (zero-fee coinler için 0)
            fee_pct = 0.04  # toplam giriş+çıkış fee oranı (pozisyon büyüklüğüne göre)
            pnl_pct = raw_pnl_pct - fee_pct
            pnl_usdt = sim_margin * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100

            # Süre hesapla
            duration_min = None
            if created:
                duration_min = int((now - created).total_seconds() / 60)

            async with async_session() as session:
                await session.execute(sql_text("""
                    UPDATE scanner_simulations
                    SET status = :status, exit_price = :price, pnl_pct = :pnl,
                        pnl_usdt = :pnl_usdt, max_favorable_pct = :fav, max_adverse_pct = :adv,
                        exit_reason = :reason, duration_minutes = :dur,
                        closed_at = NOW()
                    WHERE id = :id
                """), {"status": status, "price": round(exit_price, 6),
                       "pnl": round(pnl_pct, 4), "pnl_usdt": round(pnl_usdt, 2),
                       "fav": round(new_max_fav, 4), "adv": round(new_max_adv, 4),
                       "reason": reason_tag, "dur": duration_min,
                       "id": sim_id})
                await session.commit()
            # Portföy güncelle
            if portfolio_enabled and redis:
                await _release_margin(redis, sim_margin, round(pnl_usdt, 2))

            emoji = "✅" if status == "win" else "❌"
            dur_str = f"{duration_min}dk" if duration_min else "?"
            print(f"[SimScanner] {emoji} {sim['coin']} {direction} → {status} [{reason_tag}] ({pnl_pct:+.2f}% / ${pnl_usdt:+.1f}) [{dur_str}]")
        elif new_max_fav != max_fav or new_max_adv != max_adv:
            # Sadece max favorable/adverse güncelle
            async with async_session() as session:
                await session.execute(sql_text("""
                    UPDATE scanner_simulations
                    SET max_favorable_pct = :fav, max_adverse_pct = :adv
                    WHERE id = :id
                """), {"fav": round(new_max_fav, 4), "adv": round(new_max_adv, 4), "id": sim_id})
                await session.commit()


async def run_simulator_cycle():
    """Tek bir simülasyon döngüsü."""
    redis = get_redis()
    cfg = await _get_sim_settings(redis)

    if not cfg.get("enabled", True):
        return

    exchange = ccxt.mexc({"options": {"defaultType": "swap"}})
    exchange.timeout = 15000

    try:
        await exchange.load_markets()

        # Portföy ayarları
        portfolio_on = cfg.get("portfolio_enabled", True)

        # Fiyat kontrolü artık _fast_price_monitor() tarafından 3s'de bir yapılıyor.
        # Bu döngü sadece yeni seçim yapar.

        # Yeni seçim yap
        open_sims = await _get_open_sims()
        if len(open_sims) >= cfg.get("max_open", SIM_MAX_OPEN):
            print(f"[SimScanner] Max açık sim ({len(open_sims)}/{cfg.get('max_open', SIM_MAX_OPEN)}) — bekleniyor")
            # Status güncelle
            await redis.set("scanner_sim:status", json.dumps({
                "open_count": len(open_sims),
                "waiting": True,
                "ts": datetime.now(timezone.utc).isoformat(),
            }), ex=300)
            return

        coins = await _get_coins_from_db()
        if not coins:
            print("[SimScanner] Coin verisi yok — collector bekleniyor")
            await redis.set("scanner_sim:status", json.dumps({
                "error": "Coin verisi yok",
                "ts": datetime.now(timezone.utc).isoformat(),
            }), ex=300)
            return

        past_results = await _get_past_results(50)
        selections = await _run_selection(coins, cfg, open_sims, past_results)

        # Kalan slot kadar seçim — max_open aşılmasın
        max_open = cfg.get("max_open", SIM_MAX_OPEN)
        remaining_slots = max_open - len(open_sims)
        if len(selections) > remaining_slots:
            print(f"[SimScanner] {len(selections)} seçim → {remaining_slots} slot kaldı, kırpılıyor")
            selections = selections[:remaining_slots]

        # 3. Seçimleri kaydet (TP/SL zaten clamp_tp_sl ile optimize edildi)
        # Portföy
        portfolio = await _get_portfolio(redis) if portfolio_on else None

        opened = []
        for sel in selections:
            try:
                price = await _get_price(sel["symbol"], exchange)
                if not price:
                    print(f"[SimScanner] {sel['coin']} fiyat alınamadı — atlanıyor")
                    continue

                # Margin hesapla ve ayır
                if portfolio_on and portfolio:
                    margin = await _calculate_margin(cfg, portfolio, sel.get("leverage", SIM_LEVERAGE))
                    if margin < 1:
                        print(f"[SimScanner] Yetersiz bakiye — {sel['coin']} atlanıyor (bakiye: ${portfolio['balance']:.2f})")
                        continue
                    reserved = await _reserve_margin(redis, margin)
                    if not reserved:
                        print(f"[SimScanner] Margin ayrılamadı — {sel['coin']} atlanıyor")
                        continue
                    portfolio = await _get_portfolio(redis)  # Güncel bakiye
                else:
                    margin = SIM_MARGIN

                sel["mode"] = cfg.get("mode", "ai")
                await _save_simulation(sel, price, margin=margin)
                opened.append(sel["coin"])
                pos_size = margin * sel.get("leverage", SIM_LEVERAGE)
                print(f"[SimScanner] 📊 SIM {sel['direction'].upper()} {sel['coin']} @ ${price:,.4f} "
                      f"conf={sel.get('confidence')}% lev={sel.get('leverage')}x TP={sel['tp_pct']}% SL={sel['sl_pct']}% "
                      f"margin=${margin:.0f} pos=${pos_size:.0f}")
            except Exception as e:
                print(f"[SimScanner] {sel['coin']} sim kayıt hatası: {e}")

        # 4. Hedge seçimleri
        hedge_opened = []
        if cfg.get("hedge_enabled", False):
            open_sims_now = await _get_open_sims()
            remaining_slots = cfg.get("max_open", SIM_MAX_OPEN) - len(open_sims_now)
            if remaining_slots >= 2:  # Hedge en az 2 slot gerektirir
                hedge_coins = await _select_hedge_coins(coins, cfg, open_sims_now)
                hedge_tp = cfg.get("hedge_tp_pct", 0.4)
                hedge_sl = cfg.get("hedge_sl_pct", 0.1)

                for hc in hedge_coins:
                    if remaining_slots < 2:
                        break
                    try:
                        price = await _get_price(hc["symbol"], exchange)
                        if not price:
                            print(f"[SimScanner] {hc['coin']} hedge fiyat alınamadı — atlanıyor")
                            continue

                        # Hedge için 2x margin gerekli (long + short)
                        if portfolio_on:
                            portfolio = await _get_portfolio(redis)
                            h_margin = await _calculate_margin(cfg, portfolio, 1)
                            if h_margin * 2 > portfolio["balance"]:
                                print(f"[SimScanner] Hedge için yetersiz bakiye — {hc['coin']} atlanıyor")
                                continue
                            await _reserve_margin(redis, h_margin)
                            await _reserve_margin(redis, h_margin)
                        else:
                            h_margin = SIM_MARGIN

                        coin_max_lev = hc["indicators"].get("max_leverage") or 50
                        lev = coin_max_lev if cfg.get("hedge_use_max_leverage", True) else cfg.get("max_leverage", 75)

                        # LONG taraf
                        long_sel = {
                            "coin": hc["coin"], "symbol": hc["symbol"],
                            "direction": "long", "confidence": hc.get("confidence", 70),
                            "reason": f"🔄 HEDGE LONG — {hc.get('reason', '')}",
                            "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                            "leverage": lev, "mode": "hedge",
                            "indicators": hc["indicators"],
                            "is_hedge": True,
                            "ai_log": hc.get("ai_log"),
                        }
                        long_id = await _save_simulation(long_sel, price, margin=h_margin)

                        # SHORT taraf
                        short_sel = {
                            "coin": hc["coin"], "symbol": hc["symbol"],
                            "direction": "short", "confidence": hc.get("confidence", 70),
                            "reason": f"🔄 HEDGE SHORT — {hc.get('reason', '')}",
                            "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                            "leverage": lev, "mode": "hedge",
                            "indicators": hc["indicators"],
                            "is_hedge": True,
                            "hedge_pair_id": long_id,
                            "ai_log": hc.get("ai_log"),
                        }
                        short_id = await _save_simulation(short_sel, price, margin=h_margin)

                        # Long tarafına da pair_id set et
                        if long_id and short_id:
                            async with async_session() as session:
                                await session.execute(sql_text(
                                    "UPDATE scanner_simulations SET hedge_pair_id = :pair WHERE id = :id"
                                ), {"pair": short_id, "id": long_id})
                                await session.commit()

                        hedge_opened.append(f"{hc['coin']}(H)")
                        remaining_slots -= 2
                        print(f"[SimScanner] 🔄 HEDGE {hc['coin']} @ ${price:,.4f} "
                              f"lev={lev}x TP={hedge_tp}% SL={hedge_sl}%")
                    except Exception as e:
                        print(f"[SimScanner] {hc['coin']} hedge hatası: {e}")

        # Status güncelle
        past_stats = {}
        if past_results:
            wins = len([r for r in past_results if r["status"] == "win"])
            total = len(past_results)
            past_stats = {"win_rate": round(wins / total * 100, 1), "total": total, "wins": wins}

        # Portföy bilgisi ekle
        portfolio_info = None
        if portfolio_on:
            portfolio = await _get_portfolio(redis)
            portfolio_info = {
                "balance": round(portfolio["balance"], 2),
                "reserved": round(portfolio["reserved"], 2),
                "equity": round(portfolio["balance"] + portfolio["reserved"], 2),
                "initial": portfolio["initial_balance"],
                "total_pnl": round(portfolio["total_pnl"], 2),
                "peak_equity": round(portfolio["peak_equity"], 2),
                "max_drawdown": portfolio["max_drawdown"],
                "total_trades": portfolio["total_trades"],
                "total_wins": portfolio["total_wins"],
                "win_rate": round(portfolio["total_wins"] / max(1, portfolio["total_trades"]) * 100, 1),
                "roi": round((portfolio["balance"] + portfolio["reserved"] - portfolio["initial_balance"]) / max(1, portfolio["initial_balance"]) * 100, 2),
            }

        await redis.set("scanner_sim:status", json.dumps({
            "coins_total": len(coins),
            "open_count": len(open_sims) + len(opened) + len(hedge_opened) * 2,
            "opened": opened + hedge_opened,
            "selections_count": len(selections),
            "hedge_count": len(hedge_opened),
            "mode": cfg.get("mode", "ai"),
            "hedge_enabled": cfg.get("hedge_enabled", False),
            "past_stats": past_stats,
            "portfolio": portfolio_info,
            "waiting": False,
            "ts": datetime.now(timezone.utc).isoformat(),
        }), ex=300)

    except Exception as e:
        print(f"[SimScanner] Döngü hatası: {e}")
        import traceback
        traceback.print_exc()
        try:
            await redis.set("scanner_sim:status", json.dumps({
                "error": str(e)[:300],
                "ts": datetime.now(timezone.utc).isoformat(),
            }), ex=300)
        except Exception:
            pass
    finally:
        try:
            await exchange.close()
        except Exception:
            pass


async def _fast_price_monitor():
    """
    Hızlı fiyat izleme döngüsü — 3 saniyede bir açık sim'lerin TP/SL kontrolü.

    Sadece Redis'ten fiyat okur (WebSocket-fed, ~0ms).
    DB sorgusu yok (açık sim cache'i 15s'de bir yenilenir).
    DB write sadece TP/SL hit olduğunda.
    Sistem yükü: minimal — Redis GET + basit karşılaştırma.
    """
    print("[SimMonitor] Hızlı fiyat izleme başladı (3s aralık)")
    await asyncio.sleep(100)  # Diğer servisler hazır olsun

    # Açık sim cache — DB'ye her 3s'de sormamak için
    _cached_sims: list[dict] = []
    _cache_ts: float = 0
    CACHE_TTL = 15  # 15 saniyede bir DB'den yenile
    CHECK_INTERVAL = 3  # 3 saniyede bir fiyat kontrol

    while True:
        try:
            now_ts = asyncio.get_event_loop().time()
            redis = get_redis()

            # Ayarları kontrol et
            cfg = await _get_sim_settings(redis)
            if not cfg.get("enabled", True):
                await asyncio.sleep(30)
                continue

            trailing_cfg = {
                "enabled": cfg.get("trailing_enabled", False),
                "activate_pct": cfg.get("trailing_activate_pct", 0.3),
                "callback_pct": cfg.get("trailing_callback_pct", 0.15),
            }
            portfolio_on = cfg.get("portfolio_enabled", True)

            # Cache yenile (15s'de bir DB query)
            if now_ts - _cache_ts > CACHE_TTL:
                _cached_sims = await _get_open_sims()
                _cache_ts = now_ts

            if not _cached_sims:
                await asyncio.sleep(CHECK_INTERVAL)
                continue

            now = datetime.now(timezone.utc)
            expiry_hours = cfg.get("expiry_hours", SIM_EXPIRY_HOURS)
            closed_ids = []  # Bu tick'te kapanan sim ID'leri — cache'ten çıkar

            for sim in _cached_sims:
                sim_id = sim["id"]
                symbol = sim["symbol"]
                entry = sim["entry_price"]
                tp = sim["tp_price"]
                sl = sim["sl_price"]
                is_long = sim["direction"] == "long"
                created = sim["created_at"]
                if created and created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                max_fav = sim.get("max_favorable_pct") or 0
                max_adv = sim.get("max_adverse_pct") or 0

                # Expire kontrolü
                if created and (now - created).total_seconds() > expiry_hours * 3600:
                    sim_margin = float(sim.get("margin_usdt") or SIM_MARGIN)
                    cur_price = await _get_price_from_redis(symbol)
                    if cur_price:
                        pnl_pct = ((cur_price - entry) / entry * 100) if is_long else ((entry - cur_price) / entry * 100)
                        pnl_usdt = sim_margin * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100
                    else:
                        cur_price, pnl_pct, pnl_usdt = entry, 0, 0
                    duration_min = int((now - created).total_seconds() / 60) if created else None
                    async with async_session() as session:
                        await session.execute(sql_text("""
                            UPDATE scanner_simulations
                            SET status = 'expired', exit_price = :price, pnl_pct = :pnl,
                                pnl_usdt = :pnl_usdt, exit_reason = 'EXPIRED',
                                duration_minutes = :dur, closed_at = NOW()
                            WHERE id = :id AND status = 'open'
                        """), {"price": cur_price, "pnl": round(pnl_pct, 4),
                               "pnl_usdt": round(pnl_usdt, 2), "dur": duration_min, "id": sim_id})
                        await session.commit()
                    if portfolio_on:
                        await _release_margin(redis, sim_margin, round(pnl_usdt, 2))
                    print(f"[SimMonitor] {sim['coin']} expired: {pnl_pct:+.2f}% (${pnl_usdt:+.1f}) [{duration_min}dk]")
                    closed_ids.append(sim_id)
                    continue

                # Fiyat: SADECE Redis (WebSocket) — REST yok, 0ms
                cur_price = await _get_price_from_redis(symbol)
                if not cur_price:
                    continue

                # Lehte/aleyhte hareket
                if is_long:
                    favorable = max(0, (cur_price - entry) / entry * 100)
                    adverse = max(0, (entry - cur_price) / entry * 100)
                else:
                    favorable = max(0, (entry - cur_price) / entry * 100)
                    adverse = max(0, (cur_price - entry) / entry * 100)

                new_max_fav = max(max_fav, favorable)
                new_max_adv = max(max_adv, adverse)

                # İlk hareket yönü (sadece bir kez set edilir)
                if not sim.get("first_move") and (favorable > 0.01 or adverse > 0.01):
                    first_move = "favorable" if favorable >= adverse else "adverse"
                    first_move_pct = round(favorable if first_move == "favorable" else adverse, 4)
                    sim["first_move"] = first_move  # Cache güncelle
                    async with async_session() as session:
                        await session.execute(sql_text("""
                            UPDATE scanner_simulations SET first_move = :fm, first_move_pct = :fmp WHERE id = :id
                        """), {"fm": first_move, "fmp": first_move_pct, "id": sim_id})
                        await session.commit()

                # Trailing stop
                trailing_close = False
                if trailing_cfg.get("enabled") and new_max_fav >= trailing_cfg.get("activate_pct", 0.3):
                    pullback = new_max_fav - favorable
                    if pullback >= trailing_cfg.get("callback_pct", 0.15):
                        trailing_close = True

                # TP/SL check
                hit_tp = (is_long and cur_price >= tp) or (not is_long and cur_price <= tp)
                hit_sl = (is_long and cur_price <= sl) or (not is_long and cur_price >= sl)

                if hit_tp or hit_sl or trailing_close:
                    sim_margin = float(sim.get("margin_usdt") or SIM_MARGIN)
                    if trailing_close:
                        status, exit_price, reason_tag = "win", cur_price, "TRAILING"
                    elif hit_tp and hit_sl:
                        status, exit_price, reason_tag = "loss", sl, "SL"
                    elif hit_tp:
                        status, exit_price, reason_tag = "win", cur_price, "TP"
                    else:
                        status, exit_price, reason_tag = "loss", cur_price, "SL"

                    raw_pnl_pct = ((exit_price - entry) / entry * 100) if is_long else ((entry - exit_price) / entry * 100)
                    pnl_pct = raw_pnl_pct - 0.04  # komisyon
                    pnl_usdt = sim_margin * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100
                    duration_min = int((now - created).total_seconds() / 60) if created else None

                    async with async_session() as session:
                        await session.execute(sql_text("""
                            UPDATE scanner_simulations
                            SET status = :status, exit_price = :price, pnl_pct = :pnl,
                                pnl_usdt = :pnl_usdt, max_favorable_pct = :fav, max_adverse_pct = :adv,
                                exit_reason = :reason, duration_minutes = :dur, closed_at = NOW()
                            WHERE id = :id AND status = 'open'
                        """), {"status": status, "price": round(exit_price, 6),
                               "pnl": round(pnl_pct, 4), "pnl_usdt": round(pnl_usdt, 2),
                               "fav": round(new_max_fav, 4), "adv": round(new_max_adv, 4),
                               "reason": reason_tag, "dur": duration_min, "id": sim_id})
                        await session.commit()

                    if portfolio_on:
                        await _release_margin(redis, sim_margin, round(pnl_usdt, 2))

                    emoji = "✅" if status == "win" else "❌"
                    dur_str = f"{duration_min}dk" if duration_min else "?"
                    print(f"[SimMonitor] {emoji} {sim['coin']} {sim['direction']} → {status} [{reason_tag}] "
                          f"({pnl_pct:+.2f}% / ${pnl_usdt:+.1f}) [{dur_str}]")
                    closed_ids.append(sim_id)
                else:
                    # Max favorable/adverse cache güncelle (DB yazma sadece değişince)
                    sim["max_favorable_pct"] = new_max_fav
                    sim["max_adverse_pct"] = new_max_adv
                    if new_max_fav != max_fav or new_max_adv != max_adv:
                        async with async_session() as session:
                            await session.execute(sql_text("""
                                UPDATE scanner_simulations
                                SET max_favorable_pct = :fav, max_adverse_pct = :adv WHERE id = :id
                            """), {"fav": round(new_max_fav, 4), "adv": round(new_max_adv, 4), "id": sim_id})
                            await session.commit()

            # Kapanan sim'leri cache'ten çıkar
            if closed_ids:
                _cached_sims = [s for s in _cached_sims if s["id"] not in closed_ids]

        except Exception as e:
            print(f"[SimMonitor] Hata: {e}")
            import traceback
            traceback.print_exc()

        await asyncio.sleep(CHECK_INTERVAL)


async def start_scanner_simulator():
    """Arka plan görevi: seçim döngüsü + hızlı fiyat izleme paralel çalışır."""
    print("[SimScanner] Scanner simülatör başladı.")
    await asyncio.sleep(90)  # DB + collector hazır olsun

    # Hızlı fiyat izleme — ayrı task olarak paralel çalışır
    asyncio.create_task(_fast_price_monitor())

    while True:
        try:
            redis = get_redis()
            cfg = await _get_sim_settings(redis)
            if cfg.get("enabled", True):
                await run_simulator_cycle()
            interval = cfg.get("interval", SIM_INTERVAL)
        except Exception as e:
            print(f"[SimScanner] Kritik hata: {e}")
            interval = SIM_INTERVAL

        await asyncio.sleep(interval)
