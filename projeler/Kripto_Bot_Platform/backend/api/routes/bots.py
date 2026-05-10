"""
Bot Yönetimi API — PostgreSQL Persistent
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
from bot.engine import BotEngine
from exchange.bitget_client import bitget
from exchange.exchange_factory import create_exchange_client, SUPPORTED_EXCHANGES
from core.redis_client import get_redis
from core.database import async_session
from models.trade import Bot, BotStatus
from sqlalchemy import select, update, delete

class _ExClient:
    """CCXT exchange'i BotEngine interface'ine saran wrapper."""
    def __init__(self, ex, exchange_name: str = "", margin_type: str = "isolated"):
        self.exchange = ex
        self._exchange_name = exchange_name.lower()
        self._margin_type = margin_type.lower()   # "isolated" | "cross"
        self._leverage_cache: dict = {}  # symbol → leverage

    @property
    def _open_type(self) -> int:
        """MEXC openType: 1=isolated, 2=cross"""
        return 1 if self._margin_type == "isolated" else 2

    async def set_leverage(self, symbol, leverage):
        self._leverage_cache[symbol] = leverage
        try:
            if self._exchange_name == "mexc":
                # MEXC: openType=1/2 (isolated/cross), positionType=1 (long) ve 2 (short)
                await self.exchange.set_leverage(leverage, symbol, params={"openType": self._open_type, "positionType": 1})
                await self.exchange.set_leverage(leverage, symbol, params={"openType": self._open_type, "positionType": 2})
            else:
                await self.exchange.set_leverage(leverage, symbol)
        except Exception as e:
            print(f"[ExClient] set_leverage uyarısı ({self._exchange_name}): {e}")

    async def _mexc_place_order_direct(self, symbol, side, amount, leverage, tp_price=None, sl_price=None, entry_price=None):
        """
        MEXC futures: market order aç, sonra planorder/place ile TP/SL trigger order koy.
        CCXT MEXC create_order'da takeProfitPrice/stopLossPrice desteklenmiyor.
        side: "buy"=open long, "sell"=open short
        """
        # ETH/USDT:USDT → ETH_USDT
        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        is_long = side.lower() == "buy"
        mexc_side = 1 if is_long else 3  # 1=open long, 3=open short
        close_side = 2 if is_long else 4  # 2=close long, 4=close short

        # 1. Market order aç (TP/SL olmadan)
        order_body = {
            "symbol": mexc_symbol,
            "price": 0,
            "vol": int(amount),
            "leverage": int(leverage),
            "side": mexc_side,
            "type": 5,                  # market order
            "openType": self._open_type, # isolated=1, cross=2
        }
        print(f"[ExClient] MEXC market order ({self._margin_type}): {order_body}")
        resp = await self.exchange.contractPrivatePostOrderSubmit(order_body)
        print(f"[ExClient] MEXC order response: {resp}")
        order_id = str(resp.get("data", resp.get("orderId", "")))

        # 2. TP trigger order (triggerType=1: fiyat >= triggerPrice olunca market'e sat)
        if tp_price:
            tp_body = {
                "symbol": mexc_symbol,
                "vol": int(amount),
                "leverage": int(leverage),
                "side": close_side,
                "openType": self._open_type,
                "triggerPrice": round(float(tp_price), 2),
                "triggerType": 1 if is_long else 2,  # long TP: >= tp_price; short TP: <= tp_price
                "executeCycle": 2,   # 7 gün geçerli
                "orderType": 5,      # trigger tetiklenince market order
                "trend": 1,          # latest price
            }
            try:
                tp_resp = await self.exchange.contractPrivatePostPlanorderPlace(tp_body)
                print(f"[ExClient] MEXC TP planorder: {tp_resp}")
            except Exception as e:
                print(f"[ExClient] MEXC TP planorder hatası: {e}")

        # 3. SL trigger order (triggerType=2: fiyat <= triggerPrice olunca market'e sat)
        if sl_price:
            sl_body = {
                "symbol": mexc_symbol,
                "vol": int(amount),
                "leverage": int(leverage),
                "side": close_side,
                "openType": self._open_type,
                "triggerPrice": round(float(sl_price), 2),
                "triggerType": 2 if is_long else 1,  # long SL: <= sl_price; short SL: >= sl_price
                "executeCycle": 2,
                "orderType": 5,
                "trend": 1,
            }
            try:
                sl_resp = await self.exchange.contractPrivatePostPlanorderPlace(sl_body)
                print(f"[ExClient] MEXC SL planorder: {sl_resp}")
            except Exception as e:
                print(f"[ExClient] MEXC SL planorder hatası: {e}")

        return {"id": order_id, "status": "open", "info": resp}

    async def place_order(self, symbol, side, amount, order_type="market", price=None,
                          tp_price=None, sl_price=None, pos_side=None):
        if self._exchange_name == "mexc":
            leverage = self._leverage_cache.get(symbol, 10)
            return await self._mexc_place_order_direct(symbol, side, amount, leverage, tp_price, sl_price, entry_price=price)

        params = self._build_order_params(tp_price, sl_price, pos_side)
        try:
            if order_type == "market":
                return await self.exchange.create_market_order(symbol, side, amount, params=params)
            return await self.exchange.create_limit_order(symbol, side, amount, price, params=params)
        except Exception as e:
            # TP/SL params yüzünden hata aldıysak plain order ile yeniden dene
            if (tp_price or sl_price) and ("parameter" in str(e).lower() or "invalid" in str(e).lower() or "stop" in str(e).lower()):
                print(f"[ExClient] TP/SL parametreli order başarısız ({e}) — plain order ile tekrar deneniyor")
                plain_params = {}
                if pos_side:
                    plain_params = self._build_order_params(None, None, pos_side)
                if order_type == "market":
                    return await self.exchange.create_market_order(symbol, side, amount, params=plain_params)
                return await self.exchange.create_limit_order(symbol, side, amount, price, params=plain_params)
            raise

    def _build_order_params(self, tp_price, sl_price, pos_side) -> dict:
        """Borsaya göre doğru order parametre formatı (MEXC hariç — o direkt API kullanır)."""
        params = {}
        if pos_side:
            if self._exchange_name in ("binance", "bybit"):
                params["positionSide"] = pos_side.upper()
            else:
                params["posSide"] = pos_side  # Bitget
        if tp_price:
            params["takeProfitPrice"] = tp_price
        if sl_price:
            params["stopLossPrice"] = sl_price
        return params

    async def modify_position_tpsl(self, symbol, tp_price=None, sl_price=None, pos_side=None):
        params = {}
        if pos_side:
            if self._exchange_name == "mexc":
                params["positionSide"] = pos_side.upper()
            elif self._exchange_name in ("binance", "bybit"):
                params["positionSide"] = pos_side.upper()
            else:
                params["posSide"] = pos_side
        try:
            await self.exchange.set_position_mode(True, symbol)
        except Exception:
            pass
        close_side = "sell" if pos_side != "short" else "buy"
        if tp_price:
            await self.exchange.create_order(symbol, "TAKE_PROFIT_MARKET", close_side,
                                              0, None, {"stopPrice": tp_price, "closePosition": True, **params})
        if sl_price:
            await self.exchange.create_order(symbol, "STOP_MARKET", close_side,
                                             0, None, {"stopPrice": sl_price, "closePosition": True, **params})

    async def get_funding_rate(self, symbol):
        t = await self.exchange.fetch_ticker(symbol)
        return float(t.get("info", {}).get("fundingRate", 0))

    async def get_ohlcv(self, symbol, tf="1m", limit=200):
        return await self.exchange.fetch_ohlcv(symbol, tf, limit=limit)

    async def close(self):
        await self.exchange.close()


async def _get_exchange_client(exchange: str, margin_type: str = "isolated"):
    """Redis'teki kullanıcı API key'leri ile doğru exchange client oluşturur."""
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:default:{exchange}")
    if raw:
        keys = json.loads(raw)
        ex = create_exchange_client(
            exchange,
            keys["api_key"], keys["secret"], keys.get("passphrase", "")
        )
        return _ExClient(ex, exchange_name=exchange, margin_type=margin_type)
    # Redis'te key yoksa bitget için module singleton, diğerleri için hata
    if exchange == "bitget":
        return bitget
    raise HTTPException(400, f"{exchange} için API key bulunamadı. Önce Borsa Ayarları'ndan key girin.")

router = APIRouter(prefix="/bots", tags=["bots"])

# Çalışan bot instance'ları (memory — sadece aktif engine'ler)
_running_bots: dict[int, BotEngine] = {}
_bot_tasks: dict[int, asyncio.Task] = {}


class BotCreate(BaseModel):
    name: str
    symbol: str = "BTC/USDT:USDT"
    strategy: str = "ema_cross"
    exchange: str = "bitget"
    paper_mode: bool = True
    leverage: int = 3
    risk_per_trade: float = 0.01
    max_daily_loss: float = 0.05
    initial_balance: float = 1000.0
    params: Optional[dict] = None
    strategy_params: Optional[dict] = None  # frontend alias, params yoksa kullanılır
    tp_pct: Optional[float] = None
    sl_pct: Optional[float] = None
    trailing_sl: Optional[bool] = None
    order_type: Optional[str] = "market"  # "market" veya "limit"


@router.get("")
async def list_bots():
    try:
        async with async_session() as session:
            result = await session.execute(select(Bot).order_by(Bot.id.desc()))
            bots = result.scalars().all()
            return [
                {
                    "id": b.id,
                    "name": b.name,
                    "symbol": b.symbol,
                    "strategy": b.strategy,
                    "exchange": b.exchange,
                    "status": b.status.value if b.status else "stopped",
                    "paper_mode": b.paper_mode,
                    "leverage": b.leverage,
                    "risk_per_trade": b.risk_per_trade,
                    "max_daily_loss": b.max_daily_loss,
                    "initial_balance": b.initial_balance or 1000.0,
                    "params": json.loads(b.params) if b.params else None,
                    "running": b.id in _running_bots,
                    "created_at": b.created_at.isoformat() if b.created_at else None,
                }
                for b in bots
            ]
    except Exception as e:
        print(f"[List Bots Error] {e}")
        return []


@router.post("")
async def create_bot(data: BotCreate):
    try:
        async with async_session() as session:
            # params (margin_type gibi bot ayarları) + strategy_params (strateji özel) merge
            effective_params = {**(data.strategy_params or {}), **(data.params or {})}
            if data.tp_pct is not None:
                effective_params["tp_pct"] = data.tp_pct
            if data.sl_pct is not None:
                effective_params["sl_pct"] = data.sl_pct
            if data.trailing_sl is not None:
                effective_params["trailing_sl"] = data.trailing_sl
            if data.order_type:
                effective_params["order_type"] = data.order_type

            # Strateji normalizasyonu:
            # tradingview_webhook engine için custom_signal olarak saklanir,
            # params içinde strateji tipi korunur.
            strategy = data.strategy
            if strategy == "tradingview_webhook":
                # webhook_token'u params'a ekle (signal_source'dan al)
                token = effective_params.get("webhook_token") or effective_params.get("signal_source", "")
                if token and not token.startswith("builtin") and not token.startswith("custom__"):
                    effective_params["webhook_token"] = token
                effective_params["_strategy_display"] = "tradingview_webhook"
                # Engine tradingview_webhook + custom_signal ikisini de yakalar

            bot = Bot(
                name=data.name,
                symbol=data.symbol,
                strategy=strategy,
                exchange=data.exchange,
                status=BotStatus.STOPPED,
                paper_mode=data.paper_mode,
                leverage=data.leverage,
                risk_per_trade=data.risk_per_trade,
                max_daily_loss=data.max_daily_loss,
                initial_balance=data.initial_balance,
                params=json.dumps(effective_params) if effective_params else None,
            )
            session.add(bot)
            await session.commit()
            await session.refresh(bot)
            print(f"[Bot Created] ID:{bot.id} Name:{data.name} Strategy:{strategy} Params:{effective_params}")
            return {
                "id": bot.id,
                "name": bot.name,
                "symbol": bot.symbol,
                "strategy": bot.strategy,
                "exchange": bot.exchange,
                "paper_mode": bot.paper_mode,
                "leverage": bot.leverage,
                "risk_per_trade": bot.risk_per_trade,
                "max_daily_loss": bot.max_daily_loss,
                "initial_balance": bot.initial_balance,
                "params": effective_params,
                "running": False,
            }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[Bot Create Error] Exception: {str(e)}")
        print(f"[Bot Create Error] Traceback: {error_trace}")
        
        # Validation errors or database constraint violations
        if "integrity error" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(status_code=400, detail=f"Kayıt hatası: Bot ismi veya parametreleri geçersiz. ({str(e)})")
            
        raise HTTPException(
            status_code=503, 
            detail={
                "message": "Veritabanı veya Sunucu Hatası",
                "error": str(e),
                "type": type(e).__name__
            }
        )


@router.post("/{bot_id}/start")
async def start_bot(bot_id: int):
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")
        if bot_id in _running_bots:
            raise HTTPException(400, "Bot zaten calisiyor")

        config = {
            "id": bot.id,
            "name": bot.name,
            "symbol": bot.symbol,
            "strategy": bot.strategy,
            "paper_mode": bot.paper_mode,
            "leverage": bot.leverage,
            "risk_per_trade": bot.risk_per_trade,
            "max_daily_loss": bot.max_daily_loss,
            "initial_balance": bot.initial_balance or 1000.0,
            "params": json.loads(bot.params) if bot.params else {},
        }

        margin_type = config["params"].get("margin_type", "isolated")
        exchange_client = await _get_exchange_client(bot.exchange or "bitget", margin_type=margin_type)
        engine = BotEngine(config, exchange_client)
        _running_bots[bot_id] = engine

        async def _safe_run(eng, bid):
            try:
                await eng.run()
            except Exception as e:
                import traceback
                print(f"[Bot #{bid}] ENGINE ÇÖKTÜ: {e}")
                traceback.print_exc()

        task = asyncio.create_task(_safe_run(engine, bot_id))
        _bot_tasks[bot_id] = task

        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.RUNNING)
        )
        await session.commit()

    return {"status": "started", "bot_id": bot_id}


@router.get("/{bot_id}/debug")
async def debug_bot(bot_id: int):
    """Engine durumu + Redis + Exchange bağlantı testi."""
    from core.redis_client import get_redis
    result = {
        "bot_id": bot_id,
        "in_running_bots": bot_id in _running_bots,
        "task_alive": False,
        "task_exception": None,
        "redis_ok": False,
        "redis_signal": None,
        "redis_status": None,
        "redis_last_error": None,
        "exchange_ok": False,
        "exchange_ticker": None,
        "bot_config": None,
    }

    # Task durumu
    if bot_id in _bot_tasks:
        task = _bot_tasks[bot_id]
        result["task_alive"] = not task.done()
        if task.done() and task.exception():
            result["task_exception"] = str(task.exception())

    # Bot config
    async with async_session() as session:
        bot_result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = bot_result.scalar_one_or_none()
    if bot:
        params = json.loads(bot.params) if bot.params else {}
        result["bot_config"] = {
            "name": bot.name,
            "symbol": bot.symbol,
            "strategy": bot.strategy,
            "exchange": bot.exchange,
            "paper_mode": bot.paper_mode,
            "leverage": bot.leverage,
            "params": params,
        }

        # Redis testi
        try:
            redis = get_redis()
            await redis.ping()
            result["redis_ok"] = True

            # Signal key'inde veri var mı?
            sym_key = f"custom_signal:{bot.symbol.replace('/', '_').replace(':', '_')}"
            raw_sig = await redis.get(sym_key)
            result["redis_signal"] = json.loads(raw_sig) if raw_sig else None

            # Token bazlı sinyal
            token = params.get("webhook_token") or params.get("signal_source", "")
            if token:
                tv_raw = await redis.get(f"tv_webhook:{token}")
                result["redis_tv_signal"] = json.loads(tv_raw) if tv_raw else None

            # Status
            status_raw = await redis.get(f"bot:{bot_id}:status")
            result["redis_status"] = json.loads(status_raw) if status_raw else None

            # Son hata
            err_raw = await redis.get(f"bot:{bot_id}:last_error")
            result["redis_last_error"] = err_raw.decode() if err_raw and isinstance(err_raw, bytes) else (str(err_raw) if err_raw else None)

            # Signal history count
            hist_key = f"custom_signal_history:{bot.symbol.replace('/', '_').replace(':', '_')}"
            hist_len = await redis.llen(hist_key)
            result["signal_history_count"] = hist_len
        except Exception as e:
            result["redis_error"] = str(e)

        # Exchange testi
        try:
            ex_client = await _get_exchange_client(bot.exchange or "bitget")
            await ex_client.exchange.load_markets()
            ticker = await ex_client.exchange.fetch_ticker(bot.symbol)
            result["exchange_ok"] = True
            result["exchange_ticker"] = float(ticker.get("last", 0))
            await ex_client.close()
        except Exception as e:
            result["exchange_error"] = str(e)

    return result


@router.get("/{bot_id}/test-cycle")
async def test_cycle(bot_id: int):
    """Tek bir sinyal cycle'ını çalıştırıp sonucu döndür (debug)."""
    from core.redis_client import get_redis
    import traceback as tb
    steps = []

    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Bot bulunamadı")

    params = json.loads(bot.params) if bot.params else {}
    steps.append(f"1. Bot: {bot.name} | symbol={bot.symbol} | strategy={bot.strategy}")
    steps.append(f"   Params: {params}")

    # Exchange client oluştur
    try:
        ex_client = await _get_exchange_client(bot.exchange or "bitget")
        steps.append("2. Exchange client oluşturuldu ✓")
    except Exception as e:
        steps.append(f"2. Exchange client HATASI: {e}")
        return {"steps": steps}

    # load_markets
    try:
        await asyncio.wait_for(ex_client.exchange.load_markets(), timeout=30)
        steps.append(f"3. load_markets OK — {len(ex_client.exchange.markets)} market")
    except Exception as e:
        steps.append(f"3. load_markets HATASI: {e}")

    # fetch_ticker
    try:
        ticker = await asyncio.wait_for(ex_client.exchange.fetch_ticker(bot.symbol), timeout=15)
        cur_price = float(ticker.get("last", 0))
        steps.append(f"4. fetch_ticker OK — price={cur_price}")
    except Exception as e:
        steps.append(f"4. fetch_ticker HATASI: {e}")
        cur_price = 0

    # Redis sinyal kontrol
    try:
        redis = get_redis()
        sym_key = f"custom_signal:{bot.symbol.replace('/', '_').replace(':', '_')}"
        raw = await redis.get(sym_key)
        if raw:
            sig = json.loads(raw)
            steps.append(f"5. Redis sinyal BULUNDU: type={sig.get('type')} price={sig.get('price')} ts={sig.get('ts')}")
        else:
            steps.append("5. Redis'te aktif sinyal YOK (custom_signal key boş)")

        # TV webhook token kontrolü
        token = params.get("webhook_token") or params.get("signal_source", "")
        if token:
            tv_raw = await redis.get(f"tv_webhook:{token}")
            if tv_raw:
                tv_sig = json.loads(tv_raw)
                steps.append(f"   TV webhook sinyal: type={tv_sig.get('type')} ts={tv_sig.get('ts')}")
            else:
                steps.append(f"   TV webhook sinyal YOK (token={token[:8]}...)")
    except Exception as e:
        steps.append(f"5. Redis HATASI: {e}")

    # fetch_positions
    try:
        positions = await asyncio.wait_for(ex_client.exchange.fetch_positions([bot.symbol]), timeout=15)
        open_pos = [p for p in positions if float(p.get("contracts", 0)) != 0]
        if open_pos:
            p = open_pos[0]
            steps.append(f"6. Açık pozisyon: side={p['side']} contracts={p['contracts']} entry={p.get('entryPrice')}")
        else:
            steps.append("6. Açık pozisyon YOK")
    except Exception as e:
        steps.append(f"6. fetch_positions HATASI: {e}")

    # Engine durumu
    if bot_id in _running_bots:
        engine = _running_bots[bot_id]
        steps.append(f"7. Engine: running={engine.running} paper_trades={len(engine.paper_trades)} signal_history={len(engine.signal_history)}")
    else:
        steps.append("7. Engine: NOT in _running_bots")

    try:
        await ex_client.close()
    except Exception:
        pass

    return {"bot_id": bot_id, "steps": steps}


class TestOrderRequest(BaseModel):
    exchange: str = "mexc"
    symbol: str = "ETH/USDT:USDT"
    side: str = "buy"
    size_usdt: float = 10.0
    leverage: int = 10
    tp_pct: float = 20.0
    sl_pct: float = 20.0

@router.post("/test-order")
async def test_order(data: TestOrderRequest):
    """
    Gerçek test işlemi aç.
    Body: {exchange, symbol, side, size_usdt, leverage, tp_pct, sl_pct}
    Örnek: {exchange:"mexc", symbol:"ETH/USDT:USDT", side:"buy",
             size_usdt:10, leverage:10, tp_pct:20, sl_pct:20}
    """
    exchange  = data.exchange
    symbol    = data.symbol
    side      = data.side        # "buy" (long) | "sell" (short)
    size_usdt = data.size_usdt   # marjin miktarı (USDT)
    leverage  = data.leverage
    tp_pct    = data.tp_pct
    sl_pct    = data.sl_pct

    steps = []
    ex_client = None
    try:
        ex_client = await _get_exchange_client(exchange)
        steps.append(f"✓ Exchange client: {exchange}")

        # Market yükle
        await asyncio.wait_for(ex_client.exchange.load_markets(), timeout=30)
        steps.append(f"✓ Markets yüklendi")

        # Güncel fiyat
        ticker = await asyncio.wait_for(ex_client.exchange.fetch_ticker(symbol), timeout=15)
        price = float(ticker["last"])
        steps.append(f"✓ Fiyat: {price} ({symbol})")

        # Leverage ayarla
        try:
            await ex_client.set_leverage(symbol, leverage)
            steps.append(f"✓ Leverage: {leverage}x")
        except Exception as e:
            steps.append(f"⚠ Leverage hatası (devam): {e}")

        # Notional = size_usdt * leverage → coin miktarı
        notional = size_usdt * leverage
        qty_raw = notional / price

        # Kontrat boyutu
        contract_size = 1.0
        try:
            market = ex_client.exchange.market(symbol)
            contract_size = float(market.get("contractSize", 1) or 1)
            steps.append(f"✓ contractSize={contract_size}")
        except Exception as e:
            steps.append(f"⚠ contractSize alınamadı (1 kullanılıyor): {e}")

        amount = max(1, int(qty_raw / contract_size))
        steps.append(f"✓ Miktar: qty={qty_raw:.4f} → {amount} kontrat (notional≈${notional:.1f})")

        # TP/SL fiyatları
        if side == "buy":
            tp_price = round(price * (1 + tp_pct / 100), 4)
            sl_price = round(price * (1 - sl_pct / 100), 4)
        else:
            tp_price = round(price * (1 - tp_pct / 100), 4)
            sl_price = round(price * (1 + sl_pct / 100), 4)
        steps.append(f"✓ TP={tp_price} SL={sl_price} (%{tp_pct}/%{sl_pct})")

        # Order aç
        steps.append(f"→ Order açılıyor: {side.upper()} {amount} {symbol} @ market (entry_price={price})")
        order = await ex_client.place_order(
            symbol, side, amount, "market", price=price,
            tp_price=tp_price, sl_price=sl_price,
        )
        order_id = order.get("id", "N/A")
        order_status = order.get("status", "?")
        steps.append(f"✅ ORDER BAŞARILI! id={order_id} status={order_status}")
        steps.append(f"[debug] exchange_name={ex_client._exchange_name} order_keys={list((order or {}).keys())}")

        return {
            "success": True,
            "order_id": order_id,
            "order_status": order_status,
            "details": {
                "exchange": exchange, "symbol": symbol, "side": side,
                "amount_contracts": amount, "entry_price": price,
                "notional_usdt": notional, "margin_usdt": size_usdt,
                "leverage": leverage, "tp_price": tp_price, "sl_price": sl_price,
            },
            "steps": steps,
            "raw_order": {k: str(v) for k, v in (order or {}).items()},
        }

    except Exception as e:
        import traceback
        steps.append(f"✗ HATA: {e}")
        return {
            "success": False,
            "error": str(e),
            "steps": steps,
            "traceback": traceback.format_exc()[-800:],
        }
    finally:
        if ex_client:
            try:
                await ex_client.close()
            except Exception:
                pass


@router.get("/{bot_id}/position")
async def get_bot_position(bot_id: int):
    """Borsadan canlı pozisyon ve fiyat bilgisi döndürür (engine'den bağımsız)."""
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Bot bulunamadı")

    ex_client = None
    try:
        ex_client = await _get_exchange_client(bot.exchange or "bitget")
        await asyncio.wait_for(ex_client.exchange.load_markets(), timeout=15)

        # Fiyat
        cur_price = 0
        try:
            ticker = await asyncio.wait_for(ex_client.exchange.fetch_ticker(bot.symbol), timeout=10)
            cur_price = float(ticker.get("last", 0))
        except Exception as e:
            print(f"[Position API] fetch_ticker hatası: {e}")

        # Pozisyon
        pos_data = None
        try:
            positions = await asyncio.wait_for(ex_client.exchange.fetch_positions([bot.symbol]), timeout=10)
            open_pos = [p for p in positions if float(p.get("contracts", 0) or 0) != 0]

            if open_pos:
                p = open_pos[0]
                entry = float(p.get("entryPrice", 0) or 0)
                contracts = float(p.get("contracts", 0) or 0)
                notional = float(p.get("notional", 0) or 0) or (contracts * entry)
                side = p.get("side", "long")
                leverage = float(p.get("leverage", 1) or 1)
                unrealized_pnl = float(p.get("unrealizedPnl", 0) or 0)
                # PnL yüzde hesapla
                if notional and leverage:
                    margin = notional / leverage
                    pnl_pct = (unrealized_pnl / margin * 100) if margin else 0
                else:
                    pnl_pct = 0

                pos_data = {
                    "side": side,
                    "size": contracts,
                    "entry_price": entry,
                    "notional": notional,
                    "pnl_usdt": round(unrealized_pnl, 4),
                    "pnl_pct": round(pnl_pct, 2),
                    "leverage": leverage,
                }
        except Exception as e:
            print(f"[Position API] fetch_positions hatası: {e}")

        return {"price": cur_price, "position": pos_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Pozisyon bilgisi alınamadı: {e}")
    finally:
        if ex_client:
            try:
                await ex_client.close()
            except Exception:
                pass


@router.get("/{bot_id}/restart")
async def restart_bot(bot_id: int):
    """Botu durdur ve yeniden başlat (GET — browser'dan çağrılabilir)."""
    # Durdur
    if bot_id in _running_bots:
        _running_bots[bot_id].stop()
        _bot_tasks[bot_id].cancel()
        del _running_bots[bot_id]
        del _bot_tasks[bot_id]

    # DB'den bot bilgisi al
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Bot bulunamadı")

    # Yeniden başlat
    config = {
        "id": bot.id,
        "name": bot.name,
        "symbol": bot.symbol,
        "strategy": bot.strategy,
        "paper_mode": bot.paper_mode,
        "leverage": bot.leverage,
        "risk_per_trade": bot.risk_per_trade,
        "max_daily_loss": bot.max_daily_loss,
        "initial_balance": bot.initial_balance or 1000.0,
        "params": json.loads(bot.params) if bot.params else {},
    }

    margin_type = config["params"].get("margin_type", "isolated")
    exchange_client = await _get_exchange_client(bot.exchange or "bitget", margin_type=margin_type)
    engine = BotEngine(config, exchange_client)
    _running_bots[bot_id] = engine

    async def _safe_run(eng, bid):
        try:
            await eng.run()
        except Exception as e:
            import traceback
            print(f"[Bot #{bid}] ENGINE ÇÖKTÜ: {e}")
            traceback.print_exc()

    task = asyncio.create_task(_safe_run(engine, bot_id))
    _bot_tasks[bot_id] = task

    async with async_session() as session:
        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.RUNNING)
        )
        await session.commit()

    return {"status": "restarted", "bot_id": bot_id, "name": bot.name}


@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: int):
    if bot_id not in _running_bots:
        raise HTTPException(400, "Bot çalışmıyor")

    _running_bots[bot_id].stop()
    _bot_tasks[bot_id].cancel()
    del _running_bots[bot_id]
    del _bot_tasks[bot_id]

    async with async_session() as session:
        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(status=BotStatus.STOPPED)
        )
        await session.commit()

    return {"status": "stopped", "bot_id": bot_id}


@router.delete("/{bot_id}")
async def delete_bot(bot_id: int):
    if bot_id in _running_bots:
        _running_bots[bot_id].stop()
        _bot_tasks[bot_id].cancel()
        del _running_bots[bot_id]
        del _bot_tasks[bot_id]

    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")
        await session.execute(delete(Bot).where(Bot.id == bot_id))
        await session.commit()

    return {"status": "deleted", "bot_id": bot_id}


@router.patch("/{bot_id}")
async def update_bot(bot_id: int, data: BotCreate):
    if bot_id in _running_bots:
        raise HTTPException(400, "Calisan botu duzenleyemezsiniz. Once durdurun.")

    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.id == bot_id))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "Bot bulunamadi")

        effective_params = data.params or data.strategy_params or {}
        if data.tp_pct is not None:
            effective_params["tp_pct"] = data.tp_pct
        if data.sl_pct is not None:
            effective_params["sl_pct"] = data.sl_pct
        if data.trailing_sl is not None:
            effective_params["trailing_sl"] = data.trailing_sl
        if data.order_type:
            effective_params["order_type"] = data.order_type

        strategy = data.strategy
        if strategy == "tradingview_webhook":
            token = effective_params.get("webhook_token") or effective_params.get("signal_source", "")
            if token and not token.startswith("builtin") and not token.startswith("custom__"):
                effective_params["webhook_token"] = token
            effective_params["_strategy_display"] = "tradingview_webhook"

        await session.execute(
            update(Bot).where(Bot.id == bot_id).values(
                name=data.name,
                symbol=data.symbol,
                strategy=strategy,
                exchange=data.exchange,
                paper_mode=data.paper_mode,
                leverage=data.leverage,
                risk_per_trade=data.risk_per_trade,
                max_daily_loss=data.max_daily_loss,
                initial_balance=data.initial_balance,
                params=json.dumps(effective_params) if effective_params else None,
            )
        )
        await session.commit()
        print(f"[Bot Updated] ID:{bot_id} Name:{data.name} Strategy:{strategy} Exchange:{data.exchange} Params:{effective_params}")

    return {
        "id": bot_id,
        "name": data.name,
        "symbol": data.symbol,
        "strategy": strategy,
        "exchange": data.exchange,
        "paper_mode": data.paper_mode,
        "leverage": data.leverage,
        "risk_per_trade": data.risk_per_trade,
        "max_daily_loss": data.max_daily_loss,
        "initial_balance": data.initial_balance,
        "params": effective_params,
        "running": bot_id in _running_bots,
    }


@router.get("/{bot_id}/status")
async def bot_status(bot_id: int):
    from core.redis_client import get_redis
    redis = get_redis()
    raw = await redis.get(f"bot:{bot_id}:status")
    data = json.loads(raw) if raw else {"status": "no_data"}
    # Son hatayı da ekle (order hatası vb.)
    err_raw = await redis.get(f"bot:{bot_id}:last_error")
    if err_raw:
        data["last_error"] = err_raw.decode() if isinstance(err_raw, bytes) else str(err_raw)
    return data


# ─── Akıllı Filtreler ────────────────────────────────────────────────────────

class FilterUpdate(BaseModel):
    smart_hours_enabled: Optional[bool] = None
    news_protection_enabled: Optional[bool] = None
    self_learning_enabled: Optional[bool] = None
    trend_filter_enabled: Optional[bool] = None
    volatility_filter_enabled: Optional[bool] = None
    news_blackout_minutes: Optional[int] = None
    min_win_rate_threshold: Optional[float] = None
    max_volatility_atr: Optional[float] = None
    blocked_hours: Optional[str] = None


@router.get("/{bot_id}/filters")
async def get_filters(bot_id: int):
    from models.trade import BotFilter
    async with async_session() as session:
        result = await session.execute(select(BotFilter).where(BotFilter.bot_id == bot_id))
        f = result.scalar_one_or_none()
        if not f:
            return {
                "bot_id": bot_id,
                "smart_hours_enabled": False,
                "news_protection_enabled": False,
                "self_learning_enabled": False,
                "trend_filter_enabled": False,
                "volatility_filter_enabled": False,
                "news_blackout_minutes": 30,
                "min_win_rate_threshold": 0.4,
                "max_volatility_atr": None,
                "blocked_hours": None,
            }
        return {
            "bot_id": f.bot_id,
            "smart_hours_enabled": f.smart_hours_enabled,
            "news_protection_enabled": f.news_protection_enabled,
            "self_learning_enabled": f.self_learning_enabled,
            "trend_filter_enabled": f.trend_filter_enabled,
            "volatility_filter_enabled": f.volatility_filter_enabled,
            "news_blackout_minutes": f.news_blackout_minutes,
            "min_win_rate_threshold": f.min_win_rate_threshold,
            "max_volatility_atr": f.max_volatility_atr,
            "blocked_hours": f.blocked_hours,
        }

@router.post("/{bot_id}/filters")
async def update_filters(bot_id: int, data: FilterUpdate):
    from models.trade import BotFilter
    async with async_session() as session:
        result = await session.execute(select(BotFilter).where(BotFilter.bot_id == bot_id))
        f = result.scalar_one_or_none()
        
        if not f:
            f = BotFilter(bot_id=bot_id)
            session.add(f)
            
        if data.smart_hours_enabled is not None:
            f.smart_hours_enabled = data.smart_hours_enabled
        if data.news_protection_enabled is not None:
            f.news_protection_enabled = data.news_protection_enabled
        if data.self_learning_enabled is not None:
            f.self_learning_enabled = data.self_learning_enabled
        if data.trend_filter_enabled is not None:
            f.trend_filter_enabled = data.trend_filter_enabled
        if data.volatility_filter_enabled is not None:
            f.volatility_filter_enabled = data.volatility_filter_enabled
        if data.news_blackout_minutes is not None:
            f.news_blackout_minutes = data.news_blackout_minutes
        if data.min_win_rate_threshold is not None:
            f.min_win_rate_threshold = data.min_win_rate_threshold
        if data.max_volatility_atr is not None:
            f.max_volatility_atr = data.max_volatility_atr
        if data.blocked_hours is not None:
            f.blocked_hours = data.blocked_hours
            
        await session.commit()
        return {"status": "updated"}


@router.get("/signals/all")
async def get_all_signal_logs(limit: int = 100, action: str = None):
    """Tüm botlardan gelen sinyal logları"""
    from models.trade import SignalLog
    async with async_session() as session:
        query = select(SignalLog).order_by(SignalLog.created_at.desc())
        if action:
            query = query.where(SignalLog.action == action)
        query = query.limit(limit)
        result = await session.execute(query)
        logs = result.scalars().all()
        return [
            {
                "id": l.id,
                "bot_id": l.bot_id,
                "symbol": l.symbol,
                "signal_type": l.signal_type,
                "source": l.source,
                "price": l.price,
                "reason": l.reason,
                "action": l.action,
                "reject_reason": l.reject_reason,
                "confidence": l.confidence,
                "tp_price": l.tp_price,
                "sl_price": l.sl_price,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]


@router.get("/{bot_id}/signals")
async def get_signal_logs(bot_id: int, limit: int = 50, action: str = None):
    """Bot'a gelen tüm sinyallerin logunu döner"""
    from models.trade import SignalLog
    async with async_session() as session:
        query = select(SignalLog).where(SignalLog.bot_id == bot_id).order_by(SignalLog.created_at.desc())
        if action:
            query = query.where(SignalLog.action == action)
        query = query.limit(limit)
        result = await session.execute(query)
        logs = result.scalars().all()
        return [
            {
                "id": l.id,
                "signal_type": l.signal_type,
                "source": l.source,
                "price": l.price,
                "reason": l.reason,
                "action": l.action,
                "reject_reason": l.reject_reason,
                "confidence": l.confidence,
                "tp_price": l.tp_price,
                "sl_price": l.sl_price,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]


@router.get("/{bot_id}/performance")
async def bot_performance(bot_id: int):
    """Bot'un sinyal performansı — TP/SL vuruş oranı, kâr/zarar özeti."""
    from models.trade import SignalLog
    async with async_session() as session:
        result = await session.execute(
            select(SignalLog).where(
                SignalLog.bot_id == bot_id,
                SignalLog.outcome.isnot(None),
            ).order_by(SignalLog.created_at.desc())
        )
        signals = result.scalars().all()

    total = len(signals)
    tp_hits = sum(1 for s in signals if s.outcome == "tp_hit")
    sl_hits = sum(1 for s in signals if s.outcome == "sl_hit")
    still_open = sum(1 for s in signals if s.outcome == "open")
    expired = sum(1 for s in signals if s.outcome == "expired")

    pnl_list = [s.outcome_pnl_pct for s in signals if s.outcome_pnl_pct is not None]
    avg_pnl = sum(pnl_list) / len(pnl_list) if pnl_list else 0
    total_pnl = sum(pnl_list)

    closed = tp_hits + sl_hits
    win_rate = (tp_hits / closed * 100) if closed > 0 else 0

    return {
        "bot_id": bot_id,
        "total_signals": total,
        "open": still_open,
        "tp_hit": tp_hits,
        "sl_hit": sl_hits,
        "expired": expired,
        "win_rate": round(win_rate, 1),
        "avg_pnl_pct": round(avg_pnl, 2),
        "total_pnl_pct": round(total_pnl, 2),
        "last_signals": [
            {
                "id": s.id,
                "signal_type": s.signal_type,
                "price": s.price,
                "tp_price": s.tp_price,
                "sl_price": s.sl_price,
                "outcome": s.outcome,
                "outcome_price": s.outcome_price,
                "outcome_pnl_pct": s.outcome_pnl_pct,
                "outcome_at": s.outcome_at.isoformat() if s.outcome_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in signals[:20]
        ],
    }


@router.patch("/{bot_id}/filters")
async def update_filters(bot_id: int, data: FilterUpdate):
    from models.trade import BotFilter
    async with async_session() as session:
        result = await session.execute(select(BotFilter).where(BotFilter.bot_id == bot_id))
        f = result.scalar_one_or_none()
        if not f:
            f = BotFilter(bot_id=bot_id)
            session.add(f)

        for field, value in data.dict(exclude_none=True).items():
            setattr(f, field, value)

        await session.commit()
        await session.refresh(f)

    return {"status": "ok", "bot_id": bot_id}
