"""
AI Destekli Bot Engine
Akış:
1. Teknik indikatörler → sinyal tespiti
2. DeepSeek → hızlı filtre
3. Claude → derin analiz + SL/TP hesaplama
4. Risk manager → pozisyon büyüklüğü
5. Executor → işlem aç
"""
import asyncio
from datetime import datetime
from bot.risk_manager import RiskManager
from ai.indicators import calculate_all, generate_signal, volume_change_pct
from ai.openrouter import quick_filter, deep_analysis
from ai.market_context import collect_full_context
from services.data_fetcher import DataFetcher
from core.redis_client import get_redis
from core.database import async_session
from models.trade import SignalLog, BotFilter, Trade, TradeStatus
from services.economic_calendar import is_news_blackout
from bot.strategies.rsi_oversold import RSIOversoldStrategy
from bot.strategies.macd_signal import MACDSignalStrategy
from bot.strategies.bollinger_bounce import BollingerBounceStrategy
from bot.strategies.ut_bot import UTBotStrategy
from bot.strategies.supertrend import SupertrendStrategy
from bot.strategies.bb_ema_cross import BBEMACrossStrategy
from bot.strategies.dual_hedge import DualHedgeStrategy
from bot.strategies.smart_scanner import ManualCriteria, score_coin_manual, build_ai_prompt, determine_trade_direction, clamp_tp_sl
import json


def _smart_truncate(text: str, max_len: int = 300) -> str:
    """Metni kelime sınırında keser, yarıda bırakmaz."""
    if not text or len(text) <= max_len:
        return text
    truncated = text[:max_len]
    # Son boşluktan kes
    last_space = truncated.rfind(" ")
    if last_space > max_len * 0.6:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;: ") + "…"



class BotEngine:
    def __init__(self, bot_config: dict, exchange_client):
        self.config = bot_config
        self.exchange = exchange_client
        self.data_fetcher = DataFetcher(exchange_client,
                                        exchange_name=getattr(exchange_client, '_exchange_name', None))
        self.running = False
        self.paper_trades: list = []
        self.signal_history: list = []
        # Trailing stop state: {symbol: {side, entry, highest/lowest, trail_price}}
        self._trailing: dict = {}
        self._hedge_state: dict = {} # {symbol: {long: {is_partial_closed}, short: {is_partial_closed}}}
        self._last_status_update = 0
        # Borsa bakiyesi cache (60 sn aralıkla güncellenir)
        self._live_balance: dict = {}      # {"free": 0, "total": 0, "used": 0}
        self._balance_updated_at: float = 0  # timestamp

        self.risk = RiskManager(
            balance=bot_config.get("initial_balance", 1000),
            risk_per_trade=bot_config.get("risk_per_trade", 0.01),
            max_daily_loss=bot_config.get("max_daily_loss", 0.05),
            leverage=bot_config.get("leverage", 3),
        )

    async def _refresh_balance(self, force: bool = False):
        """Borsa bakiyesini 60 sn cache ile çek. force=True → anında çek."""
        import time as _time
        now = _time.time()
        if not force and (now - self._balance_updated_at) < 60:
            return self._live_balance  # cache hâlâ taze

        try:
            bal = await asyncio.wait_for(self.exchange.get_balance(), timeout=10)
            self._live_balance = {
                "free":  float(bal.get("free", 0) or 0),
                "total": float(bal.get("total", 0) or 0),
                "used":  float(bal.get("used", 0) or 0),
            }
            self._balance_updated_at = now
            # Risk manager bakiyesini de güncelle
            if self._live_balance["free"] > 0:
                self.risk.current_balance = self._live_balance["free"]
        except Exception as e:
            print(f"[Bot {self.config.get('name', '?')}] Bakiye çekilemedi: {e}")

        return self._live_balance

    async def run(self):
        self.running = True
        redis = get_redis()
        symbol = self.config["symbol"]
        strategy = self.config.get("strategy", "ema_cross")
        bot_name = self.config['name']
        print(f"[Bot {bot_name}] Başlatıldı — {symbol} | Strateji: {strategy} | Exchange: {type(self.exchange).__name__}")
        print(f"[Bot {bot_name}] Config: paper_mode={self.config.get('paper_mode')}, leverage={self.config.get('leverage')}, params={self.config.get('params')}")

        # İlk bağlantı testi — load_markets zorunlu (MEXC vb. için)
        try:
            await asyncio.wait_for(self.exchange.exchange.load_markets(), timeout=30)
            print(f"[Bot {bot_name}] load_markets() OK — {len(self.exchange.exchange.markets)} market yüklendi")
        except asyncio.TimeoutError:
            print(f"[Bot {bot_name}] load_markets() TIMEOUT (30s) — devam ediliyor")
        except Exception as e:
            print(f"[Bot {bot_name}] load_markets() HATASI: {e}")

        if symbol != "AUTO":
            try:
                ticker = await asyncio.wait_for(self.exchange.exchange.fetch_ticker(symbol), timeout=15)
                print(f"[Bot {bot_name}] Bağlantı OK — fiyat: {ticker.get('last')}")
            except asyncio.TimeoutError:
                print(f"[Bot {bot_name}] fetch_ticker TIMEOUT (15s) — devam ediliyor")
            except Exception as e:
                print(f"[Bot {bot_name}] BAĞLANTI HATASI: {e}")
        else:
            print(f"[Bot {bot_name}] AUTO mod — coin seçimi otomatik yapılacak")

        while self.running:
            try:
                if self.risk.killed:
                    await self._alert("🔴 Kill switch aktif — günlük kayıp limitine ulaşıldı.")
                    break

                # ── Hedge Bot Stratejisi (Çift Yönlü) ───────────────
                if strategy == "hedge_bot":
                    await self._run_hedge_cycle(redis, symbol)
                    await asyncio.sleep(5)  # 5sn'de bir fiyat kontrolü
                    continue

                # ── Dual Hedge Bot Stratejisi ─────────────────────────
                if strategy == "dual_hedge":
                    await self._run_dual_hedge_cycle(redis, symbol)
                    await asyncio.sleep(5)  # 5sn'de bir kontrol (dinamik TP/SL + trailing için hızlı tepki şart)
                    continue

                # ── Grid Bot Stratejisi ───────────────────────────────
                if strategy == "grid_bot":
                    await self._run_grid_cycle(redis, symbol)
                    await asyncio.sleep(10)   # 10sn'de bir fiyat kontrolü
                    continue

                # ── Özel Sinyal + TradingView Webhook Stratejileri ───────
                # Her ikisi de aynı Redis anahtarından (custom_signal:SEMBOL) okur.
                # TradingView webhook geldiğinde signals.py bu anahtara yazar.
                if strategy in ("custom_signal", "tradingview_webhook"):
                    try:
                        await self._run_custom_signal_cycle(redis, symbol)
                    except Exception as cycle_err:
                        print(f"[Bot {bot_name}] ❌ Signal cycle HATASI: {cycle_err}")
                        import traceback
                        traceback.print_exc()
                        # Hata olsa bile status yaz — frontend görsün
                        try:
                            err_status = {
                                "signal": None,
                                "price": 0,
                                "error": str(cycle_err)[:300],
                                "risk": {"balance": self.risk.balance, "daily_pnl": self.risk.daily_pnl, "daily_pnl_pct": self.risk.daily_pnl_pct, "killed": self.risk.killed},
                                "position": None,
                                "ts": datetime.utcnow().isoformat(),
                            }
                            await redis.set(f"bot:{self.config['id']}:status", json.dumps(err_status))
                            await redis.set(f"bot:{self.config['id']}:last_error", f"{datetime.utcnow().isoformat()} | {str(cycle_err)[:500]}", ex=3600)
                        except Exception:
                            pass
                    await asyncio.sleep(0.1)
                    continue

                # ── Smart Scanner Bot ─────────────────────────────────
                if strategy == "smart_scanner":
                    await self._run_smart_scanner_cycle(redis)
                    scan_interval = int(self.config.get("params", {}).get("scan_interval", 120))
                    mode = self.config.get("params", {}).get("selection_mode", "manual")
                    min_interval = 60 if mode == "ai" else 30
                    await asyncio.sleep(max(scan_interval, min_interval))
                    continue

                # 0. Trailing stop kontrolü (aktif pozisyon varsa)
                if symbol in self._trailing:
                    try:
                        ticker = await self.exchange.exchange.fetch_ticker(symbol)
                        cur_price = float(ticker["last"])
                        if await self._check_trailing_stop(symbol, cur_price):
                            pos = await self._get_current_position(symbol)
                            if pos:
                                await self._close_position(symbol, pos)
                                await self._alert(f"📊 Trailing Stop tetiklendi — {symbol} @ ${cur_price:,.2f}")
                    except Exception as e:
                        print(f"[Bot] Trailing stop kontrolü hatası: {e}")

                # 1. Veri çek (Redis → DB → Borsa, otomatik kayıt)
                ohlcv = await self.data_fetcher.get_ohlcv(symbol, "1h", 200)
                if len(ohlcv) < 60:
                    await asyncio.sleep(60)
                    continue

                # 2. Teknik indikatörler + strateji bazlı sinyal
                ind = calculate_all(ohlcv)
                close = ind.get("close", 0)

                signal = self._get_strategy_signal(strategy, ohlcv, ind)

                ai_result = None

                if signal:
                    print(f"[Bot] Teknik sinyal: {signal} @ {close}")
                    # Sinyal geldi — logla
                    await self._log_signal(signal, close, source=strategy, reason="Teknik sinyal", action="received")

                    # Akıllı Filtre Kontrolü
                    filter_block = await self._check_smart_filters(signal, close)
                    if filter_block:
                        reason = filter_block.get("reason", "Akıllı filtre")
                        print(f"[Bot] Filtre aktif — sinyal engellendi: {reason}")
                        await self._log_signal(signal, close, source=strategy, action="filtered",
                            reject_reason=reason)
                        await asyncio.sleep(300)
                        continue

                    # 3. Tüm piyasa bağlamını paralel topla
                    funding = await self._get_funding(symbol)
                    vol_chg = volume_change_pct(ohlcv)
                    full_ctx = await collect_full_context(self.exchange, symbol)

                    filter_result = await quick_filter(
                        symbol=symbol,
                        side=signal,
                        price=close,
                        rsi=ind["rsi"],
                        macd_hist=ind["macd_hist"],
                        funding_rate=funding,
                        volume_change_pct=vol_chg,
                        fear_greed=full_ctx.get("fear_greed"),
                        order_book=full_ctx.get("order_book"),
                        mtf=full_ctx.get("mtf"),
                    )

                    print(f"[Bot] DeepSeek filtre: {filter_result}")

                    # DeepSeek bilgi amaçlı, Claude her zaman çalışır
                    print(f"[Bot] DeepSeek skoru: {filter_result.get('strength')}/10 — {filter_result.get('reason')}")

                    # 4. Claude derin analiz — tüm verilerle
                    ai_result = await deep_analysis(
                        symbol=symbol,
                        side=signal,
                        price=close,
                        candles=ohlcv,
                        indicators=ind,
                        market_context={
                            "funding_rate": funding,
                            "volume_change": vol_chg,
                        },
                        full_context=full_ctx,
                    )

                    print(f"[Bot] Claude analiz: confidence={ai_result.get('confidence')} approved={ai_result.get('approved')}")

                    # 5. Minimum güven skoru kontrolü
                    min_confidence = self.config.get("min_confidence", 60)
                    if ai_result.get("approved") and ai_result.get("confidence", 0) >= min_confidence:
                        stop_loss = ai_result.get("stop_loss") or self.risk.atr_stop_loss(
                            close, ind["atr"], signal
                        )
                        qty = self.risk.position_size(close, stop_loss)

                        if qty > 0:
                            await self._execute(signal, close, qty, stop_loss, ai_result)
                            await self._log_signal(signal, close, source=strategy, action="executed",
                                confidence=ai_result.get("confidence"),
                                tp_price=ai_result.get("take_profit"), sl_price=stop_loss)
                    else:
                        reason = ai_result.get("analysis", "Güven skoru yetersiz")
                        print(f"[Bot] Sinyal reddedildi: {reason}")
                        await self._log_signal(signal, close, source=strategy, action="rejected",
                            reject_reason=f"AI confidence={ai_result.get('confidence', 0)}, min={min_confidence}. {reason}",
                            confidence=ai_result.get("confidence"))

                # Durumu Redis'e yaz
                status_data = {
                    "name": self.config["name"],
                    "symbol": symbol,
                    "signal": signal,
                    "price": close,
                    "indicators": {
                        "rsi": ind.get("rsi"),
                        "ema9": ind.get("ema9"),
                        "ema21": ind.get("ema21"),
                        "macd_hist": ind.get("macd_hist"),
                    },
                    "ai_result": ai_result,
                    "risk": self.risk.status(),
                    "signal_history": self.signal_history[-5:],
                    "ts": datetime.utcnow().isoformat(),
                }
                await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

                await asyncio.sleep(300)  # 5 dakikada bir kontrol

            except Exception as e:
                print(f"[Bot {self.config['name']}] Hata: {e}")
                await self._alert(f"⚠️ Bot hatası: {e}")
                await asyncio.sleep(60)

    def _get_strategy_signal(self, strategy: str, ohlcv: list, ind: dict) -> str | None:
        """Strateji bazlı sinyal üret."""
        params = self.config.get("params", {})

        if strategy == "ema_cross":
            return generate_signal(ind)

        elif strategy == "rsi_oversold":
            strat = RSIOversoldStrategy(
                rsi_period=int(params.get("rsi_period", 14)),
                oversold=int(params.get("oversold", 30)),
                overbought=int(params.get("overbought", 70)),
                rsi_ema_filter=int(params.get("rsi_ema_filter", 200)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "macd_signal":
            strat = MACDSignalStrategy(
                fast=int(params.get("fast", 12)),
                slow=int(params.get("slow", 26)),
                signal=int(params.get("signal", 9)),
                hist_threshold=float(params.get("hist_threshold", 0)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "bollinger_bounce":
            strat = BollingerBounceStrategy(
                period=int(params.get("period", 20)),
                std_dev=float(params.get("std_dev", 2.0)),
                squeeze=bool(params.get("squeeze", True)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "ut_bot":
            strat = UTBotStrategy(
                atr_period=int(params.get("atr_period", 10)),
                atr_mult=float(params.get("atr_mult", 3.0)),
                heikin_ashi=bool(params.get("heikin_ashi", False)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "supertrend":
            strat = SupertrendStrategy(
                period=int(params.get("period", 10)),
                mult=float(params.get("mult", 3.0)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "bb_ema_cross":
            strat = BBEMACrossStrategy(
                bb_period=int(params.get("bb_period", 20)),
                bb_std=float(params.get("bb_std", 2.0)),
                ema_fast=int(params.get("ema_fast", 5)),
                ema_slow=int(params.get("ema_slow", 13)),
                touch_pct=float(params.get("touch_pct", 0.3)),
                setup_lookback=int(params.get("setup_lookback", 5)),
                direction=str(params.get("direction", "both")),
                exit_at_bands=bool(params.get("exit_at_bands", True)),
            )
            result = strat.calculate(ohlcv)
            return result.get("signal")

        elif strategy == "funding_rate":
            # Funding rate ayrı cycle'da çalışır ama fallback
            return generate_signal(ind)

        else:
            return generate_signal(ind)

    async def _execute(self, side: str, price: float, qty: float, stop_loss: float, ai_result: dict, symbol_override: str = None):
        paper = self.config.get("paper_mode", True)
        mode = "📝 PAPER" if paper else "🟢 CANLI"
        bot_name = self.config['name']
        confidence = ai_result.get("confidence", 0)
        take_profit = ai_result.get("take_profit")
        analysis = ai_result.get("analysis", "")
        params = self.config.get("params", {})
        order_type = params.get("order_type", "market")  # market veya limit

        trade = {
            "side": side,
            "entry": price,
            "qty": qty,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "confidence": confidence,
            "analysis": analysis,
            "pos_side": ai_result.get("pos_side"), # Added for hedge mode support
            "ts": datetime.utcnow().isoformat(),
        }

        if paper:
            print(f"[Bot {bot_name}] 📝 PAPER trade: {side} {qty} @ {price} ({trade.get('pos_side')})")
            self.paper_trades.append(trade)
        else:
            symbol = symbol_override or self.config["symbol"]
            
            # AI veya webhook'tan gelen dinamik kaldıracı kullan + min/max sınırla
            leverage = int(ai_result.get("dynamic_leverage") or self.risk.leverage)
            min_lev = int(params.get("min_leverage", 0))
            max_lev = int(params.get("max_leverage", 0))
            if min_lev > 0 and leverage < min_lev:
                print(f"[Bot {bot_name}] Leverage {leverage}x < min {min_lev}x → {min_lev}x")
                leverage = min_lev
            if max_lev > 0 and leverage > max_lev:
                print(f"[Bot {bot_name}] Leverage {leverage}x > max {max_lev}x → {max_lev}x")
                leverage = max_lev

            try:
                await self.exchange.set_leverage(symbol, leverage)
                print(f"[Bot {bot_name}] Leverage {leverage}x ayarlandı")
            except Exception as e:
                print(f"[Bot {bot_name}] Leverage ayar hatası (devam): {e}")

            # Eski stop/trailing emirleri temizle (yeni işlem açılacak, birikme olmasın)
            # Hedge modda sadece kendi yönünün emirlerini sil, karşı yönün TP/SL'ine dokunma!
            cancel_pos_side = "long" if side.lower() == "buy" else "short"
            try:
                await self._cancel_existing_stop_orders(symbol, pos_side=cancel_pos_side)
                await self._cancel_existing_trailing_orders(symbol, pos_side=cancel_pos_side)
            except Exception as e:
                print(f"[Bot {bot_name}] Eski emirleri temizleme hatası (devam): {e}")

            # Kontrat boyutu hesabı
            amount = qty
            try:
                market = self.exchange.exchange.market(symbol)
                contract_size = float(market.get("contractSize", 1) or 1)
                exchange_name = getattr(self.exchange, '_exchange_name', '')
                
                # Webhook'ta açıkça miktar belirtilmişse onu kullan
                if ai_result.get("explicit_amount"):
                    amount = max(1, int(float(ai_result["explicit_amount"])))
                    print(f"[Bot {bot_name}] Explicit amount kullanılıyor: {amount}")
                elif exchange_name == "mexc" and contract_size > 0:
                    # MEXC: notional = margin * leverage, kontrat = notional / (fiyat * contractSize)
                    # Smart Scanner margin_usdt'yi ai_result içinde gönderir — onu kullan
                    if ai_result.get("margin_usdt") and float(ai_result["margin_usdt"]) > 0:
                        margin_usdt = float(ai_result["margin_usdt"])
                        print(f"[Bot {bot_name}] Scanner margin kullanılıyor: ${margin_usdt:.2f}")
                    else:
                        params_cfg = self.config.get("params", {})
                        risk_val = self.risk.risk_per_trade
                        margin_usdt = risk_val if risk_val > 1.0 else self.risk.current_balance * risk_val
                        ai_modifier = float(ai_result.get("ai_modifier", 1.0))
                        if ai_modifier != 1.0:
                            margin_usdt *= ai_modifier
                            print(f"[Bot {bot_name}] AI modifier uygulandı: {ai_modifier:.2f}x -> margin_usdt: ${margin_usdt:.2f}")

                    notional = margin_usdt * leverage
                    amount = max(1, int(notional / (price * contract_size)))
                    print(f"[Bot {bot_name}] MEXC Kontrat: margin=${margin_usdt:.2f} × {leverage}x = ${notional:.2f} → {amount} kontrat @ ${price} (contractSize={contract_size})")
                elif contract_size > 0:
                    ai_modifier = float(ai_result.get("ai_modifier", 1.0))
                    if ai_modifier != 1.0:
                        amount = max(1, int((qty * ai_modifier) / contract_size))
                    else:
                        amount = max(1, int(qty / contract_size))
                    print(f"[Bot {bot_name}] Kontrat: qty={qty} → amount={amount} (contractSize={contract_size})")
            except Exception as e:
                print(f"[Bot {bot_name}] Kontrat hesabı hatası (devam): {e}")

            # TP/SL fiyatları hesapla
            tp_price = round(take_profit, 2) if take_profit else None
            sl_price = round(stop_loss, 2) if stop_loss else None

            # GÜVENLİK: TP ve SL ikisi de yoksa işlem açma
            if not tp_price and not sl_price:
                print(f"[Bot {bot_name}] ✗ TP ve SL ikisi de None — işlem açılmıyor (güvenlik)")
                return

            # Trailing stop parametreleri — trailing_enabled=False ise kesinlikle trailing yok
            trailing_enabled = params.get("trailing_enabled", False)
            if trailing_enabled:
                trailing_callback_rate = float(
                    params.get("trailing_callback_rate")
                    or params.get("trailing_stop_pct")
                    or params.get("trailing_callback_pct")
                    or 0
                )
            else:
                trailing_callback_rate = 0  # Trailing kapalıysa kesinlikle 0
            trailing_active_price = tp_price if trailing_callback_rate > 0 else None

            if trailing_callback_rate > 0:
                print(f"[Bot {bot_name}] İşlem açılıyor: {side} {amount} {symbol} type={order_type} "
                      f"SL={sl_price} TRAILING(active={trailing_active_price}, callback={trailing_callback_rate}%) "
                      f"pos_side={trade.get('pos_side')}")
            else:
                print(f"[Bot {bot_name}] İşlem açılıyor: {side} {amount} {symbol} type={order_type} TP={tp_price} SL={sl_price} pos_side={trade.get('pos_side')}")

            # TP/SL yüzdeleri — MEXC fill price'tan recalc için
            order_tp_pct = ai_result.get("tp_pct") if ai_result else None
            order_sl_pct = ai_result.get("sl_pct") if ai_result else None

            try:
                order = await self.exchange.place_order(
                    symbol, side, amount, order_type,
                    price=price if order_type == "limit" else None,
                    tp_price=tp_price, sl_price=sl_price,
                    pos_side=trade.get("pos_side"),
                    trailing_callback_rate=trailing_callback_rate if trailing_callback_rate > 0 else None,
                    trailing_active_price=trailing_active_price,
                    tp_pct=order_tp_pct, sl_pct=order_sl_pct,
                )
                print(f"[Bot {bot_name}] ✓ İşlem başarılı: order_id={order.get('id', 'N/A')}")
            except RuntimeError as tpsl_err:
                # TP/SL konulamadı — pozisyon korumasız, acil kapat
                err_msg = str(tpsl_err)
                if "TP/SL" in err_msg:
                    print(f"[Bot {bot_name}] ✗ TP/SL HATASI — pozisyon acil kapatılıyor: {tpsl_err}")
                    try:
                        close_side = "sell" if side == "buy" else "buy"
                        await self.exchange.exchange.create_market_order(symbol, close_side, amount, params={"positionSide": trade.get("pos_side", "").upper()} if trade.get("pos_side") else {})
                        print(f"[Bot {bot_name}] ✓ Korumasız pozisyon kapatıldı (TP/SL konulamadığı için)")
                    except Exception as close_err:
                        print(f"[Bot {bot_name}] ✗ KRİTİK: Korumasız pozisyon KAPATILAMADI: {close_err}")
                    # Redis'e hata yaz
                    try:
                        from core.redis_client import get_redis
                        _redis = get_redis()
                        await _redis.set(
                            f"bot:{self.config['id']}:last_error",
                            f"{datetime.utcnow().isoformat()} | TP/SL HATASI — pozisyon kapatıldı: {err_msg[:300]}",
                            ex=3600
                        )
                    except Exception:
                        pass
                    raise
                else:
                    raise
            except Exception as order_err:
                print(f"[Bot {bot_name}] ✗ Order HATASI: {order_err}")
                # Redis'e hata yaz (frontend görsün)
                try:
                    from core.redis_client import get_redis
                    _redis = get_redis()
                    await _redis.set(
                        f"bot:{self.config['id']}:last_error",
                        f"{datetime.utcnow().isoformat()} | ORDER HATASI: {str(order_err)[:400]}",
                        ex=3600
                    )
                except Exception:
                    pass
                raise

        self.signal_history.append(trade)

        # Trailing stop başlat (sadece MEXC native trailing kullanılmıyorsa client-side trailing)
        exchange_name = getattr(self.exchange, '_exchange_name', '')
        use_native_trailing = trailing_callback_rate > 0 and exchange_name == "mexc"
        if not use_native_trailing:
            trail_pct = float(params.get("trailing_stop_pct", 0))
            if trail_pct > 0:
                self._init_trailing(self.config["symbol"], side, price, trail_pct)

        if trailing_callback_rate > 0:
            trail_info = f" | Trailing({trailing_callback_rate}% @ ${trailing_active_price:,.2f})" if trailing_active_price else f" | Trailing({trailing_callback_rate}%)"
        else:
            trail_info = ""

        msg = (
            f"{mode} | {'🟢 LONG' if side == 'buy' else '🔴 SHORT'} | "
            f"{self.config['symbol'].replace('/USDT:USDT', '')} @ ${price:,.2f}\n"
            f"Miktar: {qty} | SL: ${stop_loss:,.2f}"
            + (f" | TP: ${take_profit:,.2f}" if take_profit and not use_native_trailing else "")
            + trail_info
            + f"\nAI Güven: %{confidence} | {analysis}"
        )
        print(f"[Bot] {msg}")
        await self._alert(msg)

    async def _get_position_info(self, symbol: str) -> dict | None:
        """Açık pozisyon bilgisi: side, size, entry, pnl, pnl_pct"""
        pos_list = await self._get_hedge_positions(symbol)
        return pos_list[0] if pos_list else None

    async def _get_hedge_positions(self, symbol: str) -> list:
        """Hedge mode uyumlu pozisyon listesi döner."""
        exchange_name = getattr(self.exchange, '_exchange_name', '')

        # MEXC: CCXT fetch_positions V1 endpoint hatası veriyor — direkt contract API kullan
        if exchange_name == "mexc":
            return await self._get_mexc_positions_direct(symbol)

        try:
            positions = await asyncio.wait_for(
                self.exchange.exchange.fetch_positions([symbol]), timeout=15
            )
            found = []
            for pos in positions:
                contracts = float(pos.get("contracts", 0))
                if contracts == 0:
                    continue

                entry = float(pos.get("entryPrice", 0) or 0)
                notional = float(pos.get("notional", 0) or 0)
                unrealized_pnl = float(pos.get("unrealizedPnl", 0) or 0)

                info = pos.get("info", {})
                if not unrealized_pnl and info:
                    unrealized_pnl = float(info.get("unrealizedPnl", 0) or 0)
                if not notional and info:
                    notional = float(info.get("positionValue", 0) or info.get("openOrderInitialMargin", 0) or 0)

                pnl_pct = (unrealized_pnl / notional * 100) if notional else 0

                found.append({
                    "side": pos.get("side", ""), # 'long' or 'short'
                    "size": contracts,
                    "entry_price": entry,
                    "notional": round(notional, 2),
                    "pnl_usdt": round(unrealized_pnl, 4),
                    "pnl_pct": round(pnl_pct, 2),
                    "leverage": int(pos.get("leverage", 0) or 0),
                    "tp": float(pos.get("takeProfitPrice", 0) or 0),
                    "sl": float(pos.get("stopLossPrice", 0) or 0),
                })
            return found
        except Exception as e:
            print(f"[Bot] Pozisyon listesi hatası: {e}")
            return []

    async def _get_mexc_positions_direct(self, symbol: str) -> list:
        """MEXC futures pozisyonlarını direkt contract API ile çeker."""
        try:
            mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
            resp = await asyncio.wait_for(
                self.exchange.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol}),
                timeout=15
            )
            data = resp.get("data", []) if isinstance(resp, dict) else resp
            if not data or not isinstance(data, list):
                return []

            # Güncel fiyatı bir kez çek (PnL hesaplama için)
            current_price = 0.0
            try:
                ticker = await self.exchange.exchange.contractPublicGetTicker({"symbol": mexc_symbol})
                td = ticker.get("data", {})
                if isinstance(td, dict):
                    current_price = float(td.get("lastPrice", 0) or 0)
                elif isinstance(td, list):
                    for t in td:
                        if t.get("symbol") == mexc_symbol:
                            current_price = float(t.get("lastPrice", 0) or 0)
                            break
            except Exception:
                pass

            found = []
            for pos in data:
                vol = float(pos.get("holdVol", 0) or 0)
                if vol == 0:
                    continue
                pos_type = int(pos.get("positionType", 1))  # 1=long, 2=short
                side = "long" if pos_type == 1 else "short"
                entry = float(pos.get("openAvgPrice", 0) or 0)
                leverage = int(pos.get("leverage", 0) or 0)
                contract_size = float(pos.get("contractSize", 0.001) or 0.001)

                # Notional hesapla
                notional = float(pos.get("positionValue", 0) or 0)
                if not notional and entry > 0:
                    notional = vol * entry * contract_size

                # ── PnL: MEXC API değeri veya manuel hesap ──────────────────
                _raw_pnl = pos.get("unrealisedPnl") or pos.get("unrealizedPnl") or 0
                unrealized_pnl = float(_raw_pnl)

                # API'den gelen PnL 0 ise ve fiyat bilgisi varsa kendimiz hesapla
                if unrealized_pnl == 0 and current_price > 0 and entry > 0:
                    position_value = vol * contract_size  # coin cinsinden pozisyon
                    if side == "long":
                        unrealized_pnl = position_value * (current_price - entry)
                    else:
                        unrealized_pnl = position_value * (entry - current_price)

                # Debug: MEXC pozisyon verilerini logla
                print(f"[MEXC Pos] {side} vol={vol} entry={entry} cur={current_price} "
                      f"rawPnl={_raw_pnl} calcPnl={unrealized_pnl:.4f} "
                      f"oim={pos.get('oim')} im={pos.get('im')} notional={notional}")

                # PnL%: initial margin (oim veya im) üzerinden hesapla — MEXC ile aynı
                initial_margin = float(pos.get("oim", 0) or pos.get("im", 0) or 0)
                if initial_margin > 0:
                    pnl_pct = (unrealized_pnl / initial_margin) * 100
                elif notional > 0 and leverage > 0:
                    margin = notional / leverage
                    pnl_pct = (unrealized_pnl / margin * 100) if margin else 0
                else:
                    pnl_pct = 0

                found.append({
                    "side": side,
                    "size": vol,
                    "entry_price": entry,
                    "notional": round(notional, 2),
                    "pnl_usdt": round(unrealized_pnl, 4),
                    "pnl_pct": round(pnl_pct, 2),
                    "leverage": leverage,
                    "tp": float(pos.get("takeProfitPrice", 0) or 0),
                    "sl": float(pos.get("stopLossPrice", 0) or 0),
                })
            return found
        except Exception as e:
            print(f"[Bot] MEXC pozisyon hatası: {e}")
            return []

    async def _run_dual_hedge_cycle(self, redis, symbol: str):
        """Dual Hedge döngüsü: Hem Long hem Short yönetimi."""
        if not hasattr(self, "_hedge_strat"):
            params = self.config.get("params", {})
            self._hedge_strat = DualHedgeStrategy(params)

        positions = await self._get_hedge_positions(symbol)
        
        # ATR her zaman lazım (dinamik TP/SL için)
        timeframe = self.config.get("params", {}).get("timeframe", "1h")
        ohlcv = await self.data_fetcher.get_ohlcv(symbol, timeframe, 20)
        atr = self._calc_atr(ohlcv)
        
        # 1. Eğer hiç pozisyon yoksa, her iki yöne de aç
        if len(positions) == 0:
            print(f"[Bot] Dual Hedge başlatılıyor — {symbol}")
            ticker = await self.exchange.exchange.fetch_ticker(symbol)
            price = float(ticker["last"])
            
            entry_setup = self._hedge_strat.calculate_entry(price, atr)
            
            # Risk/Miktar hesabı (basitleştirilmiş: her iki yön için de aynı risk)
            stop_loss_long = entry_setup["long"]["sl"]
            qty = self.risk.position_size(price, stop_loss_long)
            
            if qty > 0:
                # Long aç
                await self._execute("buy", price, qty, stop_loss_long, {
                    "confidence": 100, "take_profit": entry_setup["long"]["tp"], 
                    "analysis": "Dual Hedge: Initial Long", "pos_side": "long"
                })
                # Short aç
                await self._execute("sell", price, qty, entry_setup["short"]["sl"], {
                    "confidence": 100, "take_profit": entry_setup["short"]["tp"], 
                    "analysis": "Dual Hedge: Initial Short", "pos_side": "short"
                })
        
        # 2. Eğer pozisyonlar varsa, dinamik TP/SL kontrolü yap
        elif len(positions) > 0:
            ticker = await self.exchange.exchange.fetch_ticker(symbol)
            current_price = float(ticker["last"])
            
            # Stratejiye pozisyonları gönder (mevcut TP/SL'ler dahil)
            pos_data = []
            symbol_state = self._hedge_state.setdefault(symbol, {"long": {"is_partial_closed": False}, "short": {"is_partial_closed": False}})
            
            # Mevcut pozisyonları stratejiye uygun formata sok ve state'i ekle
            active_sides = [p["side"] for p in positions]
            # Eğer bir taraf tamamen kapandıysa state'i sıfırla
            for side in ["long", "short"]:
                if side not in active_sides:
                    symbol_state[side]["is_partial_closed"] = False

            for p in positions:
                pos_data.append({
                    "side": p["side"],
                    "entry_price": p["entry_price"],
                    "current_tp": p["tp"],
                    "current_sl": p["sl"],
                    "size": p["size"],
                    "is_partial_closed": symbol_state[p["side"]]["is_partial_closed"]
                })
            
            updates = self._hedge_strat.check_updates(current_price, pos_data, atr=atr)
            
            for upd in updates:
                if upd.get("action") == "partial_close":
                    side = upd["side"]
                    if symbol_state[side]["is_partial_closed"]:
                        continue
                        
                    pos = next((p for p in positions if p["side"] == side), None)
                    if pos:
                        close_qty = pos["size"] / 2
                        print(f"[Bot] 💰 Kısmi Kâr Al (Partial Close): {symbol} {side} miktar={close_qty}")
                        try:
                            # Ters yönde işlem açarak pozisyonu küçült
                            close_side = "sell" if side == "long" else "buy"
                            await self.exchange.place_order(symbol, close_side, close_qty, "market", pos_side=side)
                            symbol_state[side]["is_partial_closed"] = True
                            await self._alert(f"💰 {symbol} {side.upper()} Kısmi Kâr Alındı (%50)\nFiyat: {current_price:.2f}")
                        except Exception as e:
                            print(f"[Bot] Kısmi kapatma hatası: {e}")
                else:
                    # Normal TP/SL güncelleme — önce eski emirleri iptal et
                    print(f"[Bot] Dinamik TP/SL Güncelleme: {upd['side']} -> SL: {upd.get('sl')}, TP: {upd.get('tp')}")
                    try:
                        await self._cancel_existing_stop_orders(symbol, pos_side=upd["side"])
                        await self.exchange.modify_position_tpsl(
                            symbol,
                            tp_price=upd.get("tp"),
                            sl_price=upd.get("sl"),
                            pos_side=upd["side"]
                        )
                        if upd.get("sl"):
                            await self._alert(f"🔄 Dinamik Stop Güncelleme: {symbol} {upd['side']}\nYeni SL: {upd.get('sl'):.2f}")
                    except Exception as e:
                        print(f"[Bot] TP/SL güncelleme hatası: {e}")

        # Durum yaz
        status_data = {
            "name": self.config["name"],
            "symbol": symbol,
            "positions": positions,
            "risk": self.risk.status(),
            "ts": datetime.utcnow().isoformat(),
        }
        await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

    async def _check_smart_filters(self, signal_type: str, price: float) -> dict | None:
        """Akıllı filtreleri kontrol et. Filtreye takılırsa {reason: ...} döner, yoksa None."""
        try:
            async with async_session() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(BotFilter).where(BotFilter.bot_id == self.config["id"])
                )
                f = result.scalar_one_or_none()
                if not f:
                    return None
                
                # 1. Haber Koruması
                if f.news_protection_enabled:
                    minutes = f.news_blackout_minutes or 30
                    from services.economic_calendar import is_news_blackout
                    blackout = await is_news_blackout(minutes_buffer=minutes)
                    if blackout.get("blackout"):
                        return {"reason": f"Haber Blackout: {blackout.get('reason')}"}
                
                # 2. Akıllı Saat Filtresi
                if f.smart_hours_enabled and f.blocked_hours:
                    import json, datetime
                    try:
                        blocked_hours = json.loads(f.blocked_hours)
                        current_hour = datetime.datetime.utcnow().hour
                        if current_hour in blocked_hours:
                            return {"reason": f"Akıllı Saat Filtresi: {current_hour}:00 UTC yasaklı saat diliminde."}
                    except:
                        pass
                        
                # 3. Öz-Öğrenme (Self-Learning) - Geçmiş Win Rate'e göre iptal
                if f.self_learning_enabled and f.min_win_rate_threshold:
                    from models.trade import Trade, TradeStatus
                    from sqlalchemy import func
                    trades_res = await session.execute(
                        select(Trade).where(
                            Trade.bot_id == self.config["id"], 
                            Trade.status == TradeStatus.CLOSED
                        ).order_by(Trade.id.desc()).limit(20)
                    )
                    recent_trades = trades_res.scalars().all()
                    if len(recent_trades) >= 10:
                        wins = len([t for t in recent_trades if (t.pnl or 0) > 0])
                        win_rate = wins / len(recent_trades)
                        if win_rate < f.min_win_rate_threshold:
                            return {"reason": f"Öz-Öğrenme Filtresi: Güncel Win Rate %{win_rate*100:.1f} < Limit %{f.min_win_rate_threshold*100:.1f}"}

                # 4 & 5. Volatilite ve Trend Filtresi (Eğer aktifse, mum datasını çek ve kontrol et)
                if f.volatility_filter_enabled or f.trend_filter_enabled:
                    ohlcv = await self.data_fetcher.get_ohlcv(self.config["symbol"], "1h", 200)
                    if len(ohlcv) > 50:
                        from ai.indicators import calculate_all
                        ind = calculate_all(ohlcv)
                        
                        if f.volatility_filter_enabled and f.max_volatility_atr:
                            current_atr = ind.get("atr", 0)
                            if current_atr > f.max_volatility_atr:
                                return {"reason": f"Yüksek Volatilite Filtresi: ATR {current_atr:.4f} > Limit {f.max_volatility_atr:.4f}"}
                                
                        if f.trend_filter_enabled:
                            ema200 = ind.get("ema200", 0)
                            if ema200 > 0:
                                if signal_type == "buy" and price < ema200:
                                    return {"reason": "Trend Filtresi: Fiyat EMA200'ün altında, yükseliş trendi yok (Buy sinyali iptal)."}
                                if signal_type == "sell" and price > ema200:
                                    return {"reason": "Trend Filtresi: Fiyat EMA200'ün üstünde, düşüş trendi yok (Sell sinyali iptal)."}

        except Exception as e:
            print(f"[Bot] Akıllı filtre kontrol hatası: {e}")
            import traceback
            traceback.print_exc()
        return None

    async def _analyze_filters_full(self, signal_type: str, price: float, timeframe: str = "1h") -> dict:
        """
        Tüm filtreleri HER ZAMAN analiz eder (aktif olsun olmasın).
        Döner: {should_block, reject_reason, indicators, analysis}
        """
        result = {
            "should_block": False,
            "reject_reason": "",
            "indicators": {"rsi_14": None, "volatility_atr": None, "volume_ratio": None, "ema200_dist": None},
            "analysis": "",
        }
        lines = []

        try:
            # ── İndikatörler (her zaman çalışır) ─────────────────────────────
            ohlcv = await self.data_fetcher.get_ohlcv(self.config["symbol"], timeframe, 200)
            ema200_val = None
            if len(ohlcv) > 50:
                from ai.indicators import calculate_all
                ind = calculate_all(ohlcv)
                rsi = ind.get("rsi")
                atr = ind.get("atr")
                ema200_val = ind.get("ema200")

                result["indicators"]["rsi_14"] = round(float(rsi), 2) if rsi else None
                result["indicators"]["volatility_atr"] = round(float(atr), 6) if atr else None
                if ema200_val and ema200_val > 0:
                    dist = round((price - ema200_val) / ema200_val * 100, 2)
                    result["indicators"]["ema200_dist"] = dist
                    trend_ok = not ((signal_type == "buy" and price < ema200_val) or
                                    (signal_type == "sell" and price > ema200_val))
                    lines.append(f"EMA200[{'+' if trend_ok else '✗'}]: fiyat={price:.2f} ema={ema200_val:.2f} dist={dist:+.2f}%")
                if rsi:
                    lines.append(f"RSI: {rsi:.1f}")
                if atr:
                    lines.append(f"ATR: {atr:.4f}")

            # ── Filtre ayarları ────────────────────────────────────────────────
            async with async_session() as session:
                from sqlalchemy import select as _select
                res = await session.execute(_select(BotFilter).where(BotFilter.bot_id == self.config["id"]))
                f = res.scalar_one_or_none()

            if not f:
                lines.append("Filtre ayarları: yapılandırılmamış")
            else:
                # 1. Haber Koruması
                news_would_block = False
                try:
                    from services.economic_calendar import is_news_blackout
                    blackout = await is_news_blackout(minutes_buffer=f.news_blackout_minutes or 30)
                    news_would_block = blackout.get("blackout", False)
                except Exception:
                    pass
                if f.news_protection_enabled:
                    if news_would_block:
                        r = f"Haber Blackout: {blackout.get('reason','')}"
                        lines.append(f"📰 Haber[✗ ENGEL]: {blackout.get('reason','')}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append("📰 Haber[✓ geçti]")
                else:
                    sim = "kalırdı" if news_would_block else "geçerdi"
                    lines.append(f"📰 Haber[— kapalı, {sim}]")

                # 2. Akıllı Saat Filtresi
                import datetime as _dt
                cur_h = _dt.datetime.utcnow().hour
                hours_would_block = False
                try:
                    if f.blocked_hours:
                        blocked = json.loads(f.blocked_hours)
                        hours_would_block = cur_h in blocked
                except Exception:
                    pass
                if f.smart_hours_enabled and f.blocked_hours:
                    if hours_would_block:
                        r = f"Akıllı Saat Filtresi: {cur_h}:00 UTC yasaklı"
                        lines.append(f"🕐 Saat[✗ ENGEL]: {cur_h}:00 UTC yasaklı")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"🕐 Saat[✓ geçti — {cur_h}:00 UTC]")
                else:
                    sim = "kalırdı" if hours_would_block else "geçerdi"
                    lines.append(f"🕐 Saat[— kapalı, {sim}]")

                # 3. Öz-Öğrenme
                sl_would_block = False
                sl_info = ""
                try:
                    async with async_session() as session2:
                        from models.trade import Trade, TradeStatus
                        from sqlalchemy import select as _sel2
                        tr = await session2.execute(
                            _sel2(Trade).where(
                                Trade.bot_id == self.config["id"],
                                Trade.status == TradeStatus.CLOSED
                            ).order_by(Trade.id.desc()).limit(20)
                        )
                        recent = tr.scalars().all()
                    if len(recent) >= 10:
                        wins = sum(1 for t in recent if (t.pnl or 0) > 0)
                        wr = wins / len(recent)
                        thr = f.min_win_rate_threshold or 0.4
                        sl_would_block = wr < thr
                        sl_info = f"win=%{wr*100:.1f}"
                    else:
                        sl_info = f"yeterli geçmiş yok ({len(recent)}/10)"
                except Exception:
                    pass
                if f.self_learning_enabled:
                    if sl_would_block:
                        r = f"Öz-Öğrenme: Win Rate %{wr*100:.1f} < Limit %{thr*100:.1f}"
                        lines.append(f"🧠 Öz-Öğrenme[✗ ENGEL]: {r}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"🧠 Öz-Öğrenme[✓ geçti — {sl_info}]")
                else:
                    sim = "kalırdı" if sl_would_block else "geçerdi"
                    lines.append(f"🧠 Öz-Öğrenme[— kapalı, {sim}]")

                # 4. Volatilite Filtresi
                atr_v = result["indicators"]["volatility_atr"]
                vol_would_block = False
                if atr_v and f.max_volatility_atr and atr_v > f.max_volatility_atr:
                    vol_would_block = True
                if f.volatility_filter_enabled and f.max_volatility_atr:
                    if vol_would_block:
                        r = f"Yüksek Volatilite: ATR {atr_v:.4f} > Limit {f.max_volatility_atr:.4f}"
                        lines.append(f"⚡ Volatilite[✗ ENGEL]: {r}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"⚡ Volatilite[✓ geçti — ATR={atr_v or '?'}]")
                else:
                    sim = "kalırdı" if vol_would_block else "geçerdi"
                    lines.append(f"⚡ Volatilite[— kapalı, {sim}]")

                # 5. Trend Filtresi (EMA200)
                trend_would_block = False
                dist_v = result["indicators"]["ema200_dist"] or 0
                if ema200_val and ema200_val > 0:
                    trend_would_block = (signal_type == "buy" and price < ema200_val) or \
                                        (signal_type == "sell" and price > ema200_val)
                if f.trend_filter_enabled and ema200_val and ema200_val > 0:
                    if trend_would_block:
                        r = f"Trend Filtresi: dist={dist_v:+.2f}% trend uyumsuz"
                        lines.append(f"📈 Trend[✗ ENGEL]: {r}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"📈 Trend[✓ geçti — dist={dist_v:+.2f}%]")
                else:
                    sim = "kalırdı" if trend_would_block else "geçerdi"
                    lines.append(f"📈 Trend[— kapalı, {sim}]")

                # ── 6. AI AKILLI ANALİZ (tüm filtreler sonrası) ──────────────
                # AI analiz her zaman çalışır — hem aktif filtre kararlarını destekler
                # hem de kapalı filtreler için "geçerdi/kalırdı" simülasyonu yapar
                try:
                    from ai.smart_filter import (
                        ai_news_analysis, ai_self_learning_analysis,
                        ai_trend_volatility_analysis,
                    )

                    ai_tasks = []

                    # 6a. Haber AI analizi (Perplexity — internet araştırması)
                    try:
                        from services.economic_calendar import get_upcoming_events
                        upcoming = await get_upcoming_events(hours=24)
                    except Exception:
                        upcoming = []
                    ai_tasks.append(("news", ai_news_analysis(
                        self.config["symbol"], signal_type, upcoming)))

                    # 6b. Öz-Öğrenme AI analizi (geçmiş sinyal pattern'ları)
                    past_signals = []
                    try:
                        from models.trade import SignalLog as _SL
                        async with async_session() as _sess:
                            _q = await _sess.execute(
                                _select(_SL).where(
                                    _SL.bot_id == self.config["id"],
                                    _SL.action.in_(["executed", "analyzed"]),
                                ).order_by(_SL.created_at.desc()).limit(100)
                            )
                            _rows = _q.scalars().all()
                            past_signals = [{
                                "action": r.action, "signal_type": r.signal_type,
                                "price": r.price, "tp_price": r.tp_price, "sl_price": r.sl_price,
                                "outcome": r.outcome, "rsi_14": r.rsi_14,
                                "volatility_atr": r.volatility_atr, "ema200_dist": r.ema200_dist,
                                "created_at": r.created_at.isoformat() if r.created_at else "",
                                "max_price_in_range": r.max_price_in_range,
                                "min_price_in_range": r.min_price_in_range,
                            } for r in _rows]
                    except Exception:
                        pass

                    import datetime as _dt
                    cur_h = _dt.datetime.utcnow().hour
                    ai_tasks.append(("learning", ai_self_learning_analysis(
                        self.config["symbol"], signal_type, price,
                        result["indicators"]["rsi_14"],
                        result["indicators"]["volatility_atr"],
                        result["indicators"]["ema200_dist"],
                        past_signals, cur_h)))

                    # 6c. Trend + Volatilite AI analizi
                    ohlcv_data = None
                    try:
                        ohlcv_data = await self.data_fetcher.get_ohlcv(self.config["symbol"], timeframe, 20)
                    except Exception:
                        pass
                    ai_tasks.append(("trend", ai_trend_volatility_analysis(
                        self.config["symbol"], signal_type, price,
                        result["indicators"]["rsi_14"],
                        result["indicators"]["volatility_atr"],
                        ema200_val,
                        result["indicators"]["ema200_dist"],
                        ohlcv_data)))

                    # Tüm AI analizlerini paralel çalıştır
                    import asyncio as _aio
                    ai_results = {}
                    raw = await _aio.gather(*[t[1] for t in ai_tasks], return_exceptions=True)
                    for i, (name, _) in enumerate(ai_tasks):
                        if isinstance(raw[i], Exception):
                            ai_results[name] = {"error": str(raw[i])[:100]}
                        else:
                            ai_results[name] = raw[i]

                    # AI sonuçlarını loglara ekle
                    news_ai = ai_results.get("news", {})
                    if news_ai.get("reason"):
                        risk = news_ai.get("risk_level", "?")
                        icon = "🔴" if risk == "critical" else "🟡" if risk == "high" else "🟢"
                        block_txt = "ENGEL" if news_ai.get("should_block") else "geçti"
                        lines.append(f"🤖 AI Haber[{icon} {block_txt}]: {_smart_truncate(news_ai['reason'], 350)}")
                        if news_ai.get("news_summary"):
                            lines.append(f"   📡 {_smart_truncate(news_ai['news_summary'], 250)}")

                    learn_ai = ai_results.get("learning", {})
                    if learn_ai.get("reason"):
                        block_txt = "ENGEL" if learn_ai.get("should_block") else "geçti"
                        lines.append(f"🤖 AI Öz-Öğrenme[{block_txt}]: {_smart_truncate(learn_ai['reason'], 400)}")
                        if learn_ai.get("suggestion"):
                            lines.append(f"   💡 {_smart_truncate(learn_ai['suggestion'], 250)}")

                    trend_ai = ai_results.get("trend", {})
                    if trend_ai.get("reason"):
                        block_txt = "ENGEL" if trend_ai.get("should_block") else "geçti"
                        td = trend_ai.get("trend_direction", "?")
                        ts = trend_ai.get("trend_strength", "?")
                        vl = trend_ai.get("volatility_level", "?")
                        lines.append(f"🤖 AI Trend[{block_txt}]: {td}/{ts} vol={vl} — {_smart_truncate(trend_ai['reason'], 350)}")

                    # AI bloklama: aktif filtreler AI'ın kararını kullanır
                    # Haber filtresi aktifse AI'ın haber kararını uygula
                    if f.news_protection_enabled and news_ai.get("should_block") and not result["should_block"]:
                        result["should_block"] = True
                        result["reject_reason"] = f"AI Haber Analizi: {_smart_truncate(news_ai.get('reason', 'risk yüksek'), 300)}"

                    # Öz-öğrenme filtresi aktifse AI'ın pattern kararını uygula
                    if f.self_learning_enabled and learn_ai.get("should_block") and not result["should_block"]:
                        result["should_block"] = True
                        result["reject_reason"] = f"AI Öz-Öğrenme: {_smart_truncate(learn_ai.get('reason', 'pattern uyumsuz'), 300)}"

                    # Trend filtresi aktifse AI'ın trend kararını uygula
                    if f.trend_filter_enabled and trend_ai.get("should_block") and not result["should_block"]:
                        result["should_block"] = True
                        result["reject_reason"] = f"AI Trend: {_smart_truncate(trend_ai.get('reason', 'trend uyumsuz'), 300)}"

                except Exception as ai_err:
                    lines.append(f"🤖 AI Analiz hatası: {str(ai_err)[:100]}")
                    print(f"[Bot] AI filtre hatası: {ai_err}")

        except Exception as e:
            lines.append(f"Analiz hatası: {str(e)[:100]}")
            print(f"[Bot] Filtre analiz hatası: {e}")

        result["analysis"] = " | ".join(lines)
        return result

    async def _log_signal(
        self,
        signal_type: str,
        price: float,
        source: str = "",
        reason: str = "",
        action: str = "received",
        reject_reason: str = "",
        confidence: float = None,
        tp_price: float = None,
        sl_price: float = None,
        raw_payload: str = None,
        rsi_14: float = None,
        volatility_atr: float = None,
        ema200_dist: float = None,
        timeframe: str = None,
        symbol_override: str = None,
    ):
        """Gelen sinyali DB'ye kaydet — işleme girsin girmesin"""
        try:
            async with async_session() as session:
                log = SignalLog(
                    bot_id=self.config["id"],
                    symbol=symbol_override or self.config["symbol"],
                    signal_type=signal_type,
                    source=source or self.config.get("strategy", "unknown"),
                    price=price,
                    reason=reason,
                    action=action,
                    reject_reason=reject_reason,
                    confidence=confidence,
                    tp_price=tp_price,
                    sl_price=sl_price,
                    raw_payload=raw_payload,
                    rsi_14=rsi_14,
                    volatility_atr=volatility_atr,
                    ema200_dist=ema200_dist,
                    timeframe=timeframe,
                )
                session.add(log)
                await session.commit()
                await session.refresh(log)
                return log.id
        except Exception as e:
            print(f"[Bot] Sinyal log hatası: {e}")
            return None

    async def _get_funding(self, symbol: str) -> float:
        try:
            return await self.exchange.get_funding_rate(symbol)
        except:
            return 0.0

    async def _cancel_existing_stop_orders(self, symbol: str, pos_side: str = None):
        """
        MEXC'deki mevcut stop emirlerini (TP/SL) iptal et.
        Yeni TP/SL koymadan önce çağrılır — emir birikimini önler.
        pos_side: 'long' veya 'short' — None ise tüm stop emirleri iptal edilir.
        """
        exchange_name = getattr(self.exchange, '_exchange_name', '')
        if exchange_name != "mexc":
            return  # Şimdilik sadece MEXC için

        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        bot_name = self.config.get("name", "?")

        try:
            # 1. Stop order'ları sorgula (aktif + bekleyen)
            resp = await self.exchange.exchange.contractPrivateGetStoporderListOrders({
                "symbol": mexc_symbol,
                "is_finished": 0,  # 0 = aktif emirler
                "page_num": 1,
                "page_size": 50,
            })
            orders = []
            if isinstance(resp, dict):
                orders = resp.get("data", []) or []

            if not orders:
                return

            # 2. pos_side filtrele (1=long, 2=short)
            target_type = None
            if pos_side == "long":
                target_type = 1
            elif pos_side == "short":
                target_type = 2

            to_cancel = []
            for o in orders:
                if target_type and int(o.get("positionType", 0)) != target_type:
                    continue
                order_id = o.get("stopOrderId") or o.get("orderId") or o.get("id")
                if order_id:
                    to_cancel.append(order_id)

            if not to_cancel:
                return

            # 3. Stoporder/change_price ile iptal (TP/SL'i 0'a set et = iptal)
            # Alternatif: Her pozisyon için stoporder/place yeni değerle override eder
            # Ama en temizi: orderId ile change_price'a 0 göndermek
            for oid in to_cancel:
                try:
                    await self.exchange.exchange.contractPrivatePostStoporderChangePrice({
                        "orderId": int(oid),
                        "stopLossPrice": 0,
                        "takeProfitPrice": 0,
                    })
                except Exception as e:
                    # change_price çalışmazsa logla ama devam et
                    print(f"[{bot_name}] Stop order iptal hatası (orderId={oid}): {e}")

            print(f"[{bot_name}] {len(to_cancel)} eski stop emri iptal edildi ({pos_side or 'all'}) — {symbol}")

        except Exception as e:
            print(f"[{bot_name}] Stop order sorgu/iptal hatası: {e}")

    async def _cancel_existing_trailing_orders(self, symbol: str, pos_side: str = None):
        """MEXC'deki mevcut trailing stop emirlerini iptal et.
        pos_side: 'long' veya 'short' — None ise tüm trailing emirler iptal edilir.
        """
        exchange_name = getattr(self.exchange, '_exchange_name', '')
        if exchange_name != "mexc":
            return

        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        bot_name = self.config.get("name", "?")

        # pos_side filtresi: 1=long, 2=short
        target_type = None
        if pos_side == "long":
            target_type = 1
        elif pos_side == "short":
            target_type = 2

        try:
            resp = await self.exchange.exchange.contractPrivateGetTrackorderListOrders({
                "symbol": mexc_symbol,
                "states": "0,1",  # 0=bekleyen, 1=aktif
            })
            orders = (resp.get("data", []) if isinstance(resp, dict) else []) or []

            cancelled = 0
            for o in orders:
                # pos_side filtresi — hedge modda sadece kendi yönünü iptal et
                if target_type and int(o.get("positionType", 0)) != target_type:
                    continue
                track_id = o.get("trackOrderId") or o.get("id")
                if track_id:
                    try:
                        await self.exchange.exchange.contractPrivatePostTrackorderCancel({
                            "symbol": mexc_symbol,
                            "trackOrderId": int(track_id),
                        })
                        cancelled += 1
                    except Exception as e:
                        print(f"[{bot_name}] Trailing iptal hatası (id={track_id}): {e}")

            if cancelled:
                print(f"[{bot_name}] {cancelled} eski trailing emri iptal edildi ({pos_side or 'all'}) — {symbol}")

        except Exception as e:
            print(f"[{bot_name}] Trailing sorgu/iptal hatası: {e}")

    def _calc_atr(self, ohlcv: list, period: int = 14) -> float:
        if len(ohlcv) < period + 1:
            return 0.01
        highs  = [c[2] for c in ohlcv[-period:]]
        lows   = [c[3] for c in ohlcv[-period:]]
        closes = [c[4] for c in ohlcv[-period:]]
        trs = [max(h - l, abs(h - c), abs(l - c))
               for h, l, c in zip(highs, lows, closes)]
        return sum(trs) / len(trs)

    async def _alert(self, message: str):
        from core.config import settings
        if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
            import httpx
            url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
            async with httpx.AsyncClient() as client:
                await client.post(url, json={
                    "chat_id": settings.TELEGRAM_CHAT_ID,
                    "text": message,
                })

    async def _run_grid_cycle(self, redis, symbol: str):
        """
        Grid Bot döngüsü:
        - İlk çalışmada grid seviyelerini başlatır
        - Her döngüde anlık fiyatı kontrol eder
        - Uygun grid seviyesinde AL/SAT sinyali üretir
        """
        from bot.strategies.grid import GridStrategy

        # Grid strategy instance'ını bot başına sakla (memory'de)
        if not hasattr(self, "_grid"):
            params = self.config.get("params", self.config.get("strategy_params", {}))
            self._grid = GridStrategy(params)

        # Anlık fiyatı al
        try:
            ticker = await self.exchange.exchange.fetch_ticker(symbol)
            price = float(ticker["last"])
        except Exception as e:
            print(f"[Grid] Fiyat alınamadı: {e}")
            return

        # İlk çalışmada grid'i başlat
        if not self._grid.initialized:
            self._grid.initialize(price)

        # Sinyal kontrolü
        signal = self._grid.generate_signal(price)

        grid_status = self._grid.status()

        if signal == "stop_loss":
            await self._alert(f"⛔ Grid Bot STOP LOSS — {symbol} @ ${price:.2f}")
            self.running = False
            return

        if signal in ("buy", "sell"):
            qty = self._grid.per_grid_usdt / price   # grid başına USDT → coin miktarı
            if qty > 0:
                ai_result = {
                    "approved": True,
                    "confidence": 80,
                    "stop_loss": price * 0.95 if signal == "buy" else price * 1.05,
                    "take_profit": None,
                    "analysis": f"Grid seviyesi — {'AL' if signal == 'buy' else 'SAT'} @ ${price:.2f}",
                }
                await self._execute(signal, price, qty, ai_result["stop_loss"], ai_result)

        # Durum Redis'e yaz
        status_data = {
            "name": self.config["name"],
            "symbol": symbol,
            "signal": signal,
            "price": price,
            "grid": grid_status,
            "risk": self.risk.status(),
            "ts": datetime.utcnow().isoformat(),
        }
        await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

    async def _run_custom_signal_cycle(self, redis, symbol: str):
        """
        Özel Sinyal + TradingView Webhook Stratejisi:
        - custom_signal:{symbol} anahtarını okur (ProChart / özel indikatör)
        - tv_webhook:{token} anahtarını okur (TradingView alarm botu)
        Her ikisi de aynı payload formatını kullanır.
        """
        bot_name = self.config['name']
        bot_id = self.config['id']

        # Trailing stop kontrolü
        if symbol in self._trailing:
            try:
                ticker = await self.exchange.exchange.fetch_ticker(symbol)
                cur_price = float(ticker["last"])
                if await self._check_trailing_stop(symbol, cur_price):
                    pos = await self._get_current_position(symbol)
                    if pos:
                        await self._close_position(symbol, pos)
                        await self._alert(f"📊 Trailing Stop tetiklendi — {symbol} @ ${cur_price:,.2f}")
            except Exception as e:
                print(f"[Bot {bot_name}] Trailing stop kontrolü hatası: {e}")

        params = self.config.get("params", {})

        # ── Sinyal arama: önce sembol bazlı, sonra webhook token bazlı ──
        sig = None
        sig_key = None

        # 1) CCXT sembol bazlı anahtar (ProChart + TV webhook her ikisi de yazar)
        sym_key = f"custom_signal:{symbol.replace('/', '_').replace(':', '_')}"
        raw = await redis.get(sym_key)
        if raw:
            sig = json.loads(raw)
            sig_key = sym_key

        # 2) TradingView webhook token bazlı anahtar (sadece tradingview_webhook stratejisi)
        is_tv_webhook = self.config.get("strategy") == "tradingview_webhook" or params.get("_strategy_display") == "tradingview_webhook"
        if sig is None and is_tv_webhook:
            token = params.get("webhook_token") or params.get("signal_source", "")
            if token and not token.startswith("builtin") and not token.startswith("custom__"):
                tv_key = f"tv_webhook:{token}"
                raw = await redis.get(tv_key)
                if raw:
                    candidate = json.loads(raw)
                    # Token'daki sembol bu bota ait mi kontrol et
                    candidate_sym = candidate.get("symbol", "")
                    if not candidate_sym or candidate_sym == symbol:
                        sig = candidate
                        sig_key = tv_key

        # Sinyal olmasa bile status güncelle (frontend fiyat görsün) - Her 30 saniyede bir
        import time
        now = time.time()
        should_update_status = (now - getattr(self, "_last_status_update", 0)) >= 30

        if not sig:
            if should_update_status:
                self._last_status_update = now
                try:
                    ticker = await asyncio.wait_for(self.exchange.exchange.fetch_ticker(symbol), timeout=15)
                    cur_price = float(ticker["last"])
                except Exception:
                    cur_price = 0
                
                position = None
                try:
                    position = await self._get_position_info(symbol)
                except Exception as e:
                    print(f"[Bot {bot_name}] Pozisyon bilgisi alınamadı: {e}")
                status_data = {
                    "signal": None,
                    "price": cur_price,
                    "risk": {
                        "balance": self.risk.balance,
                        "daily_pnl": self.risk.daily_pnl,
                        "daily_pnl_pct": self.risk.daily_pnl_pct,
                        "killed": self.risk.killed,
                    },
                    "position": position,
                    "ts": datetime.utcnow().isoformat(),
                }
                await redis.set(f"bot:{bot_id}:status", json.dumps(status_data))
            return

        # Sinyal varsa fiyatı al — TV webhook'ta zaten fiyat varsa API çağrısını atla
        sig_price = float(sig.get("price", 0) or 0)
        if sig_price > 0:
            cur_price = sig_price
        else:
            try:
                ticker = await asyncio.wait_for(self.exchange.exchange.fetch_ticker(symbol), timeout=15)
                cur_price = float(ticker["last"])
            except Exception:
                cur_price = 0

        # Duplicate sinyal kontroli — iki katmanlı koruma
        # 1) Aynı ts'li sinyal tekrar işlenmez (orijinal kontrol)
        last_ts_key = f"bot:{bot_id}:last_custom_signal_ts"
        last_ts = await redis.get(last_ts_key)
        sig_ts = sig.get("ts", "")
        if last_ts:
            last_ts_str = last_ts.decode() if isinstance(last_ts, bytes) else str(last_ts)
            if last_ts_str == sig_ts:
                return  # Bu sinyal daha önce işlendi

        # 2) Aynı yönde cooldown: TradingView çift webhook gönderirse engelle
        #    (Her webhook farklı ts üretir, bu yüzden ts kontrolü yetmez)
        sig_direction = sig.get("type", "")  # buy / sell / close
        cooldown_key = f"bot:{bot_id}:signal_cooldown:{sig_direction}"
        cooldown_active = await redis.get(cooldown_key)
        if cooldown_active:
            print(f"[Bot {bot_name}] ⚠ Cooldown aktif — aynı yönde ({sig_direction}) sinyal {30}sn içinde zaten işlendi, atlanıyor")
            await redis.set(last_ts_key, sig_ts, ex=600)
            return
        # Cooldown'ı şimdi set et — sinyal işlensin veya işlenmesin 30sn boyunca aynı yönde tekrar engelle
        await redis.set(cooldown_key, "1", ex=30)

        signal_type = sig.get("type")   # "buy" | "sell"
        price       = sig.get("price", 0)
        source      = sig.get("source", "Özel İndikatör")
        reason      = sig.get("reason", "")
        # Sinyal zaman dilimi: önce payload'dan, sonra bot parametresinden
        sig_timeframe = sig.get("timeframe") or params.get("signal_timeframe") or "5m"

        print(f"[Bot {bot_name}] ▶ SİNYAL BULUNDU: type={signal_type} price={price} source={source} key={sig_key}")

        if signal_type not in ("buy", "sell", "close"):
            print(f"[Bot {bot_name}] ✗ Geçersiz sinyal tipi: '{signal_type}' — atlanıyor")
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        # Fiyat 0 ise cur_price'ı kullan
        if not price or price <= 0:
            print(f"[Bot {bot_name}] ⚠ Sinyal fiyatı 0 — cur_price kullanılıyor: {cur_price}")
            price = cur_price
        if not price or price <= 0:
            print(f"[Bot {bot_name}] ✗ Fiyat alınamadı (price=0, cur_price=0) — sinyal atlanıyor")
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        # Bot parametrelerini al
        params = self.config.get("params", {})
        signal_mode = params.get("signal_mode", "normal")
        position_action = params.get("position_action", "close_and_open")
        take_profit_pct = float(params.get("take_profit_pct") or params.get("tp_pct", 0) or 0)
        stop_loss_pct = float(params.get("stop_loss_pct") or params.get("sl_pct", 0) or 0)
        trailing_stop_pct = float(params.get("trailing_stop_pct") or params.get("trailing_sl_pct", 0) or 0)

        print(f"[Bot {bot_name}] Params: mode={signal_mode} tp={take_profit_pct}% sl={stop_loss_pct}% action={position_action}")

        # Sinyal tipi 'close' ise hemen işlem yap ve çık
        if signal_type == "close":
            print(f"[Bot {bot_name}] ✓ 'close' sinyali kabul edildi @ {price}")
            current_position = await self._get_current_position(symbol)
            if current_position:
                await self._analyze_and_close_previous(redis, symbol, signal_type, price, current_position)
                await self._log_signal(signal_type, price, source=source, reason="TradingView üzerinden pozisyon kapatma sinyali", action="executed", timeframe=sig_timeframe)
            else:
                print(f"[Bot {bot_name}] ⚠ 'close' sinyali geldi fakat açık pozisyon yok.")
                await self._log_signal(signal_type, price, source=source, reason="TradingView kapatma sinyali", action="filtered", reject_reason="Açık pozisyon yok", timeframe=sig_timeframe)
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        # Sinyal moduna göre yönü belirle
        if signal_mode == "inverse":
            signal_type = "sell" if signal_type == "buy" else "buy"
            print(f"[Bot {bot_name}] Inverse mod — sinyal tersine çevrildi: {signal_type}")
        elif signal_mode == "buy_only" and signal_type == "sell":
            reject_r = "signal_mode=buy_only → sell sinyali filtrelendi"
            print(f"[Bot {bot_name}] ✗ {reject_r}")
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason=reject_r, timeframe=sig_timeframe)
            try:
                await redis.set(f"bot:{bot_id}:status", json.dumps({
                    "signal": signal_type, "price": cur_price or price,
                    "last_reject": {"reason": reject_r, "ts": datetime.utcnow().isoformat()},
                    "risk": {"balance": self.risk.balance, "daily_pnl": self.risk.daily_pnl, "daily_pnl_pct": self.risk.daily_pnl_pct, "killed": self.risk.killed},
                    "ts": datetime.utcnow().isoformat(),
                }))
            except Exception:
                pass
            await redis.set(last_ts_key, sig_ts, ex=600)
            return
        elif signal_mode == "sell_only" and signal_type == "buy":
            reject_r = "signal_mode=sell_only → buy sinyali filtrelendi"
            print(f"[Bot {bot_name}] ✗ {reject_r}")
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason=reject_r, timeframe=sig_timeframe)
            try:
                await redis.set(f"bot:{bot_id}:status", json.dumps({
                    "signal": signal_type, "price": cur_price or price,
                    "last_reject": {"reason": reject_r, "ts": datetime.utcnow().isoformat()},
                    "risk": {"balance": self.risk.balance, "daily_pnl": self.risk.daily_pnl, "daily_pnl_pct": self.risk.daily_pnl_pct, "killed": self.risk.killed},
                    "ts": datetime.utcnow().isoformat(),
                }))
            except Exception:
                pass
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        print(f"[Bot {bot_name}] ✓ Sinyal kabul edildi: {signal_type} @ {price}")

        # Aktif engelleme filtresi var mı kontrol et (hızlı — sadece DB oku)
        has_active_blocking_filter = False
        try:
            async with async_session() as _fsess:
                from sqlalchemy import select as _fsel
                _fres = await _fsess.execute(_fsel(BotFilter).where(BotFilter.bot_id == self.config["id"]))
                _filt = _fres.scalar_one_or_none()
                if _filt and any([
                    _filt.news_protection_enabled,
                    _filt.smart_hours_enabled and _filt.blocked_hours,
                    _filt.self_learning_enabled,
                    _filt.volatility_filter_enabled and _filt.max_volatility_atr,
                    _filt.trend_filter_enabled,
                ]):
                    has_active_blocking_filter = True
        except Exception:
            pass

        # Aktif engelleme filtresi varsa ÖNCE filtrele, yoksa HIZLI emri gönder
        if has_active_blocking_filter:
            fa = await self._analyze_filters_full(signal_type, price, timeframe=sig_timeframe)
            if fa["should_block"]:
                ind = fa["indicators"]
                analysis_text = fa["analysis"]
                print(f"[Bot {bot_name}] ✗ Aktif filtre engeli: {fa['reject_reason']}")
                await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                    action="filtered", reject_reason=fa["reject_reason"],
                    rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                    timeframe=sig_timeframe)
                try:
                    await redis.set(f"bot:{bot_id}:status", json.dumps({
                        "signal": signal_type, "price": cur_price or price,
                        "last_reject": {"reason": fa["reject_reason"], "analysis": analysis_text, "ts": datetime.utcnow().isoformat()},
                        "risk": {"balance": self.risk.balance, "daily_pnl": self.risk.daily_pnl, "daily_pnl_pct": self.risk.daily_pnl_pct, "killed": self.risk.killed},
                        "ts": datetime.utcnow().isoformat(),
                    }))
                except Exception:
                    pass
                await redis.set(last_ts_key, sig_ts, ex=600)
                return

        # ── HIZLI YOL: Emri hemen gönder, AI analizini sonra yap ──────────
        # Mevcut pozisyon kontrolü
        current_position = await self._get_current_position(symbol)
        print(f"[Bot {bot_name}] Mevcut pozisyon: {current_position}")

        # Pozisyon yönetimi — yeni sinyal her zaman önceki pozisyonu kapatır
        if current_position:
            await self._analyze_and_close_previous(redis, symbol, signal_type, price, current_position)
            if position_action == "close_only":
                await redis.set(last_ts_key, sig_ts, ex=600)
                return

        # TP/SL hesapla (max %99 güvenlik — negatif fiyat önleme)
        take_profit = None
        stop_loss = None
        safe_tp_pct = min(take_profit_pct, 99) if take_profit_pct > 0 else 0
        safe_sl_pct = min(stop_loss_pct, 99) if stop_loss_pct > 0 else 0

        if safe_tp_pct > 0:
            tp_multiplier = 1 + (safe_tp_pct / 100) if signal_type == "buy" else 1 - (safe_tp_pct / 100)
            take_profit = price * tp_multiplier

        if safe_sl_pct > 0:
            sl_multiplier = 1 - (safe_sl_pct / 100) if signal_type == "buy" else 1 + (safe_sl_pct / 100)
            stop_loss = price * sl_multiplier
        else:
            atr_approx = price * 0.01
            stop_loss = self.risk.atr_stop_loss(price, atr_approx, signal_type)

        qty = self.risk.position_size(price, stop_loss)
        
        # Dinamik değerleri al
        dynamic_qty = sig.get("entry_size") or sig.get("amount")
        dynamic_leverage = sig.get("leverage")
        ai_modifier = sig.get("ai_modifier", 1.0)
        
        if dynamic_qty is not None:
            try:
                qty = float(dynamic_qty)
            except ValueError:
                pass

        print(f"[Bot {bot_name}] Hesaplama: TP={take_profit} SL={stop_loss} qty={qty} (balance={self.risk.balance}, risk_per_trade={self.risk.risk_per_trade})")

        # Emri HEMEN gönder (AI beklenmez)
        order_ok = False
        if qty > 0:
            ai_result = {
                "approved": True,
                "confidence": 75,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "analysis": f"{source} — {reason}",
                "dynamic_leverage": dynamic_leverage,
                "ai_modifier": ai_modifier,
                "explicit_amount": dynamic_qty
            }
            try:
                await self._execute(signal_type, price, qty, stop_loss, ai_result)
                order_ok = True
                print(f"[Bot {bot_name}] ✓ İşlem başarıyla açıldı!")
            except Exception as e:
                print(f"[Bot {bot_name}] ✗ İşlem açma hatası: {e}")
                import traceback
                traceback.print_exc()

        # ── AI analizi arka planda (emir zaten gönderildi) ────────────────
        fa = await self._analyze_filters_full(signal_type, price, timeframe=sig_timeframe)
        ind = fa["indicators"]
        analysis_text = fa["analysis"]
        print(f"[Bot {bot_name}] Filtre analizi (post-trade): {analysis_text}")

        if order_ok:
            log_id = await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                action="executed", confidence=75, tp_price=take_profit, sl_price=stop_loss,
                rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                timeframe=sig_timeframe)
            import time as _time
            open_sig_data = {
                "signal_log_id": log_id,
                "side": signal_type,
                "entry_price": price,
                "tp_price": take_profit,
                "sl_price": stop_loss,
                "entry_ts": datetime.utcnow().isoformat(),
                "entry_ts_ms": int(_time.time() * 1000),
            }
            await redis.set(f"bot:{bot_id}:open_signal", json.dumps(open_sig_data), ex=86400)
        elif qty > 0:
            await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                action="error", reject_reason=f"İşlem hatası",
                rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                timeframe=sig_timeframe)
        else:
            print(f"[Bot {bot_name}] ✗ qty=0 — risk manager pozisyon boyutunu 0 hesapladı")
            await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                action="rejected", reject_reason="Pozisyon boyutu 0 (risk manager)",
                rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                timeframe=sig_timeframe)

        # Status'u Redis'e yaz (frontend görebilsin)
        try:
            position = await self._get_position_info(symbol)
        except Exception:
            position = None
        status_data = {
            "signal": signal_type,
            "price": cur_price or price,
            "risk": {
                "balance": self.risk.balance,
                "daily_pnl": self.risk.daily_pnl,
                "daily_pnl_pct": self.risk.daily_pnl_pct,
                "killed": self.risk.killed,
            },
            "position": position,
            "ts": datetime.utcnow().isoformat(),
        }
        await redis.set(f"bot:{bot_id}:status", json.dumps(status_data))

        # Sinyal işlendi — tekrar işlenmesini engelle
        await redis.set(last_ts_key, sig_ts, ex=600)

    async def _get_current_position(self, symbol: str):
        """Mevcut pozisyonu döndür — _get_hedge_positions kullanır (MEXC uyumlu)."""
        try:
            positions = await self._get_hedge_positions(symbol)
            if positions:
                p = positions[0]
                return {
                    "side": p["side"],
                    "size": p["size"],
                    "entry": p["entry_price"],
                }
        except Exception as e:
            print(f"[Bot {self.config['name']}] fetch_positions hatası: {e}")
        return None

    async def _analyze_and_close_previous(self, redis, symbol: str, new_signal_type: str, new_signal_price: float, current_position: dict):
        """
        Yeni sinyal geldiğinde:
        1. Önceki sinyalin OHLCV aralığını analiz et (max_high, min_low, TP/SL vuruldu mu?)
        2. Pozisyonu kapat
        3. SignalLog'u güncelle
        """
        bot_name = self.config["name"]
        bot_id = self.config["id"]

        # Önceki açık sinyal bilgisi Redis'ten al
        open_sig_raw = await redis.get(f"bot:{bot_id}:open_signal")
        prev_sig = json.loads(open_sig_raw) if open_sig_raw else None

        # Pozisyonu kapat
        await self._close_position(symbol, current_position)
        await redis.delete(f"bot:{bot_id}:open_signal")

        if not prev_sig:
            print(f"[Bot {bot_name}] Önceki sinyal bilgisi yok — sadece pozisyon kapatıldı")
            return

        entry_price = float(prev_sig.get("entry_price", 0))
        tp_price = prev_sig.get("tp_price")
        sl_price = prev_sig.get("sl_price")
        side = prev_sig.get("side", "buy")  # "buy"=long, "sell"=short
        is_long = side == "buy"
        signal_log_id = prev_sig.get("signal_log_id")
        entry_ts_ms = int(prev_sig.get("entry_ts_ms", 0))

        # OHLCV 1m mumları çek (entry'den şimdiye kadar)
        max_high = new_signal_price
        min_low = new_signal_price
        try:
            now_ms = int(__import__("time").time() * 1000)
            candles = await asyncio.wait_for(
                self.exchange.exchange.fetch_ohlcv(symbol, "1m", since=entry_ts_ms, limit=1000),
                timeout=15
            )
            if candles:
                highs = [c[2] for c in candles]
                lows = [c[3] for c in candles]
                max_high = max(highs) if highs else new_signal_price
                min_low = min(lows) if lows else new_signal_price
        except Exception as e:
            print(f"[Bot {bot_name}] OHLCV aralık analizi hatası: {e}")

        # TP/SL analizi
        tp_was_reachable = False
        sl_was_hit = False
        if is_long:
            if tp_price and max_high >= tp_price:
                tp_was_reachable = True
            if sl_price and min_low <= sl_price:
                sl_was_hit = True
        else:  # short
            if tp_price and min_low <= tp_price:
                tp_was_reachable = True
            if sl_price and max_high >= sl_price:
                sl_was_hit = True

        # Kapanış fiyatı ve pnl
        exit_price = new_signal_price
        if entry_price > 0:
            if is_long:
                pnl_pct = (exit_price - entry_price) / entry_price * 100
                max_favorable_pct = (max_high - entry_price) / entry_price * 100
                max_adverse_pct = (min_low - entry_price) / entry_price * 100
            else:
                pnl_pct = (entry_price - exit_price) / entry_price * 100
                max_favorable_pct = (entry_price - min_low) / entry_price * 100
                max_adverse_pct = (entry_price - max_high) / entry_price * 100
        else:
            pnl_pct = 0
            max_favorable_pct = 0
            max_adverse_pct = 0

        # Outcome belirleme
        if sl_was_hit and not tp_was_reachable:
            outcome = "sl_hit"
        elif tp_was_reachable and not sl_was_hit:
            outcome = "tp_hit"
        elif tp_was_reachable and sl_was_hit:
            outcome = "sl_hit"  # Her ikisi vurulduysa hangisi önce? SL muhtemelen daha kötü
        else:
            outcome = "next_signal"

        print(f"[Bot {bot_name}] Aralık analizi: side={side} entry={entry_price} exit={exit_price} "
              f"max_high={max_high:.2f} min_low={min_low:.2f} "
              f"tp_reachable={tp_was_reachable} sl_hit={sl_was_hit} outcome={outcome} pnl={pnl_pct:.2f}%")

        # SignalLog güncelle
        if signal_log_id:
            try:
                async with async_session() as session:
                    from sqlalchemy import update as _update
                    await session.execute(
                        _update(SignalLog).where(SignalLog.id == signal_log_id).values(
                            outcome=outcome,
                            outcome_price=exit_price,
                            outcome_pnl_pct=round(pnl_pct, 4),
                            outcome_at=datetime.utcnow(),
                            max_price_in_range=round(max_high, 4),
                            min_price_in_range=round(min_low, 4),
                            max_favorable_pct=round(max_favorable_pct, 4),
                            max_adverse_pct=round(max_adverse_pct, 4),
                            tp_was_reachable=tp_was_reachable,
                            sl_was_hit=sl_was_hit,
                        )
                    )
                    await session.commit()
                    print(f"[Bot {bot_name}] SignalLog #{signal_log_id} güncellendi")
            except Exception as e:
                print(f"[Bot {bot_name}] SignalLog güncelleme hatası: {e}")

    async def _close_position(self, symbol: str, position: dict):
        """Mevcut pozisyonu kapat"""
        try:
            if hasattr(self.exchange, 'close_position'):
                await self.exchange.close_position(symbol, position["side"], position["size"])
            else:
                side = "sell" if position["side"] == "long" else "buy"
                await self.exchange.place_order(symbol, side, position["size"], "market")
            self._clear_trailing(symbol)
            print(f"[Bot {self.config['name']}] Pozisyon kapatıldı: {position['side']} @ {position['entry']}")
        except Exception as e:
            print(f"[Bot {self.config['name']}] Pozisyon kapatma hatası: {e}")

    # ─── Trailing Stop Yönetimi ────────────────────────────────────

    def _init_trailing(self, symbol: str, side: str, entry: float, trail_pct: float):
        """Yeni pozisyon açıldığında trailing stop'u başlat."""
        if trail_pct <= 0:
            return
        self._trailing[symbol] = {
            "side": side,
            "entry": entry,
            "peak": entry,       # long: en yüksek, short: en düşük
            "trail_pct": trail_pct,
            "trail_price": entry * (1 - trail_pct / 100) if side == "buy" else entry * (1 + trail_pct / 100),
            "activated": False,  # Kâra geçince aktifleşir
        }

    async def _check_trailing_stop(self, symbol: str, current_price: float) -> bool:
        """
        Trailing stop kontrolü. Fiyat lehine giderse stop'u çeker.
        True dönerse pozisyon kapatılmalı.
        """
        ts = self._trailing.get(symbol)
        if not ts:
            return False

        side = ts["side"]
        trail_pct = ts["trail_pct"]

        if side == "buy":  # Long pozisyon
            # Fiyat yeni zirve yaptı mı?
            if current_price > ts["peak"]:
                ts["peak"] = current_price
                ts["trail_price"] = current_price * (1 - trail_pct / 100)
                ts["activated"] = True

            # Trailing stop tetiklendi mi?
            if ts["activated"] and current_price <= ts["trail_price"]:
                print(f"[TrailingStop] {symbol} LONG kapatılıyor — peak: {ts['peak']:.2f}, trail: {ts['trail_price']:.2f}, current: {current_price:.2f}")
                del self._trailing[symbol]
                return True

        else:  # Short pozisyon
            # Fiyat yeni dip yaptı mı?
            if current_price < ts["peak"]:
                ts["peak"] = current_price
                ts["trail_price"] = current_price * (1 + trail_pct / 100)
                ts["activated"] = True

            # Trailing stop tetiklendi mi?
            if ts["activated"] and current_price >= ts["trail_price"]:
                print(f"[TrailingStop] {symbol} SHORT kapatılıyor — peak: {ts['peak']:.2f}, trail: {ts['trail_price']:.2f}, current: {current_price:.2f}")
                del self._trailing[symbol]
                return True

        return False

    def _clear_trailing(self, symbol: str):
        """Pozisyon kapatıldığında trailing state'i temizle."""
        self._trailing.pop(symbol, None)

    # ─── Hedge Bot Döngüsü ────────────────────────────────────────────────────

    async def _run_hedge_cycle(self, redis, symbol: str):
        """
        Hedge Bot döngüsü — Çift yönlü pozisyon yönetimi.
        State machine: IDLE → OPEN_BOTH → ONE_CLOSED → COOLDOWN → IDLE

        Mantık: Her iki yöne aynı anda pozisyon aç.
        Kazanan TP'ye vurduğunda borsa otomatik kapatır.
        Kaybeden taraf losing_side_mode'a göre yönetilir.
        Net kâr = TP_pct - SL_pct (her döngüde sabit)
        """
        from bot.strategies.hedge_bot import (
            HedgeBotParams, HedgeBotState,
            compute_hedge_levels, check_price_levels, check_losing_side_exit,
            is_within_trading_hours,
        )
        from datetime import datetime as _dt, timedelta as _td

        bot_id   = self.config["id"]
        bot_name = self.config["name"]
        paper    = self.config.get("paper_mode", True)

        # Bakiye güncelleme (60 sn cache) — hata olursa devam et
        try:
            await asyncio.wait_for(self._refresh_balance(), timeout=10)
        except Exception:
            pass

        p = HedgeBotParams(self.config.get("params", {}), bot_config=self.config)

        # Redis state
        state_key = f"bot:{bot_id}:hedge_state"
        raw       = await redis.get(state_key)
        sd        = json.loads(raw) if raw else {}

        state        = sd.get("state",        HedgeBotState.IDLE)
        entry_price  = sd.get("entry_price")
        levels       = sd.get("levels")
        active_sides = set(sd.get("active_sides", []))
        losing_side  = sd.get("losing_side")
        peak_price   = sd.get("peak_price")
        cycle_count  = sd.get("cycle_count", 0)
        cooldown_until = sd.get("cooldown_until")

        # Anlık fiyat
        try:
            ticker = await asyncio.wait_for(
                self.exchange.exchange.fetch_ticker(symbol), timeout=15
            )
            current_price = float(ticker["last"])
        except Exception as e:
            print(f"[HedgeBot {bot_name}] Fiyat alınamadı: {e}")
            return

        # ── COOLDOWN ───────────────────────────────────────────────────────────
        if state == HedgeBotState.COOLDOWN:
            now_iso = _dt.utcnow().isoformat()
            if cooldown_until and now_iso < cooldown_until:
                remaining = ""
                try:
                    cu = _dt.fromisoformat(cooldown_until)
                    diff = (cu - _dt.utcnow()).total_seconds()
                    remaining = f" (kalan: {int(diff)}s)"
                except Exception:
                    pass
                print(f"[HedgeBot {bot_name}] COOLDOWN bekleniyor{remaining}")
                await self._write_hedge_status(redis, symbol, state, current_price, sd)
                return
            # Cooldown bitti → IDLE (ama bu döngüde hemen işlem açmasın, bir sonraki tick'te)
            print(f"[HedgeBot {bot_name}] COOLDOWN bitti → IDLE")
            state = HedgeBotState.IDLE
            sd = {"state": state, "cycle_count": cycle_count}
            await redis.set(state_key, json.dumps(sd))
            await self._write_hedge_status(redis, symbol, state, current_price, sd)
            return  # Bir sonraki döngüde IDLE kontrolü yapılacak (pozisyon kontrolü dahil)

        # ── IDLE ───────────────────────────────────────────────────────────────
        if state == HedgeBotState.IDLE:
            # ⚠ GÜVENLİK: Borsada açık pozisyon varsa ASLA yeni işlem açma
            try:
                existing_positions = await self._get_hedge_positions(symbol)
                if existing_positions:
                    existing_sides = [pos["side"] for pos in existing_positions]
                    print(f"[HedgeBot {bot_name}] ⚠ IDLE ama borsada açık pozisyon var: {existing_sides} — yeni işlem açılmayacak")
                    # State'i düzelt: açık pozisyonlara göre OPEN_BOTH veya ONE_CLOSED yap
                    sides_set = set(existing_sides)
                    if len(sides_set) == 2:
                        sd["state"] = HedgeBotState.OPEN_BOTH
                        sd["active_sides"] = list(sides_set)
                        sd["entry_price"] = sd.get("entry_price") or existing_positions[0].get("entry_price", current_price)
                        if not sd.get("levels"):
                            sd["levels"] = compute_hedge_levels(sd["entry_price"], p)
                    else:
                        remaining = sides_set.pop()
                        sd["state"] = HedgeBotState.ONE_CLOSED
                        sd["active_sides"] = [remaining]
                        sd["losing_side"] = remaining
                        sd["peak_price"] = current_price
                    await redis.set(state_key, json.dumps(sd))
                    await self._write_hedge_status(redis, symbol, sd["state"], current_price, sd)
                    return
            except Exception as e:
                print(f"[HedgeBot {bot_name}] Pozisyon kontrolü hatası: {e}")

            if p.max_cycles > 0 and cycle_count >= p.max_cycles:
                print(f"[HedgeBot {bot_name}] Max döngüye ulaşıldı ({cycle_count}/{p.max_cycles})")
                await self._write_hedge_status(redis, symbol, "max_cycles_reached", current_price, sd)
                return

            # Fonlama koruması
            if p.funding_pause_enabled:
                try:
                    funding = await self.exchange.get_funding_rate(symbol)
                    if abs(funding) >= p.funding_pause_threshold / 100:
                        print(f"[HedgeBot {bot_name}] Yüksek funding ({funding:.4f}%) — bekleniyor")
                        await self._write_hedge_status(redis, symbol, state, current_price, sd)
                        return
                except Exception:
                    pass

            # İşlem saati kontrolü (sadece yeni pozisyon açmayı etkiler)
            if not is_within_trading_hours(p):
                from datetime import datetime, timezone
                now_h = datetime.now(timezone.utc).hour
                print(f"[HedgeBot {bot_name}] İşlem saati dışında (UTC {now_h}:00, izin: {p.trading_start_hour}-{p.trading_end_hour}) — bekleniyor")
                await self._write_hedge_status(redis, symbol, state, current_price, sd)
                return

            # Tetikleyici
            should_open = False
            signal_action = None  # sinyal yönü (buy/sell) — ağırlık için
            if p.trigger_mode == "on_start":
                should_open = True
            elif p.trigger_mode == "on_signal":
                sym_key = f"custom_signal:{symbol.replace('/', '_').replace(':', '_')}"
                raw_sig = await redis.get(sym_key)
                if raw_sig:
                    sig_data = json.loads(raw_sig)
                    last_ts_key = f"bot:{bot_id}:last_hedge_signal_ts"
                    last_ts_raw = await redis.get(last_ts_key)
                    sig_ts = sig_data.get("ts", "")
                    last_ts_str = (last_ts_raw.decode() if isinstance(last_ts_raw, bytes) else str(last_ts_raw)) if last_ts_raw else ""
                    if last_ts_str != sig_ts:
                        should_open = True
                        signal_action = sig_data.get("action", "").lower()  # buy/sell
                        await redis.set(last_ts_key, sig_ts, ex=600)

            if not should_open:
                await self._write_hedge_status(redis, symbol, state, current_price, sd)
                return

            # Her iki yöne pozisyon aç
            print(f"[HedgeBot {bot_name}] Her iki yöne pozisyon açılıyor @ {current_price}")
            try:
                await self.exchange.set_leverage(symbol, p.leverage)
            except Exception as e:
                print(f"[HedgeBot {bot_name}] Leverage hatası (devam): {e}")

            new_levels = compute_hedge_levels(current_price, p)
            print(f"[HedgeBot {bot_name}] TP/SL seviyeleri: "
                  f"Long TP={new_levels['long']['tp']} SL={new_levels['long']['sl']} | "
                  f"Short TP={new_levels['short']['tp']} SL={new_levels['short']['sl']}")

            # ── İşlem miktarı hesapla ──────────────────────────────────────
            # Bakiye: döngü başında _refresh_balance() ile güncellendi (60 sn cache)
            # İşlem açmadan hemen önce taze bakiye çek (force)
            await self._refresh_balance(force=True)
            live_free = self._live_balance.get("free", 0)

            # NOT: Frontend risk_per_trade'i ORAN olarak kaydeder (ör: %5 → 0.05)
            risk_per_trade = float(self.config.get("risk_per_trade", 0))
            initial_balance = float(self.config.get("initial_balance", 0))

            # Baz bakiye: borsadaki gerçek serbest bakiye > config başlangıç > risk manager
            if live_free > 0:
                base_balance = live_free
            elif initial_balance > 0:
                base_balance = initial_balance
            else:
                base_balance = self.risk.current_balance

            if risk_per_trade > 0:
                # risk_per_trade DB'de oran: 0.05 = %5
                total_usdt = base_balance * risk_per_trade
            elif p.position_size_mode == "fixed_usdt" and p.position_size_usdt > 0:
                total_usdt = p.position_size_usdt
            elif p.position_size_mode == "percentage" and p.position_size_pct <= 100:
                total_usdt = base_balance * (p.position_size_pct / 100)
            else:
                total_usdt = base_balance

            # Güvenlik: serbest bakiyenin %50'sinden fazlasını tek işlemde kullanma
            safety_balance = live_free if live_free > 0 else base_balance
            max_allowed = safety_balance * 0.5
            if total_usdt > max_allowed and max_allowed > 0:
                print(f"[HedgeBot {bot_name}] ⚠️ GÜVENLİK: {total_usdt:.2f}$ > bakiyenin %50'si ({max_allowed:.2f}$), sınırlandırıldı!")
                total_usdt = max_allowed

            print(f"[HedgeBot {bot_name}] İşlem miktarı: {total_usdt:.2f}$ (risk={risk_per_trade}, base={base_balance:.2f}, borsa_free={live_free:.2f})")

            # MEXC kontrat hesabı: notional / (price * contractSize)
            contract_size = 0.001  # ETH default
            try:
                market = self.exchange.exchange.market(symbol)
                contract_size = float(market.get("contractSize", 0.001) or 0.001)
            except Exception:
                pass

            notional = total_usdt * p.leverage
            total_contracts = notional / (current_price * contract_size)

            # Pozisyon büyüklük oranını belirle
            effective_ratio = p.long_size_ratio  # varsayılan: 0.5 = eşit

            # Sinyal ağırlığı aktifse ve sinyal yönü varsa, o yönü büyüt
            if p.signal_weight_enabled and signal_action:
                if signal_action in ("buy", "long"):
                    effective_ratio = p.signal_weight_ratio  # örn 0.65 → Long %65
                    print(f"[HedgeBot {bot_name}] Sinyal: BUY → Long ağırlıklı ({p.signal_weight_ratio:.0%})")
                elif signal_action in ("sell", "short"):
                    effective_ratio = 1 - p.signal_weight_ratio  # örn 0.35 → Long %35
                    print(f"[HedgeBot {bot_name}] Sinyal: SELL → Short ağırlıklı ({p.signal_weight_ratio:.0%})")

            if effective_ratio == 0.5:
                half = max(1, round(total_contracts / 2))
                long_qty = half
                short_qty = half
            else:
                long_qty  = max(1, round(total_contracts * effective_ratio))
                short_qty = max(1, round(total_contracts * (1 - effective_ratio)))
            print(f"[HedgeBot {bot_name}] Miktar: {total_usdt}$ × {p.leverage}x = {notional}$ notional → Long:{long_qty} Short:{short_qty} kontrat (contractSize={contract_size})")

            if not paper:
                # Trailing stop parametreleri
                use_trailing = p.trailing_enabled and p.trailing_pct > 0
                trail_cb = p.trailing_pct if use_trailing else None
                long_trail_active = new_levels["long"]["tp"] if use_trailing else None
                short_trail_active = new_levels["short"]["tp"] if use_trailing else None

                if use_trailing:
                    print(f"[HedgeBot {bot_name}] MEXC Native Trailing aktif: callback={p.trailing_pct}% "
                          f"Long active={long_trail_active} Short active={short_trail_active}")

                # Long + Short paralel aç — her place_order kendi TP/SL veya Trailing'ini koyar
                # tp_pct/sl_pct geçerek gerçek giriş fiyatından TP/SL hesaplanmasını sağla
                results = await asyncio.gather(
                    self.exchange.place_order(
                        symbol, "buy", long_qty, "market",
                        tp_price=new_levels["long"]["tp"],
                        sl_price=new_levels["long"]["sl"],
                        pos_side="long",
                        trailing_callback_rate=trail_cb,
                        trailing_active_price=long_trail_active,
                        tp_pct=p.long_tp_pct,
                        sl_pct=p.long_sl_pct,
                    ),
                    self.exchange.place_order(
                        symbol, "sell", short_qty, "market",
                        tp_price=new_levels["short"]["tp"],
                        sl_price=new_levels["short"]["sl"],
                        pos_side="short",
                        trailing_callback_rate=trail_cb,
                        trailing_active_price=short_trail_active,
                        tp_pct=p.short_tp_pct,
                        sl_pct=p.short_sl_pct,
                    ),
                    return_exceptions=True,
                )
                long_ok  = not isinstance(results[0], Exception)
                short_ok = not isinstance(results[1], Exception)

                mode_str = "Trailing" if use_trailing else "TP/SL"
                if long_ok:
                    print(f"[HedgeBot {bot_name}] ✓ Long açıldı + {mode_str}: {long_qty} kontrat")
                else:
                    print(f"[HedgeBot {bot_name}] ✗ Long hatası: {results[0]}")
                if short_ok:
                    print(f"[HedgeBot {bot_name}] ✓ Short açıldı + {mode_str}: {short_qty} kontrat")
                else:
                    print(f"[HedgeBot {bot_name}] ✗ Short hatası: {results[1]}")

                if not long_ok and not short_ok:
                    print(f"[HedgeBot {bot_name}] Her iki yön de açılamadı — döngü iptal")
                    await self._alert(f"❌ Hedge Bot: Long ve Short açılamadı")
                    return
            else:
                print(f"[HedgeBot {bot_name}] PAPER Long: TP={new_levels['long']['tp']} SL={new_levels['long']['sl']}")
                print(f"[HedgeBot {bot_name}] PAPER Short: TP={new_levels['short']['tp']} SL={new_levels['short']['sl']}")

            # Trade kayıtlarını DB'ye yaz
            long_ok_flag = not paper and long_ok if not paper else True
            short_ok_flag = not paper and short_ok if not paper else True
            trade_ids = {}
            if long_ok_flag:
                tid = await self._open_hedge_trade("long", current_price, long_qty, p.leverage)
                if tid:
                    trade_ids["long"] = tid
            if short_ok_flag:
                tid = await self._open_hedge_trade("short", current_price, short_qty, p.leverage)
                if tid:
                    trade_ids["short"] = tid

            trail_msg = f"\n📊 Trailing: {p.trailing_pct}% geri çekilme" if (p.trailing_enabled and p.trailing_pct > 0) else ""
            await self._alert(
                f"🔀 Hedge Bot Açıldı {'[PAPER] ' if paper else ''}\n"
                f"{symbol} @ {current_price:.4f}  Kaldıraç: {p.leverage}x\n"
                f"📗 Long  TP: {new_levels['long']['tp']}  SL: {new_levels['long']['sl']}\n"
                f"📕 Short TP: {new_levels['short']['tp']}  SL: {new_levels['short']['sl']}"
                f"{trail_msg}\n"
                f"Net hedef kâr: +{p.long_tp_pct - p.short_sl_pct:.1f}% / döngü"
            )

            sd = {
                "state":        HedgeBotState.OPEN_BOTH,
                "entry_price":  current_price,
                "levels":       new_levels,
                "active_sides": ["long", "short"],
                "losing_side":  None,
                "peak_price":   current_price,
                "trade_ids":    trade_ids,
                "cycle_count":  cycle_count,
            }
            await redis.set(state_key, json.dumps(sd))
            await self._write_hedge_status(redis, symbol, HedgeBotState.OPEN_BOTH, current_price, sd)
            return

        # ── OPEN_BOTH ──────────────────────────────────────────────────────────
        if state == HedgeBotState.OPEN_BOTH:
            if not levels or not entry_price:
                await redis.delete(state_key)
                return

            # Borsadaki gerçek pozisyon durumunu kontrol et
            real_positions = await self._get_hedge_positions(symbol)
            real_sides = {pos["side"] for pos in real_positions}

            # Borsa bir tarafı kapattıysa (TP/SL tetiklendi), state'i güncelle
            if active_sides and real_sides != active_sides:
                closed_sides = active_sides - real_sides
                remaining = active_sides & real_sides

                if len(real_sides) == 0:
                    # İki taraf da kapanmış — trade'leri kapat
                    for cs in list(active_sides):
                        await self._close_hedge_trade(bot_id, cs, current_price, "exchange_tp_sl")
                    print(f"[HedgeBot {bot_name}] Her iki pozisyon kapanmış — döngü bitti")
                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    await self._alert(f"✅ Hedge Döngü Tamamlandı — {symbol} her iki taraf kapandı")
                    await self._write_hedge_status(redis, symbol, HedgeBotState.COOLDOWN, current_price, sd)
                    return

                if len(closed_sides) == 1:
                    closed = closed_sides.pop()
                    remaining_side = remaining.pop() if remaining else None
                    await self._close_hedge_trade(bot_id, closed, current_price, "exchange_tp_sl")
                    print(f"[HedgeBot {bot_name}] {closed.upper()} borsa tarafından kapatıldı (TP/SL) — {remaining_side.upper() if remaining_side else 'yok'} açık kalıyor")

                    # Diğer taraf AÇIK KALIR — ONE_CLOSED state'inde losing_side_mode'a göre yönetilir
                    active_sides = {remaining_side} if remaining_side else set()
                    sd["active_sides"] = list(active_sides)
                    sd["losing_side"]  = remaining_side
                    sd["peak_price"]   = current_price
                    sd["state"]        = HedgeBotState.ONE_CLOSED
                    await redis.set(state_key, json.dumps(sd))
                    await self._alert(
                        f"✅ Hedge Bot: {closed.upper()} kapandı (borsa TP/SL)\n"
                        f"{symbol} @ {current_price:.4f}\n"
                        f"Kalan: {remaining_side.upper() if remaining_side else 'yok'} → {p.losing_side_mode}"
                    )
                    await self._write_hedge_status(redis, symbol, HedgeBotState.ONE_CLOSED, current_price, sd)
                    return

            # ── PAPER MODE: Fiyat bazlı TP/SL kontrolü (borsa emri yok) ──
            if paper:
                hits = check_price_levels(current_price, levels, active_sides)
                winner = loser = None
                if hits["long"]["tp"]:
                    winner, loser = "long", "short"
                elif hits["short"]["tp"]:
                    winner, loser = "short", "long"
                elif hits["long"]["sl"] and hits["short"]["sl"]:
                    print(f"[HedgeBot {bot_name}] ⚠ PAPER: Her iki SL vuruldu — döngü kapandı")
                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    await self._write_hedge_status(redis, symbol, HedgeBotState.COOLDOWN, current_price, sd)
                    return

                if winner:
                    await self._close_hedge_trade(bot_id, winner, current_price, "tp")
                    if p.losing_side_mode == "close_both":
                        await self._close_hedge_trade(bot_id, loser, current_price, "close_both")
                        sd["state"]          = HedgeBotState.COOLDOWN
                        sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                        sd["cycle_count"]    = cycle_count + 1
                        await redis.set(state_key, json.dumps(sd))
                    else:
                        active_sides.discard(winner)
                        sd["active_sides"] = list(active_sides)
                        sd["losing_side"]  = loser
                        sd["peak_price"]   = current_price
                        sd["state"]        = HedgeBotState.ONE_CLOSED
                        await redis.set(state_key, json.dumps(sd))
                else:
                    sl_side = None
                    if hits["long"]["sl"] and "long" in active_sides:
                        sl_side = "long"
                    elif hits["short"]["sl"] and "short" in active_sides:
                        sl_side = "short"
                    if sl_side:
                        await self._close_hedge_trade(bot_id, sl_side, current_price, "sl")
                        remaining_side = "short" if sl_side == "long" else "long"
                        active_sides.discard(sl_side)
                        sd["active_sides"] = list(active_sides)
                        sd["losing_side"]  = remaining_side
                        sd["peak_price"]   = current_price
                        sd["state"]        = HedgeBotState.ONE_CLOSED
                        await redis.set(state_key, json.dumps(sd))
                    else:
                        await redis.set(state_key, json.dumps(sd))
            else:
                # ── CANLI MODE: Borsaya MÜDAHALE ETME ──
                # Borsa TP/SL emirleri pozisyonu kendi kapatır.
                # Bot sadece pozisyon durumunu izler, loglara yazar.
                # Peak güncelle (trailing stop / ONE_CLOSED state için)
                long_peak  = sd.get("long_peak", entry_price or current_price)
                short_peak = sd.get("short_peak", entry_price or current_price)
                if "long" in active_sides:
                    long_peak = max(long_peak, current_price)
                if "short" in active_sides:
                    short_peak = min(short_peak, current_price)
                sd["long_peak"]  = long_peak
                sd["short_peak"] = short_peak
                sd["peak_price"] = current_price
                await redis.set(state_key, json.dumps(sd))

            await self._write_hedge_status(redis, symbol, sd.get("state", state), current_price, sd)
            return

        # ── ONE_CLOSED ─────────────────────────────────────────────────────────
        if state == HedgeBotState.ONE_CLOSED:
            if not losing_side or not entry_price:
                await redis.delete(state_key)
                return

            # Borsadaki gerçek pozisyon durumunu kontrol et
            real_positions = await self._get_hedge_positions(symbol)
            real_sides = {pos["side"] for pos in real_positions}

            # Kaybeden taraf borsada kapanmışsa (SL tetiklendi) → COOLDOWN
            if losing_side not in real_sides:
                await self._close_hedge_trade(bot_id, losing_side, current_price, "exchange_sl")
                print(f"[HedgeBot {bot_name}] {losing_side.upper()} borsa tarafından kapatıldı (SL/TP)")
                sd["state"]          = HedgeBotState.COOLDOWN
                sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                sd["cycle_count"]    = cycle_count + 1
                await redis.set(state_key, json.dumps(sd))
                await self._alert(f"✅ Hedge Döngü Tamamlandı — {losing_side.upper()} kapandı | Döngü #{cycle_count + 1}")
                await self._write_hedge_status(redis, symbol, HedgeBotState.COOLDOWN, current_price, sd)
                return

            # Peak güncelle
            if peak_price is None:
                peak_price = current_price
            if losing_side == "long":
                peak_price = max(peak_price, current_price)
            else:
                peak_price = min(peak_price, current_price)
            sd["peak_price"] = peak_price

            if p.losing_side_mode == "sl_only":
                # SL zaten borsada — pozisyon kontrolü yukarıda yapıldı, buraya geldiyse hala açık
                sl_hit = False
                if levels:
                    if losing_side == "long"  and current_price <= levels["long"]["sl"]:
                        sl_hit = True
                    if losing_side == "short" and current_price >= levels["short"]["sl"]:
                        sl_hit = True
                if sl_hit:
                    # Borsa SL emri gecikmiş olabilir — pozisyonu manuel kapat
                    if not paper:
                        try:
                            positions = await self._get_hedge_positions(symbol)
                            pos = next((ps for ps in positions if ps["side"] == losing_side), None)
                            if pos:
                                await self.exchange.close_position(symbol, losing_side, pos["size"])
                                print(f"[HedgeBot {bot_name}] {losing_side.upper()} manuel kapatıldı (SL garantisi)")
                        except Exception as e:
                            print(f"[HedgeBot {bot_name}] SL kapatma hatası: {e}")
                    await self._close_hedge_trade(bot_id, losing_side, current_price, "sl")
                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    await self._alert(f"🔴 Hedge Bot {losing_side.upper()} SL — {symbol} döngü bitti")
                else:
                    await redis.set(state_key, json.dumps(sd))
            else:
                exit_reason = check_losing_side_exit(
                    current_price, losing_side, entry_price, p, peak_price
                )
                if exit_reason:
                    print(f"[HedgeBot {bot_name}] {losing_side.upper()} çıkış: {exit_reason} @ {current_price:.4f}")
                    if not paper:
                        try:
                            positions = await self._get_hedge_positions(symbol)
                            pos = next((ps for ps in positions if ps["side"] == losing_side), None)
                            if pos:
                                await self.exchange.close_position(symbol, losing_side, pos["size"])
                        except Exception as e:
                            print(f"[HedgeBot {bot_name}] Kaybeden kapatma hatası: {e}")
                    await self._close_hedge_trade(bot_id, losing_side, current_price, exit_reason)

                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    net_pnl = p.long_tp_pct - p.short_sl_pct if losing_side == "short" else p.short_tp_pct - p.long_sl_pct
                    await self._alert(
                        f"✅ Hedge Döngü Tamamlandı ({exit_reason})\n"
                        f"{symbol} @ {current_price:.4f}\n"
                        f"Tahmini net kâr: +{net_pnl:.1f}%  |  Döngü #{cycle_count + 1}"
                    )
                else:
                    await redis.set(state_key, json.dumps(sd))

            await self._write_hedge_status(redis, symbol, sd.get("state", state), current_price, sd)

    async def _set_hedge_tp_sl(self, symbol: str, levels: dict, long_ok: bool, short_ok: bool, long_qty: int, short_qty: int):
        """Hedge pozisyonlarına MEXC stoporder/place ile TP/SL ekle (paralel)."""
        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        bot_name = self.config.get("name", "?")

        # Önce mevcut stop emirlerini iptal et — birikmesini önle
        if long_ok:
            await self._cancel_existing_stop_orders(symbol, pos_side="long")
        if short_ok:
            await self._cancel_existing_stop_orders(symbol, pos_side="short")

        # Pozisyonları sorgula (3 deneme)
        pos_data = None
        for attempt in range(1, 4):
            try:
                pos_resp = await self.exchange.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol})
                pos_data = pos_resp.get("data", []) if isinstance(pos_resp, dict) else pos_resp
                break
            except Exception as e:
                print(f"[HedgeBot {bot_name}] Position query hatası (attempt {attempt}/3): {e}")
                await asyncio.sleep(1)

        if not pos_data:
            print(f"[HedgeBot {bot_name}] ✗ Pozisyon bulunamadı — TP/SL konulamadı")
            return

        # Her iki taraf için stop body'leri hazırla
        tasks = []
        for side_name, target_type, qty, ok, lvl_key in [
            ("long", 1, long_qty, long_ok, "long"),
            ("short", 2, short_qty, short_ok, "short"),
        ]:
            if not ok:
                continue
            for p in (pos_data or []):
                if int(p.get("positionType", 0)) == target_type and float(p.get("holdVol", 0)) > 0:
                    pos_id = int(p.get("positionId", 0))
                    if not pos_id:
                        continue
                    stop_body = {
                        "positionId": pos_id,
                        "vol": int(qty),
                        "profitTrend": 1,
                        "lossTrend": 1,
                        "stopLossType": 0,
                        "takeProfitType": 0,
                        "stopLossOrderPrice": 0,
                        "takeProfitOrderPrice": 0,
                    }
                    tp = levels[lvl_key]["tp"]
                    sl = levels[lvl_key]["sl"]
                    if tp:
                        stop_body["takeProfitPrice"] = round(float(tp), 2)
                    if sl:
                        stop_body["stopLossPrice"] = round(float(sl), 2)
                    tasks.append((side_name, stop_body, tp, sl))
                    break

        if not tasks:
            print(f"[HedgeBot {bot_name}] ✗ Açık pozisyon bulunamadı — TP/SL konulamadı")
            return

        # Tüm TP/SL emirlerini AYNI ANDA gönder
        results = await asyncio.gather(
            *[self.exchange.exchange.contractPrivatePostStoporderPlace(t[1]) for t in tasks],
            return_exceptions=True,
        )
        for (side_name, _, tp, sl), result in zip(tasks, results):
            if isinstance(result, Exception):
                print(f"[HedgeBot {bot_name}] ✗ {side_name.upper()} TP/SL hatası: {result}")
            else:
                print(f"[HedgeBot {bot_name}] ✓ {side_name.upper()} TP/SL konuldu: TP={tp} SL={sl}")

    async def _write_hedge_status(self, redis, symbol: str, state: str, price: float, sd: dict):
        """Hedge bot anlık durumunu Redis'e yaz (frontend okur)."""
        # Borsadaki gerçek pozisyonları çek (PnL dahil)
        positions = []
        try:
            positions = await self._get_hedge_positions(symbol)
        except Exception:
            pass

        long_pos = next((p for p in positions if p["side"] == "long"), None)
        short_pos = next((p for p in positions if p["side"] == "short"), None)
        net_pnl_usdt = sum(p["pnl_usdt"] for p in positions)
        net_pnl_pct = sum(p["pnl_pct"] for p in positions)

        status_data = {
            "name":         self.config["name"],
            "symbol":       symbol,
            "strategy":     "hedge_bot",
            "hedge_state":  state,
            "price":        price,
            "entry_price":  sd.get("entry_price"),
            "levels":       sd.get("levels"),
            "active_sides": sd.get("active_sides", []),
            "losing_side":  sd.get("losing_side"),
            "cycle_count":  sd.get("cycle_count", 0),
            "risk":         self.risk.status(),
            "ts":           datetime.utcnow().isoformat(),
            # Çift yönlü pozisyon verileri
            "is_hedge":         True,
            "positions":        positions,
            "long_position":    long_pos,
            "short_position":   short_pos,
            "net_pnl_usdt":     round(net_pnl_usdt, 4),
            "net_pnl_pct":      round(net_pnl_pct, 2),
            # Borsa bakiyesi (60 sn cache)
            "exchange_balance":  self._live_balance,
        }
        await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

    async def _open_hedge_trade(self, side: str, entry_price: float, quantity: float, leverage: int) -> int | None:
        """Hedge pozisyonu açıldığında Trade kaydı oluştur. Trade ID döner."""
        try:
            async with async_session() as session:
                trade = Trade(
                    bot_id=self.config["id"],
                    symbol=self.config["symbol"],
                    side=side,
                    entry_price=entry_price,
                    quantity=quantity,
                    status=TradeStatus.OPEN,
                    paper=self.config.get("paper_mode", True),
                    exchange=self.config.get("exchange", "mexc"),
                    leverage_used=leverage,
                )
                session.add(trade)
                await session.commit()
                await session.refresh(trade)
                print(f"[HedgeBot {self.config['name']}] Trade kaydedildi: #{trade.id} {side} {quantity}@{entry_price}")
                return trade.id
        except Exception as e:
            print(f"[HedgeBot {self.config['name']}] Trade kayıt hatası: {e}")
            return None

    async def _close_hedge_trade(self, bot_id: int, side: str, exit_price: float, exit_reason: str):
        """Hedge pozisyonu kapandığında Trade kaydını güncelle."""
        try:
            async with async_session() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(Trade).where(
                        Trade.bot_id == bot_id,
                        Trade.side == side,
                        Trade.status == TradeStatus.OPEN,
                    ).order_by(Trade.opened_at.desc()).limit(1)
                )
                trade = result.scalar_one_or_none()
                if not trade:
                    print(f"[HedgeBot {self.config['name']}] Kapanacak açık trade bulunamadı: {side}")
                    return

                trade.exit_price = exit_price
                trade.status = TradeStatus.CLOSED
                trade.closed_at = datetime.utcnow()
                trade.exit_reason = exit_reason

                # PnL hesapla
                if side == "long":
                    trade.pnl_pct = round((exit_price - trade.entry_price) / trade.entry_price * 100, 4)
                else:
                    trade.pnl_pct = round((trade.entry_price - exit_price) / trade.entry_price * 100, 4)

                # PnL USDT: pnl_pct * notional / 100
                # quantity = kontrat sayısı, contract_size ile çarparak gerçek pozisyon bulunur
                # Basitleştirme: risk_per_trade * balance yaklaşımı
                # NOT: quantity * contract_size * entry_price = notional (kaldıraçlı)
                #      Gerçek USDT PnL = notional * pnl_pct / 100
                try:
                    _market = self.exchange.exchange.market(self.config["symbol"])
                    _cs = float(_market.get("contractSize", 0.001) or 0.001)
                except Exception:
                    _cs = 0.001
                notional = trade.quantity * _cs * trade.entry_price
                trade.pnl = round(notional * trade.pnl_pct / 100, 4)

                # Süre hesapla
                if trade.opened_at:
                    delta = datetime.utcnow() - trade.opened_at.replace(tzinfo=None)
                    trade.duration_minutes = int(delta.total_seconds() / 60)

                await session.commit()
                print(f"[HedgeBot {self.config['name']}] Trade kapatıldı: #{trade.id} {side} → {exit_reason} PnL={trade.pnl_pct:.2f}% ${trade.pnl:.4f}")
        except Exception as e:
            print(f"[HedgeBot {self.config['name']}] Trade kapanış kayıt hatası: {e}")

    # ══════════════════════════════════════════════════════════════════════
    #  SMART SCANNER BOT — Otomatik coin seçimi + işlem açma
    # ══════════════════════════════════════════════════════════════════════

    async def _collect_past_performance(self, bot_id: int) -> dict:
        """Geçmiş işlem performansını topla — AI'nın öğrenmesi için."""
        from sqlalchemy import text as sql_text

        result = {
            "total": 0, "wins": 0, "losses": 0, "win_rate": 0,
            "avg_win_pct": 0, "avg_loss_pct": 0, "total_pnl_pct": 0,
            "by_strategy": {}, "recent_trades": [],
            "best_coins": [], "worst_coins": [],
        }

        try:
            async with async_session() as session:
                # scanner_simulations tablosundan son 100 kapalı işlemi al
                rows = await session.execute(sql_text("""
                    SELECT coin, direction, leverage, pnl_pct, exit_reason, status,
                           tp_pct, sl_pct, created_at, closed_at
                    FROM scanner_simulations
                    WHERE status IN ('win', 'loss')
                    ORDER BY closed_at DESC NULLS LAST
                    LIMIT 100
                """))
                trades = rows.fetchall()

                if not trades:
                    return result

                wins = [t for t in trades if t[3] and t[3] > 0]
                losses = [t for t in trades if t[3] and t[3] <= 0]
                result["total"] = len(trades)
                result["wins"] = len(wins)
                result["losses"] = len(losses)
                result["win_rate"] = (len(wins) / len(trades) * 100) if trades else 0
                result["avg_win_pct"] = sum(t[3] for t in wins) / max(1, len(wins)) if wins else 0
                result["avg_loss_pct"] = sum(t[3] for t in losses) / max(1, len(losses)) if losses else 0
                result["total_pnl_pct"] = sum(t[3] for t in trades if t[3])

                # Çıkış stratejisi bazlı performans
                strat_map = {}  # exit_reason → list of pnl
                for t in trades:
                    reason = t[4] or "unknown"
                    # Trailing / TP / SL / EXPIRED → strateji kategorisi
                    if "TRAILING" in reason.upper():
                        cat = "trailing"
                    elif "HEDGE" in reason.upper():
                        cat = "hedge"
                    else:
                        cat = "normal_tp_sl"
                    if cat not in strat_map:
                        strat_map[cat] = []
                    strat_map[cat].append(float(t[3]) if t[3] else 0)

                for cat, pnls in strat_map.items():
                    win_count = sum(1 for p in pnls if p > 0)
                    result["by_strategy"][cat] = {
                        "count": len(pnls),
                        "win_rate": (win_count / len(pnls) * 100) if pnls else 0,
                        "avg_pnl": sum(pnls) / max(1, len(pnls)),
                    }

                # Son 10 işlem (detaylı)
                for t in trades[:10]:
                    result["recent_trades"].append({
                        "coin": t[0],
                        "direction": t[1],
                        "leverage": t[2],
                        "pnl_pct": float(t[3]) if t[3] else 0,
                        "exit_reason": t[4] or "?",
                        "strategy": "trailing" if t[4] and "TRAILING" in (t[4] or "").upper()
                                    else "hedge" if t[4] and "HEDGE" in (t[4] or "").upper()
                                    else "normal_tp_sl",
                    })

                # En iyi/kötü coinler
                coin_pnl = {}
                for t in trades:
                    coin = t[0]
                    if coin not in coin_pnl:
                        coin_pnl[coin] = []
                    coin_pnl[coin].append(float(t[3]) if t[3] else 0)

                coin_avg = {c: sum(ps) / len(ps) for c, ps in coin_pnl.items() if len(ps) >= 2}
                if coin_avg:
                    sorted_coins = sorted(coin_avg.items(), key=lambda x: x[1], reverse=True)
                    result["best_coins"] = [f"{c}(%{p:+.1f})" for c, p in sorted_coins[:3] if p > 0]
                    result["worst_coins"] = [f"{c}(%{p:+.1f})" for c, p in sorted_coins[-3:] if p < 0]

        except Exception as e:
            print(f"[PerfCollector] Hata: {e}")

        return result

    async def _run_smart_scanner_cycle(self, redis):
        """
        Smart Scanner döngüsü:
        1. coin_snapshots tablosundan tüm coinleri oku
        2. Manuel veya AI modu ile en iyi coinleri seç
        3. Seçilen coinler için işlem aç
        """
        from sqlalchemy import text as sql_text
        from ai.openrouter import _call
        from core.config import settings

        bot_name = self.config["name"]
        bot_id = self.config["id"]
        params = self.config.get("params", {})
        mode = params.get("selection_mode", "manual")  # "manual" veya "ai"
        max_positions = int(params.get("max_positions", 3))
        paper = self.config.get("paper_mode", True)

        # ── 1. coin_snapshots'dan verileri çek ──
        has_funding = False
        try:
            async with async_session() as session:
                # funding_rate kolonu var mı kontrol et
                try:
                    await session.execute(sql_text("SELECT funding_rate FROM coin_snapshots LIMIT 1"))
                    has_funding = True
                except Exception:
                    await session.rollback()

                if has_funding:
                    result = await session.execute(sql_text("""
                        SELECT base, symbol, price, price_change_1h, price_change_24h,
                               rsi_14, atr, atr_pct, ema200, ema200_dist,
                               macd_hist, supertrend_dir, adx, volume_ratio,
                               bb_upper, bb_lower, max_leverage, zero_fee, updated_at,
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
                               bb_upper, bb_lower, max_leverage, zero_fee, updated_at
                        FROM coin_snapshots
                        WHERE zero_fee = true AND price > 0
                        ORDER BY updated_at DESC
                    """))
                rows = result.fetchall()
        except Exception as e:
            print(f"[SmartScanner {bot_name}] DB hatası: {e}")
            await self._write_scanner_status(redis, bot_id, bot_name, error=str(e))
            return

        if not rows:
            print(f"[SmartScanner {bot_name}] Henüz coin verisi yok — collector çalışmayı bekliyor")
            await self._write_scanner_status(redis, bot_id, bot_name, error="Coin verisi yok")
            return

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
                coin["funding_rate"] = float(r[19]) if r[19] is not None else None
                coin["fear_greed"] = int(r[20]) if r[20] is not None else None
            coins.append(coin)

        print(f"[SmartScanner {bot_name}] {len(coins)} coin analiz ediliyor (mod={mode})")

        # ── 2. Açık pozisyonları kontrol et (borsadan doğrula) ──
        saved_positions = []
        try:
            active_raw = await redis.get(f"bot:{bot_id}:active_positions")
            if active_raw:
                saved_positions = json.loads(active_raw)
        except Exception:
            pass

        # Borsadan gerçek açık pozisyonları al — kapanmış olanları temizle
        active_positions = []
        exchange_position_count = 0  # Borsadaki gerçek pozisyon sayısı
        try:
            # MEXC native API — daha güvenilir (CCXT fetch_positions sorunlu)
            raw_resp = await asyncio.wait_for(
                self.exchange.exchange.contractPrivateGetPositionOpenPositions(),
                timeout=8
            )
            pos_list = raw_resp.get("data", []) if isinstance(raw_resp, dict) else raw_resp or []
            open_symbols = set()
            for pos in pos_list:
                hold_vol = float(pos.get("holdVol", 0) or 0)
                if hold_vol > 0:
                    mexc_sym = pos.get("symbol", "")  # BTC_USDT
                    base = mexc_sym.split("_")[0] if "_" in mexc_sym else mexc_sym
                    open_symbols.add(base)
            exchange_position_count = len(open_symbols)  # Coin bazlı say (hedge long+short = 1)

            # Borsadaki gerçek pozisyon sayısı max_positions'ı aşıyorsa dur
            if exchange_position_count >= max_positions:
                print(f"[SmartScanner {bot_name}] Borsada {exchange_position_count} pozisyon var (max={max_positions}) — yeni işlem açılmayacak")
                await self._write_scanner_status(redis, bot_id, bot_name,
                    coins_total=len(coins), active=list(open_symbols), mode=mode, waiting=True)
                return

            if saved_positions:
                for coin in saved_positions:
                    if coin in open_symbols:
                        active_positions.append(coin)
                    else:
                        print(f"[SmartScanner {bot_name}] {coin} pozisyonu kapanmış — listeden çıkarıldı, cooldown ekleniyor")
                        try:
                            cooldown_key = f"bot:{bot_id}:cooldown:{coin}"
                            scan_interval = int(params.get("scan_interval", 120))
                            cooldown_secs = max(scan_interval * 3, 300)
                            await redis.set(cooldown_key, "1", ex=cooldown_secs)
                            print(f"[SmartScanner {bot_name}] {coin} cooldown: {cooldown_secs}s")
                        except Exception:
                            pass

                if len(active_positions) != len(saved_positions):
                    await redis.set(f"bot:{bot_id}:active_positions", json.dumps(active_positions), ex=86400)

        except Exception as e:
            print(f"[SmartScanner {bot_name}] Pozisyon kontrolü hatası: {e} — kayıtlı liste kullanılıyor")
            active_positions = saved_positions or []

        if len(active_positions) >= max_positions:
            print(f"[SmartScanner {bot_name}] Max pozisyon ({max_positions}) doldu — bekleniyor")
            await self._write_scanner_status(redis, bot_id, bot_name,
                coins_total=len(coins), active=active_positions, mode=mode, waiting=True)
            return

        # ── 3. Coin seçimi ──
        selections = []
        ai_error = None

        if mode == "ai":
            # ══ AI KARAR MODU ══
            try:
                # 222 coin prompt'a sığmaz — en ilgi çekici 40 coin'i ön-filtrele
                # Skor: RSI aşırı bölge + yüksek hacim + güçlü trend + yüksek ATR
                def _interest_score(c):
                    s = 0
                    rsi = c.get("rsi_14")
                    if rsi and (rsi < 30 or rsi > 70):
                        s += 20
                    if rsi and (rsi < 20 or rsi > 80):
                        s += 15  # çok aşırı
                    adx = c.get("adx")
                    if adx and adx > 25:
                        s += 15
                    if adx and adx > 40:
                        s += 10  # çok güçlü trend
                    vol = c.get("volume_ratio")
                    if vol and vol > 2:
                        s += 15
                    if vol and vol > 3:
                        s += 10
                    atr = c.get("atr_pct")
                    if atr and atr > 0.5:
                        s += 10
                    chg = c.get("price_change_24h")
                    if chg and abs(chg) > 3:
                        s += 10
                    # MACD momentum değişimi
                    macd = c.get("macd_hist")
                    if macd is not None and abs(macd) > 0:
                        trend = c.get("supertrend_dir")
                        if (macd > 0 and trend == 1) or (macd < 0 and trend == -1):
                            s += 12  # momentum + trend uyumu
                        else:
                            s += 5   # divergence potansiyeli
                    # Bollinger squeeze (patlama potansiyeli)
                    bb_u = c.get("bb_upper")
                    bb_l = c.get("bb_lower")
                    px = c.get("price", 0)
                    if bb_u and bb_l and px > 0:
                        bb_w = bb_u - bb_l
                        if bb_w > 0:
                            if (bb_w / px * 100) < 1.0:
                                s += 15  # squeeze = yakında patlama
                            bb_pos = (px - bb_l) / bb_w
                            if bb_pos < 0.1 or bb_pos > 0.9:
                                s += 10  # banda yapışmış = fırsat
                    # EMA200'e yakınlık (dönüş fırsatı)
                    ema_d = c.get("ema200_dist")
                    if ema_d is not None and abs(ema_d) < 1.0:
                        s += 8  # EMA200 cross potansiyeli
                    return s

                # Açık pozisyondakileri çıkar, ilgi skoruna göre sırala
                # NOT: active_positions bazen eksik kalabilir, borsadan dönen open_symbols'ü kullanmak en güvenlisidir.
                ai_candidates = [c for c in coins if c["base"] not in open_symbols]
                ai_candidates.sort(key=_interest_score, reverse=True)
                ai_top = ai_candidates[:20]  # En ilgi çekici 20 coin (token limiti için)

                print(f"[SmartScanner {bot_name}] AI'ya {len(ai_top)}/{len(coins)} coin gönderiliyor. MTF verileri çekiliyor...")

                # --- MTF FETCHING ---
                from ai.indicators import calculate_all
                async def _fetch_mtf(c):
                    try:
                        sym = c["symbol"]
                        tasks = [
                            self.exchange.exchange.fetch_ohlcv(sym, "5m", limit=60),
                            self.exchange.exchange.fetch_ohlcv(sym, "15m", limit=60),
                            self.exchange.exchange.fetch_ohlcv(sym, "4h", limit=60)
                        ]
                        res = await asyncio.gather(*tasks, return_exceptions=True)
                        c["mtf"] = {}
                        
                        timeframes = ["5m", "15m", "4h"]
                        for i, tf in enumerate(timeframes):
                            if not isinstance(res[i], Exception) and len(res[i]) > 20:
                                ind = calculate_all(res[i])
                                if ind:
                                    c["mtf"][tf] = {
                                        "rsi": round(ind.get("rsi", 0), 1) if ind.get("rsi") else None,
                                        "trend": ind.get("supertrend_dir"),
                                        "macd": round(ind.get("macd_hist", 0), 4) if ind.get("macd_hist") else None
                                    }
                    except Exception as e:
                        print(f"[SmartScanner {bot_name}] MTF çekim hatası {c.get('base')}: {e}")
                        c["mtf"] = {}

                # MTF verilerini paralel çek
                await asyncio.gather(*[_fetch_mtf(c) for c in ai_top])
                # --------------------

                # --- NEWS & SENTIMENT (CryptoCompare / Coindesk) ---
                news_data = {}
                cc_key = getattr(settings, "CRYPTOCOMPARE_API_KEY", "a6227ed9ecdf95dafbf4a08d6095bd516cb0dd27132c1de8eb4f59c30e328391")
                if cc_key and len(cc_key) > 20:
                    print(f"[SmartScanner {bot_name}] CryptoCompare'den (Coindesk) haberler çekiliyor...")
                    top_coins = [c["base"] for c in ai_top[:5]]
                    try:
                        async with httpx.AsyncClient(timeout=10) as client:
                            categories = ",".join(top_coins)
                            url = f"https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories={categories}&api_key={cc_key}"
                            r = await client.get(url)
                            if r.status_code == 200:
                                data = r.json()
                                if data.get("Data"):
                                    posts = data["Data"]
                                    for post in posts:
                                        # Hangi coin(ler)le ilgili olduğunu bul
                                        tags = post.get("categories", "").split("|")
                                        for coin_base in top_coins:
                                            if coin_base in tags or coin_base in post.get("title", ""):
                                                if coin_base not in news_data:
                                                    news_data[coin_base] = []
                                                if len(news_data[coin_base]) < 3: # En fazla 3 haber
                                                    news_data[coin_base].append(post.get("title", ""))
                    except Exception as e:
                        print(f"[SmartScanner {bot_name}] Haber çekim hatası: {e}")
                else:
                    print(f"[SmartScanner {bot_name}] CRYPTOCOMPARE_API_KEY bulunamadı, haber atlanıyor.")
                
                # Haberleri coin datasına ekle
                for c in ai_top:
                    c["news"] = news_data.get(c["base"], [])
                # ---------------------------------------------------

                # --- COINALYZE L/S RATIO (Coinglass Alternatifi) ---
                coinalyze_key = getattr(settings, "COINALYZE_API_KEY", "d81902f0-8b0d-42ed-9c4d-36e8f31de1f8")
                ls_data = {}
                if coinalyze_key:
                    import time
                    print(f"[SmartScanner {bot_name}] Coinalyze'dan Long/Short verileri çekiliyor...")
                    try:
                        # Binance formatında sembolleri oluştur (örn: BTCUSDT_PERP.A)
                        coinalyze_symbols = [f"{c['base']}USDT_PERP.A" for c in ai_top]
                        symbols_str = ",".join(coinalyze_symbols)
                        now = int(time.time())
                        from_time = now - 3600 # Son 1 saat
                        
                        async with httpx.AsyncClient(timeout=8) as client:
                            url = f"https://api.coinalyze.net/v1/long-short-ratio-history?symbols={symbols_str}&interval=1hour&from={from_time}&to={now}"
                            r = await client.get(url, headers={"api_key": coinalyze_key})
                            if r.status_code == 200:
                                ls_results = r.json()
                                for item in ls_results:
                                    sym = item.get("symbol", "").replace("USDT_PERP.A", "")
                                    hist = item.get("history", [])
                                    if hist:
                                        latest = hist[-1]
                                        ls_data[sym] = {
                                            "ratio": latest.get("r"),
                                            "long_pct": latest.get("l"),
                                            "short_pct": latest.get("s")
                                        }
                    except Exception as e:
                        print(f"[SmartScanner {bot_name}] Coinalyze çekim hatası: {e}")
                
                # L/S verilerini coin'e ekle
                for c in ai_top:
                    c["ls_ratio"] = ls_data.get(c["base"])
                # --------------------------------------------------

                # --- LİKİDASYON VERİLERİ ---
                from services.liquidation_collector import get_liquidation_stats
                print(f"[SmartScanner {bot_name}] Likidasyon (Binance WS) verileri çekiliyor...")
                liq_tasks = [get_liquidation_stats(c["base"]) for c in ai_top]
                liq_results = await asyncio.gather(*liq_tasks)
                for i, c in enumerate(ai_top):
                    c["liquidations"] = liq_results[i]
                # ---------------------------

                leverage_range = (
                    int(params.get("min_leverage", 3)),
                    int(params.get("max_leverage", 75)),
                )
                remaining = max_positions - len(active_positions)

                # ── Geçmiş performans verisi topla (AI öğrensin) ──
                past_performance = None
                try:
                    past_performance = await self._collect_past_performance(bot_id)
                except Exception as perf_err:
                    print(f"[SmartScanner {bot_name}] Performans verisi alınamadı: {perf_err}")

                prompt = build_ai_prompt(ai_top, active_positions, leverage_range=leverage_range,
                                         max_selections=remaining, past_performance=past_performance,
                                         bot_config=params)
                model = settings.AI_DEEP_MODEL
                ai_response = await asyncio.wait_for(
                    _call(model, prompt, max_tokens=1200),
                    timeout=45,  # 45s max — Gateway Timeout'u önle
                )

                ai_selections = ai_response.get("selections", [])
                market_regime = ai_response.get("market_regime", "unknown")
                market_analysis = ai_response.get("market_analysis", "")

                print(f"[SmartScanner {bot_name}] AI: regime={market_regime}, {len(ai_selections)} seçim, analiz={market_analysis[:100]}")
                if ai_response.get("skipped_reason"):
                    print(f"[SmartScanner {bot_name}] AI pas geçti: {ai_response['skipped_reason']}")
                    ai_error = f"AI pas geçti: {ai_response['skipped_reason']}"

                for sel in ai_selections:
                    coin_name = sel.get("coin", "")
                    if coin_name in active_positions:
                        continue
                    if sel.get("confidence", 0) < int(params.get("min_ai_confidence", 60)):
                        print(f"[SmartScanner {bot_name}] {coin_name} confidence={sel.get('confidence')} < {params.get('min_ai_confidence', 60)}, atlanıyor")
                        continue
                    # Symbol doğrulama — AI bazen yanlış format verebilir
                    ai_symbol = sel.get("symbol", f"{coin_name}/USDT:USDT")
                    if ":" not in ai_symbol:
                        ai_symbol = f"{coin_name}/USDT:USDT"
                    # coin_snapshots'daki symbol'le eşleştir
                    matched = next((c for c in coins if c["base"] == coin_name), None)
                    if matched:
                        ai_symbol = matched["symbol"]

                    # Leverage: AI önerisini min/max aralığına ve coin max'ına sınırla
                    ai_lev = int(sel.get("leverage_suggestion") or params.get("leverage", 5))
                    min_lev = int(params.get("min_leverage", 3))
                    max_lev = int(params.get("max_leverage", 75))
                    coin_max_lev = (matched.get("max_leverage") or 200) if matched else 200
                    clamped_lev = max(min_lev, min(max_lev, ai_lev, coin_max_lev))
                    if clamped_lev != ai_lev:
                        print(f"[SmartScanner {bot_name}] Leverage clamp: AI={ai_lev}x → {clamped_lev}x (aralık {min_lev}-{max_lev}, coin_max={coin_max_lev})")

                    # ── ATR + Kaldıraç bazlı TP/SL optimizasyonu ──
                    ai_tp = float(sel.get("tp_suggestion_pct") or params.get("tp_pct", 2))
                    ai_sl = float(sel.get("sl_suggestion_pct") or params.get("sl_pct", 1))
                    coin_atr = matched.get("atr_pct") if matched else None
                    old_tp, old_sl = ai_tp, ai_sl
                    ai_tp, ai_sl = clamp_tp_sl(ai_tp, ai_sl, clamped_lev, coin_atr_pct=coin_atr)
                    if old_tp != ai_tp or old_sl != ai_sl:
                        print(f"[SmartScanner {bot_name}] TP/SL clamp (lev={clamped_lev}x ATR={coin_atr or '?'}%): "
                              f"TP {old_tp}%→{ai_tp}% | SL {old_sl}%→{ai_sl}%")

                    # AI'ın çıkış stratejisi kararı
                    ai_exit_strategy = sel.get("exit_strategy", "normal_tp_sl")
                    if ai_exit_strategy not in ("trailing", "normal_tp_sl", "hedge"):
                        ai_exit_strategy = "normal_tp_sl"
                    ai_trailing_cb = float(sel.get("trailing_callback_pct") or params.get("trailing_callback_pct", 0.1))

                    print(f"[SmartScanner {bot_name}] {coin_name}: exit_strategy={ai_exit_strategy}, "
                          f"reason={sel.get('exit_reason', 'N/A')}")

                    selections.append({
                        "coin": coin_name,
                        "symbol": ai_symbol,
                        "direction": sel.get("direction", "long"),
                        "confidence": sel.get("confidence", 50),
                        "leverage": clamped_lev,
                        "tp_pct": ai_tp,
                        "sl_pct": ai_sl,
                        "reason": sel.get("entry_reason", "AI seçimi"),
                        "source": "ai",
                        "market_regime": market_regime,
                        "exit_strategy": ai_exit_strategy,
                        "trailing_callback_pct": ai_trailing_cb,
                    })

            except Exception as e:
                ai_error = f"AI hatası: {str(e)[:200]}"
                print(f"[SmartScanner {bot_name}] {ai_error}")
                import traceback
                traceback.print_exc()

        else:
            # ══ MANUEL KRİTER MODU ══
            criteria = ManualCriteria(
                trend_filter=str(params.get("trend_filter", "any")),
                min_adx=float(params.get("min_adx", 0)),
                ema200_position=str(params.get("ema200_position", "any")),
                rsi_min=float(params.get("rsi_min", 0)),
                rsi_max=float(params.get("rsi_max", 100)),
                rsi_zone=str(params.get("rsi_zone", "any")),
                min_atr_pct=float(params.get("min_atr_pct", 0)),
                max_atr_pct=float(params.get("max_atr_pct", 100)),
                min_price_change_24h=float(params.get("min_price_change_24h", -100)),
                max_price_change_24h=float(params.get("max_price_change_24h", 100)),
                min_volume_ratio=float(params.get("min_volume_ratio", 0)),
                min_leverage=int(params.get("min_leverage", 0)),
                sort_by=str(params.get("sort_by", "score")),
                sort_dir=str(params.get("sort_dir", "desc")),
                max_coins=int(params.get("max_coins", 3)),
                trade_direction=str(params.get("trade_direction", "auto")),
            )

            scored = []
            for coin in coins:
                if coin["base"] in active_positions:
                    continue
                sc = score_coin_manual(coin, criteria)
                if sc is not None:
                    scored.append((coin, sc))

            # Sıralama
            if criteria.sort_by == "score":
                scored.sort(key=lambda x: x[1], reverse=(criteria.sort_dir == "desc"))
            else:
                scored.sort(
                    key=lambda x: x[0].get(criteria.sort_by) or 0,
                    reverse=(criteria.sort_dir == "desc"),
                )

            # En iyi N coin
            top = scored[:criteria.max_coins]
            remaining_slots = max_positions - len(active_positions)
            top = top[:remaining_slots]

            for coin, sc in top:
                direction = determine_trade_direction(coin, criteria)
                # Coin'in borsa max kaldıracını aşma
                target_lev = int(params.get("leverage", 5))
                coin_max_lev = coin.get("max_leverage") or 200
                safe_lev = min(target_lev, coin_max_lev)
                if safe_lev != target_lev:
                    print(f"[SmartScanner {bot_name}] {coin['base']} leverage {target_lev}x → {safe_lev}x (coin max={coin_max_lev})")
                selections.append({
                    "coin": coin["base"],
                    "symbol": coin["symbol"],
                    "direction": direction,
                    "confidence": int(min(sc, 100)),
                    "leverage": safe_lev,
                    "tp_pct": float(params.get("tp_pct", 2)),
                    "sl_pct": float(params.get("sl_pct", 1)),
                    "reason": f"Skor: {sc:.0f} | RSI:{coin.get('rsi_14','?')} ADX:{coin.get('adx','?')} Vol:{coin.get('volume_ratio','?')}x",
                    "source": "manual",
                    "score": sc,
                })

            print(f"[SmartScanner {bot_name}] Manuel: {len(scored)} coin geçti, {len(selections)} seçildi")

        # ── 4. İşlem aç ──
        # Kalan slot kadar seçim yap — max_positions'ı aşma
        remaining_slots = max_positions - len(active_positions)
        if len(selections) > remaining_slots:
            print(f"[SmartScanner {bot_name}] {len(selections)} seçim → {remaining_slots} slot kaldı, kırpılıyor")
            selections = selections[:remaining_slots]

        if not selections:
            reason = ai_error or "Kriterlere uyan coin bulunamadı"
            print(f"[SmartScanner {bot_name}] Seçim yok — {reason}")

        opened = []
        for sel in selections:
            # ── Her işlem öncesi kalan slot kontrolü ──
            current_open = len(active_positions)
            if current_open >= max_positions:
                print(f"[SmartScanner {bot_name}] Max pozisyon ({max_positions}) doldu — kalan seçimler atlanıyor")
                break

            try:
                # Cooldown kontrolü — yakın zamanda kapanan coin tekrar açılmasın
                coin_name = sel.get("coin", "")
                try:
                    if await redis.exists(f"bot:{bot_id}:cooldown:{coin_name}"):
                        print(f"[SmartScanner {bot_name}] {coin_name} cooldown'da — atlanıyor")
                        continue
                except Exception:
                    pass

                symbol = sel["symbol"]
                side = "buy" if sel["direction"] == "long" else "sell"
                leverage = sel.get("leverage", int(params.get("leverage", 5)))
                tp_pct = sel.get("tp_pct", float(params.get("tp_pct", 2)))
                sl_pct = sel.get("sl_pct", float(params.get("sl_pct", 1)))

                # Fiyat bilgisi al
                try:
                    ticker = await asyncio.wait_for(
                        self.exchange.exchange.fetch_ticker(symbol), timeout=10
                    )
                    price = float(ticker["last"])
                except Exception as e:
                    print(f"[SmartScanner {bot_name}] {symbol} fiyat alınamadı: {e}")
                    continue

                # TP/SL hesapla
                if sel["direction"] == "long":
                    tp_price = round(price * (1 + tp_pct / 100), 6)
                    sl_price = round(price * (1 - sl_pct / 100), 6)
                else:
                    tp_price = round(price * (1 - tp_pct / 100), 6)
                    sl_price = round(price * (1 + sl_pct / 100), 6)

                # Pozisyon büyüklüğü — trade_size_mode/trade_size_value kullan
                trade_size_mode = params.get("trade_size_mode", "fixed")
                trade_size_value = float(params.get("trade_size_value", 0))

                if trade_size_mode == "fixed" and trade_size_value > 0:
                    # Sabit USDT margin
                    margin_usdt = trade_size_value
                elif trade_size_mode == "percent" and trade_size_value > 0:
                    # Bakiyenin %'si
                    margin_usdt = self.risk.current_balance * (trade_size_value / 100)
                elif trade_size_mode == "auto_exchange" and trade_size_value > 0:
                    # Borsa bakiyesinin %'si — Redis'ten al
                    try:
                        import json as _json
                        _bal_raw = await redis.get("exchange:mexc:balance")
                        if _bal_raw:
                            _bal = _json.loads(_bal_raw)
                            margin_usdt = float(_bal.get("free", 0)) * (trade_size_value / 100)
                        else:
                            margin_usdt = self.risk.current_balance * (trade_size_value / 100)
                    except Exception:
                        margin_usdt = self.risk.current_balance * (trade_size_value / 100)
                else:
                    # Fallback: risk_per_trade kullan
                    rpt = self.risk.risk_per_trade
                    margin_usdt = rpt if rpt > 1.0 else self.risk.current_balance * rpt

                print(f"[SmartScanner {bot_name}] {sel['coin']} margin hesabı: mode={trade_size_mode} value={trade_size_value} → ${margin_usdt:.2f}")

                if margin_usdt < 1:
                    print(f"[SmartScanner {bot_name}] {sel['coin']} — margin ${margin_usdt:.2f} çok düşük, atlanıyor")
                    continue

                # qty hesabı — _execute içinde MEXC kontrat hesabı yapılacak
                qty = (margin_usdt * leverage) / price
                if qty <= 0:
                    print(f"[SmartScanner {bot_name}] {sel['coin']} — pozisyon büyüklüğü 0, atlanıyor")
                    continue

                # ── AI exit_strategy kararına göre parametreleri ayarla ──
                exit_strategy = sel.get("exit_strategy", "normal_tp_sl")

                # Bot config'den izin kontrolü — toggle kapalıysa AI kararını override et
                hedge_allowed = bool(params.get("hedge_enabled", False))
                trailing_allowed = bool(params.get("trailing_enabled", False))

                if exit_strategy == "hedge" and not hedge_allowed:
                    print(f"[SmartScanner {bot_name}] {sel['coin']} AI hedge istedi ama hedge_enabled=False — normal_tp_sl'e düşürüldü")
                    exit_strategy = "normal_tp_sl"
                if exit_strategy == "trailing" and not trailing_allowed:
                    print(f"[SmartScanner {bot_name}] {sel['coin']} AI trailing istedi ama trailing_enabled=False — normal_tp_sl'e düşürüldü")
                    exit_strategy = "normal_tp_sl"

                # AI result formatında — dynamic_leverage ile _execute doğru leverage kullanır
                ai_result = {
                    "approved": True,
                    "confidence": sel.get("confidence", 50),
                    "take_profit": tp_price,
                    "stop_loss": sl_price,
                    "analysis": sel.get("reason", "Smart Scanner seçimi"),
                    "dynamic_leverage": leverage,  # Scanner/AI leverage → _execute'a geçir
                    "tp_pct": tp_pct,              # MEXC fill price recalc için
                    "sl_pct": sl_pct,              # MEXC fill price recalc için
                    "margin_usdt": margin_usdt,    # Gerçek margin — loglama için
                }

                # NOT: set_leverage burada çağrılmıyor — _execute içinde dynamic_leverage ile yapılıyor

                if exit_strategy == "hedge":
                    # ── HEDGE: aynı coin üzerinde hem long hem short aç (1 pozisyon olarak sayılır) ──
                    if len(active_positions) >= max_positions:
                        print(f"[SmartScanner {bot_name}] {sel['coin']} hedge için slot yok — atlanıyor")
                        continue

                    # Hedge işlemlerinde trailing KAPALI — normal TP/SL kullan
                    params["trailing_enabled"] = False
                    params.pop("trailing_callback_pct", None)
                    params.pop("trailing_callback_rate", None)

                    # Hedge TP/SL: bot ayarlarından oku (kullanıcının girdiği değerler)
                    hedge_tp = float(params.get("hedge_tp_pct") or tp_pct)
                    hedge_sl = float(params.get("hedge_sl_pct") or sl_pct)

                    # Kaldıraca göre hedge TP/SL clamp (tasfiye koruması)
                    h_liq_dist = 100.0 / leverage
                    h_max_sl = round(h_liq_dist * 0.50, 4)
                    h_max_tp = round(h_liq_dist * 0.80, 4)
                    if hedge_sl > h_max_sl:
                        print(f"[SmartScanner {bot_name}] Hedge SL clamp: {hedge_sl}% → {h_max_sl}% (lev={leverage}x)")
                        hedge_sl = h_max_sl
                    if hedge_tp > h_max_tp:
                        print(f"[SmartScanner {bot_name}] Hedge TP clamp: {hedge_tp}% → {h_max_tp}% (lev={leverage}x)")
                        hedge_tp = h_max_tp

                    print(f"[SmartScanner {bot_name}] HEDGE {sel['coin']}: TP={hedge_tp}% SL={hedge_sl}% Lev={leverage}x (her iki yön aynı)")

                    # Long ve Short TP/SL hesapla
                    long_tp = round(price * (1 + hedge_tp / 100), 6)
                    long_sl = round(price * (1 - hedge_sl / 100), 6)
                    short_tp = round(price * (1 - hedge_tp / 100), 6)
                    short_sl = round(price * (1 + hedge_sl / 100), 6)

                    long_ai = {
                        **ai_result,
                        "take_profit": long_tp, "stop_loss": long_sl,
                        "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                        "dynamic_leverage": leverage,
                        "pos_side": "long",
                        "analysis": f"HEDGE LONG (AI karar) — {sel.get('reason', '')}",
                    }
                    short_ai = {
                        **ai_result,
                        "take_profit": short_tp, "stop_loss": short_sl,
                        "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                        "dynamic_leverage": leverage,
                        "pos_side": "short",
                        "analysis": f"HEDGE SHORT (AI karar) — {sel.get('reason', '')}",
                    }

                    # Hedge bot gibi paralel gönder — asyncio.gather
                    hedge_results = await asyncio.gather(
                        self._execute("buy", price, qty, long_sl, long_ai, symbol_override=symbol),
                        self._execute("sell", price, qty, short_sl, short_ai, symbol_override=symbol),
                        return_exceptions=True,
                    )
                    for i, (h_dir, h_res) in enumerate(zip(["Long", "Short"], hedge_results)):
                        if isinstance(h_res, Exception):
                            print(f"[SmartScanner {bot_name}] ✗ HEDGE {h_dir} hatası: {h_res}")
                        else:
                            print(f"[SmartScanner {bot_name}] ✓ HEDGE {h_dir} açıldı")

                    await self._log_signal(side, price, source="smart_scanner_ai_hedge",
                        action="executed", confidence=sel.get("confidence"),
                        tp_price=tp_price, sl_price=sl_price,
                        reject_reason=None, symbol_override=symbol)

                    print(f"[SmartScanner {bot_name}] ✅ HEDGE {sel['coin']} @ ${price:,.4f} "
                          f"TP={hedge_tp}% SL={hedge_sl}% Lev={leverage}x (AI karar)")

                else:
                    # Trailing: AI trailing seçtiyse params'a trailing ekle, yoksa normal TP/SL
                    if exit_strategy == "trailing":
                        trailing_cb = sel.get("trailing_callback_pct", float(params.get("trailing_callback_pct", 0.15)))
                        # params'a trailing bilgisini geçici ekle — _execute okuyacak
                        params["trailing_enabled"] = True
                        params["trailing_callback_pct"] = trailing_cb
                        params["trailing_callback_rate"] = trailing_cb
                    else:
                        # Normal TP/SL — trailing kapalı
                        params["trailing_enabled"] = False
                        params.pop("trailing_callback_pct", None)
                        params.pop("trailing_callback_rate", None)

                    await self._execute(side, price, qty, sl_price, ai_result, symbol_override=symbol)

                    await self._log_signal(side, price, source=f"smart_scanner_{sel['source']}",
                        action="executed", confidence=sel.get("confidence"),
                        tp_price=tp_price, sl_price=sl_price,
                        reject_reason=None, symbol_override=symbol)

                    strategy_label = f"TRAILING({sel.get('trailing_callback_pct', '?')}%)" if exit_strategy == "trailing" else "TP/SL"
                    print(f"[SmartScanner {bot_name}] ✅ {sel['direction'].upper()} {sel['coin']} @ ${price:,.4f} "
                          f"TP={tp_pct}% SL={sl_pct}% Lev={leverage}x [{strategy_label}] Conf={sel.get('confidence')}%")

                opened.append(sel["coin"])
                active_positions.append(sel["coin"])

            except Exception as e:
                print(f"[SmartScanner {bot_name}] {sel['coin']} işlem hatası: {e}")
                import traceback
                traceback.print_exc()

        # ── 5. Hedge işlemleri (sadece MANUEL modda — AI modunda AI karar veriyor) ──
        hedge_enabled = params.get("hedge_enabled", False)
        if hedge_enabled and mode != "ai" and len(active_positions) < max_positions - 1:
            # Hedge'de trailing KAPALI — normal TP/SL kullan
            params["trailing_enabled"] = False
            params.pop("trailing_callback_pct", None)
            params.pop("trailing_callback_rate", None)

            hedge_tp = float(params.get("hedge_tp_pct", 0.4))
            hedge_sl = float(params.get("hedge_sl_pct", 0.1))
            use_max_lev = params.get("hedge_use_max_leverage", True)

            # Hedge için uygun coinleri filtrele — açık pozisyonu olmayan, yeterli volatilitesi olan
            hedge_candidates = [
                c for c in coins
                if c["base"] not in active_positions
                and c.get("atr_pct") and c["atr_pct"] > 0.3
                and c.get("volume_ratio") and c["volume_ratio"] > 1.5
            ]
            hedge_candidates.sort(key=lambda c: (c.get("atr_pct") or 0) * (c.get("volume_ratio") or 0), reverse=True)

            for hc in hedge_candidates[:2]:  # Max 2 hedge çifti
                if len(active_positions) >= max_positions - 1:
                    break
                try:
                    h_symbol = hc["symbol"]
                    try:
                        h_ticker = await asyncio.wait_for(
                            self.exchange.exchange.fetch_ticker(h_symbol), timeout=10
                        )
                        h_price = float(h_ticker["last"])
                    except Exception:
                        continue

                    coin_max_lev = hc.get("max_leverage") or 50
                    h_lev = coin_max_lev if use_max_lev else int(params.get("leverage", 5))

                    # TP/SL hesapla
                    h_long_tp = round(h_price * (1 + hedge_tp / 100), 6)
                    h_long_sl = round(h_price * (1 - hedge_sl / 100), 6)
                    h_short_tp = round(h_price * (1 - hedge_tp / 100), 6)
                    h_short_sl = round(h_price * (1 + hedge_sl / 100), 6)

                    h_qty = self.risk.position_size(h_price, h_long_sl)
                    if h_qty <= 0:
                        continue

                    h_long_ai = {
                        "approved": True, "confidence": 70,
                        "take_profit": h_long_tp, "stop_loss": h_long_sl,
                        "analysis": f"HEDGE LONG — ATR:{hc.get('atr_pct',0):.2f}% Vol:{hc.get('volume_ratio',0):.1f}x",
                        "dynamic_leverage": h_lev, "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                        "pos_side": "long",
                    }
                    h_short_ai = {
                        "approved": True, "confidence": 70,
                        "take_profit": h_short_tp, "stop_loss": h_short_sl,
                        "analysis": f"HEDGE SHORT — ATR:{hc.get('atr_pct',0):.2f}% Vol:{hc.get('volume_ratio',0):.1f}x",
                        "dynamic_leverage": h_lev, "tp_pct": hedge_tp, "sl_pct": hedge_sl,
                        "pos_side": "short",
                    }

                    # Hedge bot gibi paralel gönder
                    h_results = await asyncio.gather(
                        self._execute("buy", h_price, h_qty, h_long_sl, h_long_ai, symbol_override=h_symbol),
                        self._execute("sell", h_price, h_qty, h_short_sl, h_short_ai, symbol_override=h_symbol),
                        return_exceptions=True,
                    )
                    for h_dir, h_res in zip(["Long", "Short"], h_results):
                        if isinstance(h_res, Exception):
                            print(f"[SmartScanner {bot_name}] ✗ HEDGE {h_dir} hatası: {h_res}")
                        else:
                            print(f"[SmartScanner {bot_name}] ✓ HEDGE {h_dir} açıldı")

                    opened.append(f"{hc['base']}(H)")
                    active_positions.append(hc["base"])
                    print(f"[SmartScanner {bot_name}] 🔄 HEDGE {hc['base']} @ ${h_price:,.4f} "
                          f"lev={h_lev}x TP={hedge_tp}% SL={hedge_sl}%")

                except Exception as e:
                    print(f"[SmartScanner {bot_name}] {hc['base']} hedge hatası: {e}")

        # Aktif pozisyonları Redis'e kaydet
        try:
            await redis.set(f"bot:{bot_id}:active_positions", json.dumps(active_positions), ex=86400)
        except Exception:
            pass

        # Status güncelle
        await self._write_scanner_status(redis, bot_id, bot_name,
            coins_total=len(coins), mode=mode,
            active=active_positions, opened=opened,
            selections=[{k: v for k, v in s.items() if k != "market_regime"} for s in selections],
            ai_error=ai_error)

    async def _write_scanner_status(self, redis, bot_id, bot_name, **kwargs):
        """Smart Scanner status bilgisini Redis'e yaz."""
        status = {
            "name": bot_name,
            "symbol": "AUTO",
            "strategy": "smart_scanner",
            "signal": None,
            "price": 0,
            "scanner": {
                "coins_total": kwargs.get("coins_total", 0),
                "mode": kwargs.get("mode", "manual"),
                "active_positions": kwargs.get("active", []),
                "last_opened": kwargs.get("opened", []),
                "ai_error": kwargs.get("ai_error"),
                "last_selections": kwargs.get("selections", []),
                "waiting": kwargs.get("waiting", False),
                "error": kwargs.get("error"),
            },
            "risk": self.risk.status(),
            "ts": datetime.utcnow().isoformat(),
        }
        try:
            await redis.set(f"bot:{bot_id}:status", json.dumps(status))
        except Exception:
            pass

    def stop(self):
        self.running = False
        self._trailing.clear()
        print(f"[Bot {self.config['name']}] Durduruldu.")
