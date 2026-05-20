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
    ManualCriteria, score_coin_manual, build_ai_prompt, determine_trade_direction
)

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
    async with async_session() as session:
        result = await session.execute(sql_text("""
            SELECT id, coin, symbol, direction, entry_price, tp_price, sl_price,
                   leverage, created_at, max_favorable_pct, max_adverse_pct, first_move
            FROM scanner_simulations
            WHERE status = 'open'
            ORDER BY created_at DESC
        """))
        return [dict(zip(
            ["id", "coin", "symbol", "direction", "entry_price", "tp_price", "sl_price",
             "leverage", "created_at", "max_favorable_pct", "max_adverse_pct", "first_move"],
            row
        )) for row in result.fetchall()]


async def _get_past_results(limit: int = 20) -> list[dict]:
    """AI öğrenme için geçmiş simülasyon sonuçlarını getir."""
    async with async_session() as session:
        result = await session.execute(sql_text("""
            SELECT coin, direction, confidence, entry_price, exit_price,
                   pnl_pct, status, reason, ai_review,
                   rsi_14, adx, funding_rate, fear_greed,
                   exit_reason, duration_minutes, first_move, first_move_pct,
                   leverage, max_favorable_pct, max_adverse_pct
            FROM scanner_simulations
            WHERE status IN ('win', 'loss')
            ORDER BY closed_at DESC
            LIMIT :limit
        """), {"limit": limit})
        return [dict(zip(
            ["coin", "direction", "confidence", "entry_price", "exit_price",
             "pnl_pct", "status", "reason", "ai_review",
             "rsi_14", "adx", "funding_rate", "fear_greed",
             "exit_reason", "duration_minutes", "first_move", "first_move_pct",
             "leverage", "max_favorable_pct", "max_adverse_pct"],
            row
        )) for row in result.fetchall()]


def _build_learning_context(past_results: list[dict]) -> str:
    """Geçmiş sonuçlardan AI öğrenme metni oluştur."""
    if not past_results:
        return ""

    wins = [r for r in past_results if r["status"] == "win"]
    losses = [r for r in past_results if r["status"] == "loss"]
    total = len(past_results)
    win_rate = len(wins) / total * 100 if total else 0
    avg_win = sum(r["pnl_pct"] or 0 for r in wins) / max(1, len(wins))
    avg_loss = sum(abs(r["pnl_pct"] or 0) for r in losses) / max(1, len(losses))

    # Yön bazlı analiz
    long_trades = [r for r in past_results if r["direction"] == "long"]
    short_trades = [r for r in past_results if r["direction"] == "short"]
    long_wins = len([r for r in long_trades if r["status"] == "win"])
    short_wins = len([r for r in short_trades if r["status"] == "win"])

    # Coin bazlı performans
    coin_stats = {}
    for r in past_results:
        c = r["coin"]
        if c not in coin_stats:
            coin_stats[c] = {"win": 0, "loss": 0}
        coin_stats[c][r["status"]] += 1

    best_coins = sorted(coin_stats.items(),
                        key=lambda x: x[1]["win"] / max(1, x[1]["win"] + x[1]["loss"]),
                        reverse=True)[:5]
    worst_coins = sorted(coin_stats.items(),
                         key=lambda x: x[1]["loss"] / max(1, x[1]["win"] + x[1]["loss"]),
                         reverse=True)[:3]

    # İlk hareket analizi — fiyat giriş sonrası önce lehte mi aleyhte mi gitti?
    first_move_data = [r for r in past_results if r.get("first_move")]
    fm_favorable = [r for r in first_move_data if r["first_move"] == "favorable"]
    fm_adverse = [r for r in first_move_data if r["first_move"] == "adverse"]
    # İlk hareket lehte olanların kazanma oranı
    fm_fav_wins = len([r for r in fm_favorable if r["status"] == "win"])
    fm_adv_wins = len([r for r in fm_adverse if r["status"] == "win"])

    # Kaldıraç bazlı analiz
    high_lev = [r for r in past_results if (r.get("leverage") or 0) >= 30]
    low_lev = [r for r in past_results if (r.get("leverage") or 0) < 30]
    high_lev_wins = len([r for r in high_lev if r["status"] == "win"])
    low_lev_wins = len([r for r in low_lev if r["status"] == "win"])

    # Ortalama süre
    durations = [r["duration_minutes"] for r in past_results if r.get("duration_minutes")]
    avg_dur = sum(durations) / max(1, len(durations)) if durations else 0
    win_durs = [r["duration_minutes"] for r in wins if r.get("duration_minutes")]
    loss_durs = [r["duration_minutes"] for r in losses if r.get("duration_minutes")]
    avg_win_dur = sum(win_durs) / max(1, len(win_durs)) if win_durs else 0
    avg_loss_dur = sum(loss_durs) / max(1, len(loss_durs)) if loss_durs else 0

    # Son 5 işlem detayı
    recent_lines = []
    for r in past_results[:5]:
        emoji = "✅" if r["status"] == "win" else "❌"
        pnl = f"{r['pnl_pct']:+.2f}%" if r["pnl_pct"] else "?"
        exit_r = r.get("exit_reason", "?")
        dur = f"{r.get('duration_minutes', '?')}dk"
        fm = "→lehte" if r.get("first_move") == "favorable" else "→aleyhte" if r.get("first_move") == "adverse" else ""
        lev = f"{r.get('leverage', '?')}x"
        recent_lines.append(
            f"  {emoji} {r['coin']} {r['direction'].upper()} {lev} → {r['status']}[{exit_r}] ({pnl}) "
            f"[{dur}] {fm} RSI={r.get('rsi_14','?')} ADX={r.get('adx','?')}"
        )

    first_move_section = ""
    if first_move_data:
        first_move_section = f"""
İLK HAREKET ANALİZİ (Giriş sonrası fiyat ilk hangi yöne gitti?):
  Lehte başlayan: {len(fm_favorable)} işlem → {fm_fav_wins}W ({round(fm_fav_wins/max(1,len(fm_favorable))*100)}% kazanma)
  Aleyhte başlayan: {len(fm_adverse)} işlem → {fm_adv_wins}W ({round(fm_adv_wins/max(1,len(fm_adverse))*100)}% kazanma)
  → {'Lehte başlayanlar daha başarılı!' if fm_fav_wins/max(1,len(fm_favorable)) > fm_adv_wins/max(1,len(fm_adverse)) else 'Aleyhte başlayanlar bile kazanabiliyor — sabır önemli'}
"""

    leverage_section = ""
    if high_lev or low_lev:
        leverage_section = f"""
KALDIRAC BAZLI PERFORMANS:
  Yüksek kaldıraç (≥30x): {len(high_lev)} işlem → {high_lev_wins}W ({round(high_lev_wins/max(1,len(high_lev))*100)}%)
  Düşük kaldıraç (<30x): {len(low_lev)} işlem → {low_lev_wins}W ({round(low_lev_wins/max(1,len(low_lev))*100)}%)
"""

    return f"""
═══════════════════════════════════════════════════════════════
              GEÇMİŞ SİMÜLASYON SONUÇLARI (ÖĞRENMELERİN)
═══════════════════════════════════════════════════════════════
Toplam: {total} işlem | Kazanma: %{win_rate:.0f} ({len(wins)}W / {len(losses)}L)
Ort. Kazanç: %{avg_win:.2f} | Ort. Kayıp: %{avg_loss:.2f}
Long: {long_wins}/{len(long_trades)} başarılı | Short: {short_wins}/{len(short_trades)} başarılı
En İyi Coinler: {', '.join(f"{c[0]}({c[1]['win']}W)" for c in best_coins) if best_coins else 'Yeterli veri yok'}
Kaçınılması Gereken: {', '.join(f"{c[0]}({c[1]['loss']}L)" for c in worst_coins) if worst_coins else '-'}

SÜRE ANALİZİ:
  Ort. işlem süresi: {avg_dur:.0f}dk | Kazançlar: {avg_win_dur:.0f}dk | Kayıplar: {avg_loss_dur:.0f}dk
  → {'Kayıplar daha hızlı kapanıyor — SL iyi çalışıyor' if avg_loss_dur < avg_win_dur else 'Kayıplar daha uzun sürüyor — SL çok geniş olabilir'}
{first_move_section}{leverage_section}
Son 5 İşlem:
{chr(10).join(recent_lines) if recent_lines else '  Henüz sonuç yok'}

ÖNEMLİ: Bu geçmiş verilerden öğren!
- İlk hareketi aleyhte olan işlemler başarısızsa, daha kesin girişler yap
- Yüksek kaldıraçta başarı düşükse, kaldıracı düşür
- Başarısız olduğun coinlerden/yönlerden kaçın
- Başarılı olduğun pattern'leri tekrarla
- Kazanma oranın düşükse daha seçici ol
- Ortalama kayıp süresi çok kısaysa SL'leri biraz genişlet
"""


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
        prompt = build_ai_prompt(top, active_coins, leverage_range=lev_range)
        learning = _build_learning_context(past_results)
        if learning:
            prompt = prompt + "\n" + learning

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

                selections.append({
                    "coin": coin_name,
                    "symbol": matched["symbol"],
                    "direction": sel.get("direction", "long"),
                    "confidence": sel.get("confidence", 50),
                    "reason": sel.get("entry_reason", "AI seçimi"),
                    "tp_pct": sel.get("tp_suggestion_pct", cfg.get("tp_pct", SIM_TP_PCT)),
                    "sl_pct": sel.get("sl_suggestion_pct", cfg.get("sl_pct", SIM_SL_PCT)),
                    "leverage": final_lev,
                    "indicators": matched,
                    "ai_log": ai_log_text,
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


async def _save_simulation(sel: dict, price: float):
    """Yeni simülasyonu DB'ye kaydet."""
    tp_pct = float(sel["tp_pct"])
    sl_pct = float(sel["sl_pct"])
    is_long = sel["direction"] == "long"

    tp_price = round(price * (1 + tp_pct / 100), 6) if is_long else round(price * (1 - tp_pct / 100), 6)
    sl_price = round(price * (1 - sl_pct / 100), 6) if is_long else round(price * (1 + sl_pct / 100), 6)
    ind = sel.get("indicators", {})

    # ai_log kolonu var mı kontrol et
    ai_log_col = ""
    ai_log_val = ""
    ai_log_param = {}
    try:
        async with async_session() as sess:
            await sess.execute(sql_text("SELECT ai_log FROM scanner_simulations LIMIT 0"))
        ai_log_col = ", ai_log"
        ai_log_val = ", :ai_log"
        ai_log_param = {"ai_log": sel.get("ai_log")}
    except Exception:
        pass

    async with async_session() as session:
        await session.execute(sql_text(f"""
            INSERT INTO scanner_simulations
                (coin, symbol, direction, selection_mode, confidence, reason,
                 entry_price, tp_price, sl_price, tp_pct, sl_pct, leverage,
                 rsi_14, adx, volume_ratio, funding_rate, fear_greed, atr_pct, supertrend_dir,
                 status{ai_log_col})
            VALUES
                (:coin, :symbol, :direction, :mode, :confidence, :reason,
                 :entry, :tp, :sl, :tp_pct, :sl_pct, :lev,
                 :rsi, :adx, :vol, :fund, :fg, :atr, :st,
                 'open'{ai_log_val})
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
            **ai_log_param,
        })
        await session.commit()


async def _check_open_simulations(exchange, expiry_hours: int = SIM_EXPIRY_HOURS,
                                  trailing_cfg: dict = None):
    """Açık simülasyonları kontrol et: TP/SL hit mi? Trailing stop? Expire mi?"""
    open_sims = await _get_open_sims()
    if not open_sims:
        return

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
            try:
                ticker = await asyncio.wait_for(exchange.fetch_ticker(symbol), timeout=8)
                cur_price = float(ticker["last"])
                pnl_pct = ((cur_price - entry) / entry * 100) if is_long else ((entry - cur_price) / entry * 100)
                pnl_usdt = SIM_MARGIN * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100
            except Exception:
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
            print(f"[SimScanner] {sim['coin']} expired: {pnl_pct:+.2f}% [{duration_min}dk]")
            continue

        # Fiyat kontrolü
        try:
            ticker = await asyncio.wait_for(exchange.fetch_ticker(symbol), timeout=8)
            cur_price = float(ticker["last"])
        except Exception:
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
            if trailing_close:
                status = "win"
                exit_price = cur_price
                reason_tag = "TRAILING"
            else:
                status = "win" if hit_tp else "loss"
                exit_price = tp if hit_tp else sl
                reason_tag = "TP" if hit_tp else "SL"
            pnl_pct = ((exit_price - entry) / entry * 100) if is_long else ((entry - exit_price) / entry * 100)
            pnl_usdt = SIM_MARGIN * sim.get("leverage", SIM_LEVERAGE) * pnl_pct / 100

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

        # 1. Açık simülasyonları kontrol et
        expiry = cfg.get("expiry_hours", SIM_EXPIRY_HOURS)
        trailing = {
            "enabled": cfg.get("trailing_enabled", False),
            "activate_pct": cfg.get("trailing_activate_pct", 0.3),
            "callback_pct": cfg.get("trailing_callback_pct", 0.15),
        }
        await _check_open_simulations(exchange, expiry_hours=expiry, trailing_cfg=trailing)

        # 2. Yeni seçim yap
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

        past_results = await _get_past_results(20)
        selections = await _run_selection(coins, cfg, open_sims, past_results)

        # 3. Kaldıraca göre TP/SL ölçekle + seçimleri kaydet
        auto_scale = cfg.get("auto_scale_tp_sl", True)
        base_lev = cfg.get("scale_base_leverage", 10)

        opened = []
        for sel in selections:
            try:
                # Kaldıraca göre TP/SL otomatik ölçekleme
                if auto_scale and sel.get("leverage", 10) > base_lev:
                    lev = sel["leverage"]
                    scale = base_lev / lev  # 10x=1.0, 50x=0.2, 100x=0.1
                    sel["tp_pct"] = round(max(0.1, float(sel["tp_pct"]) * scale), 2)
                    sel["sl_pct"] = round(max(0.05, float(sel["sl_pct"]) * scale), 2)

                ticker = await asyncio.wait_for(
                    exchange.fetch_ticker(sel["symbol"]), timeout=8
                )
                price = float(ticker["last"])
                sel["mode"] = cfg.get("mode", "ai")
                await _save_simulation(sel, price)
                opened.append(sel["coin"])
                print(f"[SimScanner] 📊 SIM {sel['direction'].upper()} {sel['coin']} @ ${price:,.4f} "
                      f"conf={sel.get('confidence')}% lev={sel.get('leverage')}x TP={sel['tp_pct']}% SL={sel['sl_pct']}%")
            except Exception as e:
                print(f"[SimScanner] {sel['coin']} sim kayıt hatası: {e}")

        # Status güncelle
        past_stats = {}
        if past_results:
            wins = len([r for r in past_results if r["status"] == "win"])
            total = len(past_results)
            past_stats = {"win_rate": round(wins / total * 100, 1), "total": total, "wins": wins}

        await redis.set("scanner_sim:status", json.dumps({
            "coins_total": len(coins),
            "open_count": len(open_sims) + len(opened),
            "opened": opened,
            "selections_count": len(selections),
            "mode": cfg.get("mode", "ai"),
            "past_stats": past_stats,
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


async def start_scanner_simulator():
    """Arka plan görevi: sürekli simülasyon döngüsü."""
    print("[SimScanner] Scanner simülatör başladı.")
    await asyncio.sleep(90)  # DB + collector hazır olsun

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
