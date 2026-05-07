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
from models.trade import SignalLog
from bot.strategies.rsi_oversold import RSIOversoldStrategy
from bot.strategies.macd_signal import MACDSignalStrategy
from bot.strategies.bollinger_bounce import BollingerBounceStrategy
from bot.strategies.ut_bot import UTBotStrategy
from bot.strategies.supertrend import SupertrendStrategy
from bot.strategies.bb_ema_cross import BBEMACrossStrategy
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
        print(f"[Bot {self.config['name']}] Başlatıldı — {symbol} | Strateji: {strategy}")

        while self.running:
            try:
                if self.risk.killed:
                    await self._alert("🔴 Kill switch aktif — günlük kayıp limitine ulaşıldı.")
                    break

                # ── Grid Bot Stratejisi ───────────────────────────────
                if strategy == "grid_bot":
                    await self._run_grid_cycle(redis, symbol)
                    await asyncio.sleep(10)   # 10sn'de bir fiyat kontrolü
                    continue

                # ── Özel Sinyal + TradingView Webhook Stratejileri ───────
                # Her ikisi de aynı Redis anahtarından (custom_signal:SEMBOL) okur.
                # TradingView webhook geldiğinde signals.py bu anahtara yazar.
                if strategy in ("custom_signal", "tradingview_webhook"):
                    await self._run_custom_signal_cycle(redis, symbol)
                    await asyncio.sleep(30)   # 30sn'de bir kontrol
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
        confidence = ai_result.get("confidence", 0)
        take_profit = ai_result.get("take_profit")
        analysis = ai_result.get("analysis", "")

        trade = {
            "side": side,
            "entry": price,
            "qty": qty,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "confidence": confidence,
            "analysis": analysis,
            "ts": datetime.utcnow().isoformat(),
        }

        if paper:
            self.paper_trades.append(trade)
        else:
            symbol = self.config["symbol"]
            await self.exchange.set_leverage(symbol, self.risk.leverage)

            # Kontrat boyutu hesabı (MEXC swap: tam sayı kontrat)
            amount = qty
            try:
                await self.exchange.exchange.load_markets()
                market = self.exchange.exchange.market(symbol)
                contract_size = market.get("contractSize", 1) or 1
                if contract_size < 1:
                    # MEXC gibi borsalarda kontrat adedi tam sayı olmalı
                    raw_amount = (qty * price) / (price * contract_size)
                    amount = max(1, int(raw_amount))
                    # qty zaten coin cinsinden, kontrata çevir
                    amount = max(1, int(qty / contract_size))
            except Exception as e:
                print(f"[Bot] Kontrat hesabı hatası (devam): {e}")

            # TP/SL fiyatları hesapla
            tp_price = round(take_profit, 2) if take_profit else None
            sl_price = round(stop_loss, 2) if stop_loss else None

            await self.exchange.place_order(
                symbol, side, amount, "market",
                tp_price=tp_price, sl_price=sl_price,
            )

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
                print(f"[Bot] Trailing stop kontrolü hatası: {e}")

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

        # Sinyal olmasa bile fiyat ve status güncelle
        try:
            ticker = await self.exchange.exchange.fetch_ticker(symbol)
            cur_price = float(ticker["last"])
        except Exception:
            cur_price = 0

        if not sig:
            # Sinyal yok ama status güncelle (frontend fiyat görsün)
            if cur_price:
                status_data = {
                    "signal": None,
                    "price": cur_price,
                    "risk": {
                        "balance": self.risk.balance,
                        "daily_pnl": self.risk.daily_pnl,
                        "daily_pnl_pct": self.risk.daily_pnl_pct,
                        "killed": self.risk.killed,
                    },
                    "ts": datetime.utcnow().isoformat(),
                }
                await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))
            return

        # Duplicate sinyal kontroli (aynı ts tekrar işleme)
        last_ts_key = f"bot:{self.config['id']}:last_custom_signal_ts"
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

        if signal_type not in ("buy", "sell"):
            return

        # Bot parametrelerini al
        params = self.config.get("params", {})
        signal_mode = params.get("signal_mode", "normal")
        position_action = params.get("position_action", "close_and_open")
        take_profit_pct = params.get("take_profit_pct", 0)
        stop_loss_pct = params.get("stop_loss_pct", 0)
        trailing_stop_pct = params.get("trailing_stop_pct", 0)
        max_position_hours = params.get("max_position_hours", 0)

        # Sinyal moduna göre yönü belirle
        if signal_mode == "inverse":
            signal_type = "sell" if signal_type == "buy" else "buy"
        elif signal_mode == "buy_only" and signal_type == "sell":
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason="signal_mode=buy_only, sell sinyali filtrelendi")
            return
        elif signal_mode == "sell_only" and signal_type == "buy":
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="filtered", reject_reason="signal_mode=sell_only, buy sinyali filtrelendi")
            return

        print(f"[Bot {self.config['name']}] Özel sinyal: {signal_type} @ {price} — {source}: {reason}")

        # Sinyal geldi — logla
        await self._log_signal(signal_type, price, source=source, reason=reason,
            action="received", raw_payload=json.dumps(sig))

        # Mevcut pozisyon kontrolü
        current_position = await self._get_current_position(symbol)
        
        # Pozisyon yönetimi
        if current_position:
            if position_action == "close_only":
                # Sadece kapat
                if (current_position["side"] == "long" and signal_type == "sell") or \
                   (current_position["side"] == "short" and signal_type == "buy"):
                    await self._close_position(symbol, current_position)
                return
            elif position_action == "reverse":
                # Ters çevir
                await self._close_position(symbol, current_position)
            elif position_action == "add":
                # Hedge - ters yönde pozisyon aç
                pass
            else:  # close_and_open
                # Kapat ve yeni aç (eğer ters yöndeyse)
                if (current_position["side"] == "long" and signal_type == "sell") or \
                   (current_position["side"] == "short" and signal_type == "buy"):
                    await self._close_position(symbol, current_position)
                elif current_position["side"] == ("long" if signal_type == "buy" else "short"):
                    return  # Aynı yönde pozisyon var, işlem yapma

        # TP/SL hesapla
        take_profit = None
        stop_loss = None
        
        if take_profit_pct > 0:
            tp_multiplier = 1 + (take_profit_pct / 100) if signal_type == "buy" else 1 - (take_profit_pct / 100)
            take_profit = price * tp_multiplier
            
        if stop_loss_pct > 0:
            sl_multiplier = 1 - (stop_loss_pct / 100) if signal_type == "buy" else 1 + (stop_loss_pct / 100)
            stop_loss = price * sl_multiplier
        else:
            atr_approx = price * 0.01
            stop_loss = self.risk.atr_stop_loss(price, atr_approx, signal_type)

        qty = self.risk.position_size(price, stop_loss)

        if qty > 0:
            ai_result = {
                "approved": True,
                "confidence": 75,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "analysis": f"{source} — {reason}",
            }
            await self._execute(signal_type, price, qty, stop_loss, ai_result)
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="executed", confidence=75, tp_price=take_profit, sl_price=stop_loss)
        else:
            await self._log_signal(signal_type, price, source=source, reason=reason,
                action="rejected", reject_reason="Pozisyon boyutu 0 (risk manager)")

        # Status'u Redis'e yaz (frontend görebilsin)
        status_data = {
            "signal": signal_type,
            "price": cur_price or price,
            "risk": {
                "balance": self.risk.balance,
                "daily_pnl": self.risk.daily_pnl,
                "daily_pnl_pct": self.risk.daily_pnl_pct,
                "killed": self.risk.killed,
            },
            "ts": datetime.utcnow().isoformat(),
        }
        await redis.set(f"bot:{self.config['id']}:status", json.dumps(status_data))

        await redis.set(last_ts_key, sig.get("ts", ""), ex=600)

    async def _get_current_position(self, symbol: str):
        """Mevcut pozisyonu döndür"""
        try:
            positions = await self.exchange.fetch_positions([symbol])
            for pos in positions:
                if float(pos.get("contracts", 0)) != 0:
                    return {
                        "side": "long" if pos["side"] == "long" else "short",
                        "size": float(pos["contracts"]),
                        "entry": float(pos["entryPrice"]),
                    }
        except:
            pass
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

    def stop(self):
        self.running = False
        self._trailing.clear()
        print(f"[Bot {self.config['name']}] Durduruldu.")
