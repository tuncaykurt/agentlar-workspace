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
from models.trade import SignalLog, BotFilter
from services.economic_calendar import is_news_blackout
from bot.strategies.rsi_oversold import RSIOversoldStrategy
from bot.strategies.macd_signal import MACDSignalStrategy
from bot.strategies.bollinger_bounce import BollingerBounceStrategy
from bot.strategies.ut_bot import UTBotStrategy
from bot.strategies.supertrend import SupertrendStrategy
from bot.strategies.bb_ema_cross import BBEMACrossStrategy
from bot.strategies.dual_hedge import DualHedgeStrategy
import json


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
                    await asyncio.sleep(0.5)
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

            # Kontrat boyutu hesabı (MEXC swap: tam sayı kontrat)
            amount = qty
            try:
                market = self.exchange.exchange.market(symbol)
                contract_size = float(market.get("contractSize", 1) or 1)
                if contract_size and contract_size > 0:
                    amount = max(1, int(qty / contract_size))
                print(f"[Bot {bot_name}] Kontrat: qty={qty} → amount={amount} (contractSize={contract_size})")
            except Exception as e:
                print(f"[Bot {bot_name}] Kontrat hesabı hatası (devam): {e}")

            # TP/SL fiyatları hesapla
            tp_price = round(take_profit, 2) if take_profit else None
            sl_price = round(stop_loss, 2) if stop_loss else None

            print(f"[Bot {bot_name}] İşlem açılıyor: {side} {amount} {symbol} type={order_type} TP={tp_price} SL={sl_price} pos_side={trade.get('pos_side')}")
            order = await self.exchange.place_order(
                symbol, side, amount, order_type,
                price=price if order_type == "limit" else None,
                tp_price=tp_price, sl_price=sl_price,
                pos_side=trade.get("pos_side")
            )
            print(f"[Bot {bot_name}] ✓ İşlem başarılı: order_id={order.get('id', 'N/A')}")

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
                if f.news_protection_enabled:
                    from services.economic_calendar import is_news_blackout
                    blackout = await is_news_blackout(minutes_buffer=f.news_blackout_minutes or 30)
                    if blackout.get("blackout"):
                        r = f"Haber Blackout: {blackout.get('reason','')}"
                        lines.append(f"📰 Haber[✗ ENGEL]: {blackout.get('reason','')}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append("📰 Haber[✓ serbest]")
                else:
                    lines.append("📰 Haber[— kapalı]")

                # 2. Akıllı Saat Filtresi
                if f.smart_hours_enabled and f.blocked_hours:
                    import datetime as _dt
                    try:
                        blocked = json.loads(f.blocked_hours)
                        cur_h = _dt.datetime.utcnow().hour
                        if cur_h in blocked:
                            r = f"Akıllı Saat Filtresi: {cur_h}:00 UTC yasaklı"
                            lines.append(f"🕐 Saat[✗ ENGEL]: {cur_h}:00 UTC yasaklı")
                            if not result["should_block"]:
                                result["should_block"] = True
                                result["reject_reason"] = r
                        else:
                            lines.append(f"🕐 Saat[✓ {cur_h}:00 UTC serbest]")
                    except Exception:
                        lines.append("🕐 Saat[aktif, kontrol hatası]")
                else:
                    lines.append("🕐 Saat[— kapalı]")

                # 3. Öz-Öğrenme
                if f.self_learning_enabled:
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
                        if wr < thr:
                            r = f"Öz-Öğrenme: Win Rate %{wr*100:.1f} < Limit %{thr*100:.1f}"
                            lines.append(f"🧠 Öz-Öğrenme[✗ ENGEL]: {r}")
                            if not result["should_block"]:
                                result["should_block"] = True
                                result["reject_reason"] = r
                        else:
                            lines.append(f"🧠 Öz-Öğrenme[✓ win=%{wr*100:.1f}]")
                    else:
                        lines.append(f"🧠 Öz-Öğrenme[✓ yeterli geçmiş yok ({len(recent)}/10)]")
                else:
                    lines.append("🧠 Öz-Öğrenme[— kapalı]")

                # 4. Volatilite Filtresi
                atr_v = result["indicators"]["volatility_atr"]
                if f.volatility_filter_enabled and f.max_volatility_atr:
                    if atr_v and atr_v > f.max_volatility_atr:
                        r = f"Yüksek Volatilite: ATR {atr_v:.4f} > Limit {f.max_volatility_atr:.4f}"
                        lines.append(f"⚡ Volatilite[✗ ENGEL]: {r}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"⚡ Volatilite[✓ ATR={atr_v or '?'}]")
                else:
                    lines.append("⚡ Volatilite[— kapalı]")

                # 5. Trend Filtresi (EMA200)
                if f.trend_filter_enabled and ema200_val and ema200_val > 0:
                    trend_fail = (signal_type == "buy" and price < ema200_val) or \
                                 (signal_type == "sell" and price > ema200_val)
                    dist_v = result["indicators"]["ema200_dist"] or 0
                    if trend_fail:
                        r = f"Trend Filtresi: dist={dist_v:+.2f}% trend uyumsuz"
                        lines.append(f"📈 Trend[✗ ENGEL]: {r}")
                        if not result["should_block"]:
                            result["should_block"] = True
                            result["reject_reason"] = r
                    else:
                        lines.append(f"📈 Trend[✓ dist={dist_v:+.2f}%]")
                else:
                    lines.append("📈 Trend[— kapalı]")

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
        except Exception as e:
            print(f"[Bot] Sinyal log hatası: {e}")

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
        if sig is None and self.config.get("strategy") == "tradingview_webhook":
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

        # Sinyal varsa güncel fiyatı al
        try:
            ticker = await asyncio.wait_for(self.exchange.exchange.fetch_ticker(symbol), timeout=15)
            cur_price = float(ticker["last"])
        except Exception:
            cur_price = 0

        # Duplicate sinyal kontroli (aynı ts tekrar işleme)
        last_ts_key = f"bot:{bot_id}:last_custom_signal_ts"
        last_ts = await redis.get(last_ts_key)
        sig_ts = sig.get("ts", "")
        if last_ts:
            last_ts_str = last_ts.decode() if isinstance(last_ts, bytes) else str(last_ts)
            if last_ts_str == sig_ts:
                return  # Bu sinyal daha önce işlendi

        signal_type = sig.get("type")   # "buy" | "sell"
        price       = sig.get("price", 0)
        source      = sig.get("source", "Özel İndikatör")
        reason      = sig.get("reason", "")
        # Sinyal zaman dilimi: önce payload'dan, sonra bot parametresinden
        sig_timeframe = sig.get("timeframe") or params.get("signal_timeframe") or "5m"

        print(f"[Bot {bot_name}] ▶ SİNYAL BULUNDU: type={signal_type} price={price} source={source} key={sig_key}")

        if signal_type not in ("buy", "sell"):
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

        # Sinyal moduna göre yönü belirle
        if signal_mode == "inverse":
            signal_type = "sell" if signal_type == "buy" else "buy"
            print(f"[Bot {bot_name}] Inverse mod — sinyal tersine çevrildi: {signal_type}")
        elif signal_mode == "buy_only" and signal_type == "sell":
            print(f"[Bot {bot_name}] ✗ buy_only mod — sell sinyali filtrelendi")
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason="signal_mode=buy_only, sell sinyali filtrelendi",
                timeframe=sig_timeframe)
            await redis.set(last_ts_key, sig_ts, ex=600)
            return
        elif signal_mode == "sell_only" and signal_type == "buy":
            print(f"[Bot {bot_name}] ✗ sell_only mod — buy sinyali filtrelendi")
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason="signal_mode=sell_only, buy sinyali filtrelendi",
                timeframe=sig_timeframe)
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        print(f"[Bot {bot_name}] ✓ Sinyal kabul edildi: {signal_type} @ {price}")

        # Tam filtre analizi (aktif olsun olmasın tüm filtreler çalışır + indikatörler hesaplanır)
        fa = await self._analyze_filters_full(signal_type, price, timeframe=sig_timeframe)
        ind = fa["indicators"]
        analysis_text = fa["analysis"]
        print(f"[Bot {bot_name}] Filtre analizi: {analysis_text}")

        if fa["should_block"]:
            print(f"[Bot {bot_name}] ✗ Aktif filtre engeli: {fa['reject_reason']}")
            await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                action="filtered", reject_reason=fa["reject_reason"],
                rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                timeframe=sig_timeframe)
            await redis.set(last_ts_key, sig_ts, ex=600)
            return

        # Sinyal geldi, filtreler geçildi — logla
        await self._log_signal(signal_type, price, source=source, reason=analysis_text,
            action="received", raw_payload=json.dumps(sig),
            rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
            timeframe=sig_timeframe)

        # Mevcut pozisyon kontrolü
        current_position = await self._get_current_position(symbol)
        print(f"[Bot {bot_name}] Mevcut pozisyon: {current_position}")

        # Pozisyon yönetimi
        if current_position:
            if position_action == "close_only":
                if (current_position["side"] == "long" and signal_type == "sell") or \
                   (current_position["side"] == "short" and signal_type == "buy"):
                    await self._close_position(symbol, current_position)
                await redis.set(last_ts_key, sig_ts, ex=600)
                return
            elif position_action == "reverse":
                await self._close_position(symbol, current_position)
            elif position_action == "add":
                pass
            else:  # close_and_open
                if (current_position["side"] == "long" and signal_type == "sell") or \
                   (current_position["side"] == "short" and signal_type == "buy"):
                    await self._close_position(symbol, current_position)
                elif current_position["side"] == ("long" if signal_type == "buy" else "short"):
                    print(f"[Bot {bot_name}] ✗ Aynı yönde pozisyon var — işlem yapılmıyor")
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
                await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                    action="executed", confidence=75, tp_price=take_profit, sl_price=stop_loss,
                    rsi_14=ind["rsi_14"], volatility_atr=ind["volatility_atr"], ema200_dist=ind["ema200_dist"],
                    timeframe=sig_timeframe)
                print(f"[Bot {bot_name}] ✓ İşlem başarıyla açıldı!")
            except Exception as e:
                print(f"[Bot {bot_name}] ✗ İşlem açma hatası: {e}")
                import traceback
                traceback.print_exc()
                await self._log_signal(signal_type, price, source=source, reason=analysis_text,
                    action="error", reject_reason=f"İşlem hatası: {str(e)[:200]}",
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
        """Mevcut pozisyonu döndür"""
        try:
            positions = await asyncio.wait_for(
                self.exchange.exchange.fetch_positions([symbol]), timeout=15
            )
            for pos in positions:
                if float(pos.get("contracts", 0)) != 0:
                    return {
                        "side": "long" if pos["side"] == "long" else "short",
                        "size": float(pos["contracts"]),
                        "entry": float(pos.get("entryPrice") or 0),
                    }
        except asyncio.TimeoutError:
            print(f"[Bot {self.config['name']}] fetch_positions TIMEOUT (15s)")
        except Exception as e:
            print(f"[Bot {self.config['name']}] fetch_positions hatası: {e}")
        return None

    async def _close_position(self, symbol: str, position: dict):
        """Mevcut pozisyonu kapat"""
        try:
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
        )
        from datetime import datetime as _dt, timedelta as _td

        bot_id   = self.config["id"]
        bot_name = self.config["name"]
        paper    = self.config.get("paper_mode", True)

        p = HedgeBotParams(self.config.get("params", {}))

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

            # Tetikleyici
            should_open = False
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

            qty_base  = self.risk.position_size(current_price, new_levels["long"]["sl"])
            long_qty  = max(1, int(qty_base * p.long_size_ratio * 2))
            short_qty = max(1, int(qty_base * (1 - p.long_size_ratio) * 2))

            if not paper:
                try:
                    await self.exchange.place_order(
                        symbol, "buy", long_qty, "market",
                        tp_price=new_levels["long"]["tp"],
                        sl_price=new_levels["long"]["sl"],
                        pos_side="long",
                    )
                    await self.exchange.place_order(
                        symbol, "sell", short_qty, "market",
                        tp_price=new_levels["short"]["tp"],
                        sl_price=new_levels["short"]["sl"],
                        pos_side="short",
                    )
                except Exception as e:
                    print(f"[HedgeBot {bot_name}] Pozisyon açma hatası: {e}")
                    await self._alert(f"❌ Hedge Bot açma hatası: {e}")
                    return
            else:
                print(f"[HedgeBot {bot_name}] PAPER Long: TP={new_levels['long']['tp']} SL={new_levels['long']['sl']}")
                print(f"[HedgeBot {bot_name}] PAPER Short: TP={new_levels['short']['tp']} SL={new_levels['short']['sl']}")

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

            hits = check_price_levels(current_price, levels, active_sides)

            # Peak güncelle
            if peak_price is None:
                peak_price = current_price
            if "long" in active_sides:
                peak_price = max(peak_price, current_price)
            if "short" in active_sides:
                peak_price = min(peak_price, current_price)
            sd["peak_price"] = peak_price

            # Her iki SL aynı anda vuruldu (çok nadir — fiyat boşluk yaptı)
            if hits["long"]["sl"] and hits["short"]["sl"]:
                print(f"[HedgeBot {bot_name}] ⚠ Her iki SL vuruldu — döngü kapandı")
                await self._alert(f"⛔ Hedge Bot: İki SL — {symbol} döngü bitti")
                sd["state"]          = HedgeBotState.COOLDOWN
                sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                sd["cycle_count"]    = cycle_count + 1
                await redis.set(state_key, json.dumps(sd))
                await self._write_hedge_status(redis, symbol, HedgeBotState.COOLDOWN, current_price, sd)
                return

            winner = loser = None
            if hits["long"]["tp"]:
                winner, loser = "long", "short"
            elif hits["short"]["tp"]:
                winner, loser = "short", "long"

            if winner:
                print(f"[HedgeBot {bot_name}] ✅ {winner.upper()} TP vurdu!")
                if p.losing_side_mode == "close_both":
                    if not paper:
                        for side in list(active_sides):
                            close_s = "sell" if side == "long" else "buy"
                            try:
                                positions = await self._get_hedge_positions(symbol)
                                pos = next((pos for pos in positions if pos["side"] == side), None)
                                if pos:
                                    await self.exchange.place_order(symbol, close_s, pos["size"], "market", pos_side=side)
                            except Exception as e:
                                print(f"[HedgeBot {bot_name}] close_both kapatma hatası: {e}")
                    sd["state"]          = HedgeBotState.COOLDOWN
                    sd["cooldown_until"] = (_dt.utcnow() + _td(seconds=p.reopen_delay_secs)).isoformat()
                    sd["cycle_count"]    = cycle_count + 1
                    await redis.set(state_key, json.dumps(sd))
                    await self._alert(f"✅ Hedge Bot close_both: {winner.upper()} TP — {symbol}")
                else:
                    # Kazanan exchange tarafından otomatik kapandı (TP order); kaybedeni yönet
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

            # Peak güncelle
            if peak_price is None:
                peak_price = current_price
            if losing_side == "long":
                peak_price = max(peak_price, current_price)
            else:
                peak_price = min(peak_price, current_price)
            sd["peak_price"] = peak_price

            if p.losing_side_mode == "sl_only":
                # SL zaten borsada set edildi — sadece izle
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
                            pos = next((pos for pos in positions if pos["side"] == losing_side), None)
                            if pos:
                                close_s = "sell" if losing_side == "long" else "buy"
                                await self.exchange.place_order(symbol, close_s, pos["size"], "market", pos_side=losing_side)
                        except Exception as e:
                            print(f"[HedgeBot {bot_name}] Kaybeden kapatma hatası: {e}")

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

    async def _write_hedge_status(self, redis, symbol: str, state: str, price: float, sd: dict):
        """Hedge bot anlık durumunu Redis'e yaz (frontend okur)."""
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
        }
        await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

    def stop(self):
        self.running = False
        self._trailing.clear()
        print(f"[Bot {self.config['name']}] Durduruldu.")
