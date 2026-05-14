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
        self.data_fetcher = DataFetcher(exchange_client)
        self.running = False
        self.paper_trades: list = []
        self.signal_history: list = []
        # Trailing stop state: {symbol: {side, entry, highest/lowest, trail_price}}
        self._trailing: dict = {}
        self._hedge_state: dict = {} # {symbol: {long: {is_partial_closed}, short: {is_partial_closed}}}
        self._last_status_update = 0

        self.risk = RiskManager(
            balance=bot_config.get("initial_balance", 1000),
            risk_per_trade=bot_config.get("risk_per_trade", 0.01),
            max_daily_loss=bot_config.get("max_daily_loss", 0.05),
            leverage=bot_config.get("leverage", 3),
        )

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

        try:
            ticker = await asyncio.wait_for(self.exchange.exchange.fetch_ticker(symbol), timeout=15)
            print(f"[Bot {bot_name}] Bağlantı OK — fiyat: {ticker.get('last')}")
        except asyncio.TimeoutError:
            print(f"[Bot {bot_name}] fetch_ticker TIMEOUT (15s) — devam ediliyor")
        except Exception as e:
            print(f"[Bot {bot_name}] BAĞLANTI HATASI: {e}")

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
                    await asyncio.sleep(60) # 1 dakikada bir kontrol (Dinamik TP/SL için)
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

    async def _execute(self, side: str, price: float, qty: float, stop_loss: float, ai_result: dict):
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
            symbol = self.config["symbol"]
            try:
                await self.exchange.set_leverage(symbol, self.risk.leverage)
                print(f"[Bot {bot_name}] Leverage {self.risk.leverage}x ayarlandı")
            except Exception as e:
                print(f"[Bot {bot_name}] Leverage ayar hatası (devam): {e}")

            # Kontrat boyutu hesabı
            amount = qty
            try:
                market = self.exchange.exchange.market(symbol)
                contract_size = float(market.get("contractSize", 1) or 1)
                exchange_name = getattr(self.exchange, '_exchange_name', '')
                if exchange_name == "mexc" and contract_size > 0:
                    # MEXC: notional = margin * leverage, kontrat = notional / (fiyat * contractSize)
                    params_cfg = self.config.get("params", {})
                    risk_mode = params_cfg.get("risk_mode", "pct")
                    risk_val = self.risk.risk_per_trade
                    margin_usdt = risk_val if risk_val > 1.0 else self.risk.current_balance * risk_val
                    leverage = self.risk.leverage
                    notional = margin_usdt * leverage
                    amount = max(1, int(notional / (price * contract_size)))
                    print(f"[Bot {bot_name}] MEXC Kontrat: margin=${margin_usdt:.2f} × {leverage}x = ${notional:.2f} → {amount} kontrat @ ${price} (contractSize={contract_size})")
                elif contract_size > 0:
                    amount = max(1, int(qty / contract_size))
                    print(f"[Bot {bot_name}] Kontrat: qty={qty} → amount={amount} (contractSize={contract_size})")
            except Exception as e:
                print(f"[Bot {bot_name}] Kontrat hesabı hatası (devam): {e}")

            # TP/SL fiyatları hesapla
            tp_price = round(take_profit, 2) if take_profit else None
            sl_price = round(stop_loss, 2) if stop_loss else None

            print(f"[Bot {bot_name}] İşlem açılıyor: {side} {amount} {symbol} type={order_type} TP={tp_price} SL={sl_price} pos_side={trade.get('pos_side')}")
            try:
                order = await self.exchange.place_order(
                    symbol, side, amount, order_type,
                    price=price if order_type == "limit" else None,
                    tp_price=tp_price, sl_price=sl_price,
                    pos_side=trade.get("pos_side")
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

        # Trailing stop başlat
        params = self.config.get("params", {})
        trail_pct = params.get("trailing_stop_pct", 0)
        if trail_pct > 0:
            self._init_trailing(self.config["symbol"], side, price, trail_pct)

        msg = (
            f"{mode} | {'🟢 LONG' if side == 'buy' else '🔴 SHORT'} | "
            f"{self.config['symbol'].replace('/USDT:USDT', '')} @ ${price:,.2f}\n"
            f"Miktar: {qty} | SL: ${stop_loss:,.2f}"
            + (f" | TP: ${take_profit:,.2f}" if take_profit else "") +
            f"\nAI Güven: %{confidence} | {analysis}"
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

                # PnL: MEXC unrealisedPnl çoğu zaman 0 döner, kendimiz hesaplıyoruz
                unrealized_pnl = float(pos.get("unrealisedPnl", 0) or pos.get("unrealizedPnl", 0) or 0)

                # API'den gelen PnL 0 ise ve fiyat bilgisi varsa kendimiz hesapla
                if unrealized_pnl == 0 and current_price > 0 and entry > 0:
                    position_value = vol * contract_size  # coin cinsinden pozisyon
                    if side == "long":
                        unrealized_pnl = position_value * (current_price - entry)
                    else:
                        unrealized_pnl = position_value * (entry - current_price)

                # Margin = notional / leverage, PnL% = pnl / margin * 100
                margin = notional / leverage if leverage > 0 else notional
                pnl_pct = (unrealized_pnl / margin * 100) if margin else 0

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
                    # Normal TP/SL güncelleme
                    print(f"[Bot] Dinamik TP/SL Güncelleme: {upd['side']} -> SL: {upd.get('sl')}, TP: {upd.get('tp')}")
                    try:
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
    ):
        """Gelen sinyali DB'ye kaydet — işleme girsin girmesin"""
        try:
            async with async_session() as session:
                log = SignalLog(
                    bot_id=self.config["id"],
                    symbol=self.config["symbol"],
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
            if cooldown_until and _dt.utcnow().isoformat() < cooldown_until:
                await self._write_hedge_status(redis, symbol, state, current_price, sd)
                return
            # Cooldown bitti → IDLE
            state = HedgeBotState.IDLE
            sd = {"state": state, "cycle_count": cycle_count}
            await redis.set(state_key, json.dumps(sd))

        # ── IDLE ───────────────────────────────────────────────────────────────
        if state == HedgeBotState.IDLE:
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

            # İşlem miktarı hesapla — Risk & Para sayfasındaki bakiye kullanılır
            # Geriye dönük uyumluluk: eski botlarda position_size_mode varsa onu kullan
            if p.position_size_mode == "fixed_usdt" and p.position_size_usdt > 0:
                total_usdt = p.position_size_usdt
            elif p.position_size_mode == "percentage" and p.position_size_pct < 100:
                total_usdt = self.risk.current_balance * (p.position_size_pct / 100)
            else:
                total_usdt = self.risk.current_balance  # tüm bakiye

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
                # Long + Short + TP/SL hepsi AYNI ANDA (her place_order kendi içinde market order + TP/SL halleder)
                results = await asyncio.gather(
                    self.exchange.place_order(
                        symbol, "buy", long_qty, "market",
                        tp_price=new_levels["long"]["tp"],
                        sl_price=new_levels["long"]["sl"],
                        pos_side="long",
                    ),
                    self.exchange.place_order(
                        symbol, "sell", short_qty, "market",
                        tp_price=new_levels["short"]["tp"],
                        sl_price=new_levels["short"]["sl"],
                        pos_side="short",
                    ),
                    return_exceptions=True,
                )
                long_ok  = not isinstance(results[0], Exception)
                short_ok = not isinstance(results[1], Exception)

                if long_ok:
                    print(f"[HedgeBot {bot_name}] ✓ Long açıldı + TP/SL: {long_qty} kontrat")
                else:
                    print(f"[HedgeBot {bot_name}] ✗ Long hatası: {results[0]}")
                if short_ok:
                    print(f"[HedgeBot {bot_name}] ✓ Short açıldı + TP/SL: {short_qty} kontrat")
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

            await self._alert(
                f"🔀 Hedge Bot Açıldı {'[PAPER] ' if paper else ''}\n"
                f"{symbol} @ {current_price:.4f}  Kaldıraç: {p.leverage}x\n"
                f"📗 Long  TP: {new_levels['long']['tp']}  SL: {new_levels['long']['sl']}\n"
                f"📕 Short TP: {new_levels['short']['tp']}  SL: {new_levels['short']['sl']}\n"
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
                    print(f"[HedgeBot {bot_name}] {closed.upper()} borsa tarafından kapatıldı (TP/SL)")
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

            # Fiyat bazlı TP/SL kontrolü (yedek — borsa henüz tetiklemediyse)
            hits = check_price_levels(current_price, levels, active_sides)

            # Peak güncelle
            if peak_price is None:
                peak_price = current_price
            if "long" in active_sides:
                peak_price = max(peak_price, current_price)
            if "short" in active_sides:
                peak_price = min(peak_price, current_price)
            sd["peak_price"] = peak_price

            winner = loser = None
            if hits["long"]["tp"]:
                winner, loser = "long", "short"
            elif hits["short"]["tp"]:
                winner, loser = "short", "long"
            elif hits["long"]["sl"] and hits["short"]["sl"]:
                print(f"[HedgeBot {bot_name}] ⚠ Her iki SL vuruldu — döngü kapandı")
                await self._alert(f"⛔ Hedge Bot: İki SL — {symbol} döngü bitti")
                sd["state"]          = HedgeBotState.COOLDOWN
                sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                sd["cycle_count"]    = cycle_count + 1
                await redis.set(state_key, json.dumps(sd))
                await self._write_hedge_status(redis, symbol, HedgeBotState.COOLDOWN, current_price, sd)
                return

            if winner:
                print(f"[HedgeBot {bot_name}] ✅ {winner.upper()} TP vurdu!")
                if p.losing_side_mode == "close_both":
                    if not paper:
                        try:
                            positions = await self._get_hedge_positions(symbol)
                            close_tasks = []
                            for side in list(active_sides):
                                pos = next((ps for ps in positions if ps["side"] == side), None)
                                if pos:
                                    close_tasks.append(self.exchange.close_position(symbol, side, pos["size"]))
                            if close_tasks:
                                await asyncio.gather(*close_tasks, return_exceptions=True)
                        except Exception as e:
                            print(f"[HedgeBot {bot_name}] close_both kapatma hatası: {e}")
                    # Trade kayıtlarını kapat
                    await self._close_hedge_trade(bot_id, winner, current_price, "tp")
                    await self._close_hedge_trade(bot_id, loser, current_price, "close_both")
                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    await self._alert(f"✅ Hedge Bot close_both: {winner.upper()} TP — {symbol}")
                else:
                    # Kazanan exchange tarafından otomatik kapandı (TP order); kaybedeni yönet
                    await self._close_hedge_trade(bot_id, winner, current_price, "tp")
                    active_sides.discard(winner)
                    sd["active_sides"] = list(active_sides)
                    sd["losing_side"]  = loser
                    sd["peak_price"]   = current_price
                    sd["state"]        = HedgeBotState.ONE_CLOSED
                    await redis.set(state_key, json.dumps(sd))
                    net_target = p.long_tp_pct - p.short_sl_pct if winner == "long" else p.short_tp_pct - p.long_sl_pct
                    await self._alert(
                        f"✅ Hedge Bot: {winner.upper()} TP!\n"
                        f"{symbol} @ {current_price:.4f}\n"
                        f"{loser.upper()} takip: {p.losing_side_mode}\n"
                        f"Hedef net: +{net_target:.1f}%"
                    )
            else:
                # SL vuruldu — tek taraf kapandı
                if hits["long"]["sl"] and "long" in active_sides:
                    active_sides.discard("long")
                    sd["active_sides"] = list(active_sides)
                    sd["losing_side"]  = "long"
                    sd["state"]        = HedgeBotState.ONE_CLOSED
                    await redis.set(state_key, json.dumps(sd))
                elif hits["short"]["sl"] and "short" in active_sides:
                    active_sides.discard("short")
                    sd["active_sides"] = list(active_sides)
                    sd["losing_side"]  = "short"
                    sd["state"]        = HedgeBotState.ONE_CLOSED
                    await redis.set(state_key, json.dumps(sd))
                else:
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

                leverage = trade.leverage_used or 1
                trade.pnl = round(trade.pnl_pct * leverage * trade.quantity * trade.entry_price / 100, 4)

                # Süre hesapla
                if trade.opened_at:
                    delta = datetime.utcnow() - trade.opened_at.replace(tzinfo=None)
                    trade.duration_minutes = int(delta.total_seconds() / 60)

                await session.commit()
                print(f"[HedgeBot {self.config['name']}] Trade kapatıldı: #{trade.id} {side} → {exit_reason} PnL={trade.pnl_pct:.2f}% ${trade.pnl:.4f}")
        except Exception as e:
            print(f"[HedgeBot {self.config['name']}] Trade kapanış kayıt hatası: {e}")

    def stop(self):
        self.running = False
        self._trailing.clear()
        print(f"[Bot {self.config['name']}] Durduruldu.")
