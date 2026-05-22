"""
Bot Yönetimi API — PostgreSQL Persistent
"""
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import uuid
from bot.engine import BotEngine
from exchange.bitget_client import bitget
from exchange.exchange_factory import create_exchange_client, SUPPORTED_EXCHANGES
from core.redis_client import get_redis
from core.database import async_session
from core.config import settings
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

    async def get_balance(self) -> dict:
        """Borsa bakiyesini USDT cinsinden döner."""
        from exchange.exchange_factory import SUPPORTED_EXCHANGES
        config = SUPPORTED_EXCHANGES.get(self._exchange_name, {})
        balance_params = config.get("balance_params", {})
        balance = await self.exchange.fetch_balance(balance_params)
        return {
            "total": float(balance["total"].get("USDT", 0) or 0),
            "free": float(balance["free"].get("USDT", 0) or 0),
            "used": float(balance["used"].get("USDT", 0) or 0),
        }

    async def set_leverage(self, symbol, leverage):
        # Zaten aynı leverage + margin_type set edilmişse API çağrısı yapma
        cache_key = f"{symbol}:{leverage}:{self._margin_type}"
        if self._leverage_cache.get(symbol) == cache_key:
            return
        self._leverage_cache[symbol] = cache_key
        try:
            if self._exchange_name == "mexc":
                # MEXC: openType=1/2 (isolated/cross), positionType=1 (long) ve 2 (short)
                # openType hem leverage'da hem order'da gönderilir — margin mode bu şekilde set edilir
                results = await asyncio.gather(
                    self.exchange.set_leverage(leverage, symbol, params={"openType": self._open_type, "positionType": 1}),
                    self.exchange.set_leverage(leverage, symbol, params={"openType": self._open_type, "positionType": 2}),
                    return_exceptions=True
                )
                for i, r in enumerate(results):
                    if isinstance(r, Exception):
                        print(f"[ExClient] set_leverage posType={i+1} uyarısı: {r}")
                print(f"[ExClient] Leverage {leverage}x ({self._margin_type}, openType={self._open_type}) set for {symbol}")
            else:
                await self.exchange.set_leverage(leverage, symbol)
        except Exception as e:
            print(f"[ExClient] set_leverage uyarısı ({self._exchange_name}): {e}")

    async def _mexc_place_order_direct(self, symbol, side, amount, leverage, tp_price=None, sl_price=None, entry_price=None,
                                       trailing_callback_rate=None, trailing_active_price=None,
                                       tp_pct=None, sl_pct=None):
        """
        MEXC futures: market order aç, ardından TP/SL veya Trailing Stop koy.

        trailing_callback_rate > 0 ise:
          - TP koymaz, yerine MEXC native trailing stop (trackorder/place) koyar
          - trailing_active_price = aktivasyon fiyatı (TP hedefi gibi düşün)
          - Fiyat active_price'a ulaşınca trailing başlar, callback_rate% geri çekilirse kapatır
        trailing_callback_rate = 0 veya None ise:
          - Eski davranış: stoporder/place ile TP + SL koyar
        """
        mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
        is_long = side.lower() == "buy"
        mexc_side = 1 if is_long else 3  # 1=open long, 3=open short

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

        use_trailing = trailing_callback_rate and float(trailing_callback_rate) > 0

        # ── Pozisyon ID bul (TP/SL veya Trailing için gerekli) ──
        if tp_price or sl_price or use_trailing:
            target_type = 1 if is_long else 2
            pos_id = None
            pos_vol = int(amount)

            actual_entry = None
            actual_leverage = int(leverage)
            for attempt, wait in enumerate([0.3, 0.7, 1.5], 1):
                await asyncio.sleep(wait)
                try:
                    pos_resp = await self.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol})
                    pos_data = pos_resp.get("data", []) if isinstance(pos_resp, dict) else pos_resp
                    for p in (pos_data or []):
                        if int(p.get("positionType", 0)) == target_type and float(p.get("holdVol", 0)) > 0:
                            pos_id = int(p.get("positionId", 0))
                            pos_vol = int(float(p.get("holdVol", amount)))
                            actual_entry = float(p.get("openAvg", 0) or p.get("openAvgPrice", 0) or p.get("avgPrice", 0) or 0)
                            actual_leverage = int(p.get("leverage", leverage))
                            break
                except Exception as e:
                    print(f"[ExClient] MEXC position query HATA (attempt {attempt}): {e}")
                if pos_id:
                    print(f"[ExClient] MEXC position found: id={pos_id} type={target_type} vol={pos_vol} entry={actual_entry} leverage={actual_leverage} (attempt {attempt})")
                    break

            # ── Gerçek giriş fiyatından TP/SL yeniden hesapla ──
            if pos_id and actual_entry and actual_entry > 0 and tp_pct is not None and sl_pct is not None:
                old_tp, old_sl = tp_price, sl_price
                if is_long:
                    tp_price = round(actual_entry * (1 + float(tp_pct) / 100), 2)
                    sl_price = round(actual_entry * (1 - float(sl_pct) / 100), 2)
                else:
                    tp_price = round(actual_entry * (1 - float(tp_pct) / 100), 2)
                    sl_price = round(actual_entry * (1 + float(sl_pct) / 100), 2)
                if use_trailing:
                    trailing_active_price = tp_price  # Trailing aktivasyon = yeni TP
                print(f"[ExClient] TP/SL gercek giris fiyatindan yeniden hesaplandi: entry={actual_entry} "
                      f"TP {old_tp}->{tp_price} SL {old_sl}->{sl_price}")

            if pos_id:
                # ── SL her zaman stoporder/place ile konur ──
                if sl_price:
                    _sl = round(float(sl_price), 2)
                    sl_body = {
                        "positionId": pos_id,
                        "vol": pos_vol,
                        "profitTrend": 1,
                        "lossTrend": 1,
                        "stopLossType": 0,
                        "takeProfitType": 0,
                        "stopLossOrderPrice": 0,
                        "takeProfitOrderPrice": 0,
                        "stopLossPrice": _sl,
                    }
                    # Trailing kullanılmıyorsa TP'yi de ekle
                    if not use_trailing and tp_price:
                        sl_body["takeProfitPrice"] = round(float(tp_price), 2)

                    target_desc = f"SL={_sl}" + (f" TP={round(float(tp_price), 2)}" if not use_trailing and tp_price else "")
                    print(f"[ExClient] MEXC stoporder/place gönderiliyor: posId={pos_id} {target_desc} vol={pos_vol}")

                    sl_ok = False
                    for tp_attempt in range(1, 3):
                        try:
                            stop_resp = await self.exchange.contractPrivatePostStoporderPlace(sl_body)
                            resp_data = stop_resp if isinstance(stop_resp, dict) else {}
                            success = resp_data.get("success", resp_data.get("code", 0) == 0)
                            print(f"[ExClient] MEXC stoporder/place yanıt (attempt {tp_attempt}): {stop_resp}")
                            if success or resp_data.get("code") == 0:
                                sl_ok = True
                                print(f"[ExClient] ✓ MEXC {target_desc} BAŞARILI")
                                break
                            else:
                                print(f"[ExClient] MEXC stoporder yanıt hatası: {stop_resp}")
                        except Exception as e:
                            print(f"[ExClient] MEXC stoporder/place HATA (attempt {tp_attempt}): {e}")
                        if tp_attempt < 2:
                            await asyncio.sleep(1.5)

                    if not sl_ok:
                        print(f"[ExClient] ⚠ MEXC SL 2 denemede de başarısız! posId={pos_id}")

                # ── Trailing Stop: trackorder/place ile ──
                if use_trailing:
                    trail_side = 4 if is_long else 2  # 4=close long, 2=close short
                    _active = round(float(trailing_active_price), 2) if trailing_active_price else 0
                    _callback = round(float(trailing_callback_rate), 4)

                    trail_body = {
                        "symbol": mexc_symbol,
                        "leverage": actual_leverage,
                        "side": trail_side,
                        "vol": pos_vol,
                        "openType": self._open_type,
                        "trend": 1,              # 1=latest price
                        "activePrice": _active,
                        "backType": 1,           # 1=percentage
                        "backValue": _callback,
                        "positionMode": 1,       # 1=hedge (two-way)
                    }

                    print(f"[ExClient] MEXC trailing order: {trail_body}")

                    trail_ok = False
                    for trail_attempt in range(1, 3):
                        try:
                            trail_resp = await self.exchange.contractPrivatePostTrackorderPlace(trail_body)
                            trail_data = trail_resp if isinstance(trail_resp, dict) else {}
                            trail_success = trail_data.get("success", False) or trail_data.get("code", -1) == 0
                            print(f"[ExClient] MEXC trackorder/place yanıt (attempt {trail_attempt}): {trail_resp}")
                            if trail_success:
                                trail_ok = True
                                trail_id = trail_data.get("data", "")
                                print(f"[ExClient] ✓ MEXC TRAILING BAŞARILI: id={trail_id} active={_active} callback={_callback}%")
                                break
                            else:
                                print(f"[ExClient] MEXC trailing yanıt hatası: {trail_resp}")
                        except Exception as e:
                            print(f"[ExClient] MEXC trackorder/place HATA (attempt {trail_attempt}): {e}")
                        if trail_attempt < 2:
                            await asyncio.sleep(1.5)

                    if not trail_ok:
                        print(f"[ExClient] ⚠ MEXC Trailing 2 denemede de başarısız — TP fallback olarak konuluyor")
                        # Fallback: trailing başarısızsa klasik TP koy
                        if tp_price:
                            fallback_body = {
                                "positionId": pos_id,
                                "vol": pos_vol,
                                "profitTrend": 1,
                                "lossTrend": 1,
                                "stopLossType": 0,
                                "takeProfitType": 0,
                                "stopLossOrderPrice": 0,
                                "takeProfitOrderPrice": 0,
                                "takeProfitPrice": round(float(tp_price), 2),
                            }
                            try:
                                await self.exchange.contractPrivatePostStoporderPlace(fallback_body)
                                print(f"[ExClient] ✓ Fallback TP konuldu: {round(float(tp_price), 2)}")
                            except Exception as e:
                                print(f"[ExClient] ⚠ Fallback TP de başarısız: {e}")

                elif not sl_price and tp_price:
                    # Sadece TP varsa (SL yoksa) — ayrı stoporder ile koy
                    _tp = round(float(tp_price), 2)
                    tp_only_body = {
                        "positionId": pos_id,
                        "vol": pos_vol,
                        "profitTrend": 1,
                        "lossTrend": 1,
                        "stopLossType": 0,
                        "takeProfitType": 0,
                        "stopLossOrderPrice": 0,
                        "takeProfitOrderPrice": 0,
                        "takeProfitPrice": _tp,
                    }
                    try:
                        await self.exchange.contractPrivatePostStoporderPlace(tp_only_body)
                        print(f"[ExClient] ✓ MEXC TP BAŞARILI: {_tp}")
                    except Exception as e:
                        print(f"[ExClient] ⚠ MEXC TP HATASI: {e}")
            else:
                print(f"[ExClient] ⚠ MEXC TP/SL/Trailing ATANAMADI: positionId bulunamadı! (3 deneme sonrası)")

        return {"id": order_id, "status": "open", "info": resp}

    async def close_position(self, symbol, side, amount):
        """Mevcut pozisyonu kapat. side = mevcut pozisyon yönü (long/buy veya short/sell)."""
        if self._exchange_name == "mexc":
            mexc_symbol = symbol.split("/")[0] + "_" + symbol.split("/")[1].split(":")[0]
            # long kapatmak = close long = side 2; short kapatmak = close short = side 4
            is_long = side.lower() in ("long", "buy")
            close_side = 2 if is_long else 4
            body = {
                "symbol": mexc_symbol,
                "price": 0,
                "vol": int(amount),
                "leverage": int(self._leverage_cache.get(symbol, 10)),
                "side": close_side,
                "type": 5,
                "openType": self._open_type,
            }
            print(f"[ExClient] MEXC close position: {body}")
            resp = await self.exchange.contractPrivatePostOrderSubmit(body)
            print(f"[ExClient] MEXC close response: {resp}")
            return {"id": str(resp.get("data", "")), "status": "closed", "info": resp}
        # Diğer borsalar için CCXT standart kapat
        close_side = "sell" if side.lower() in ("long", "buy") else "buy"
        return await self.exchange.create_market_order(symbol, close_side, amount)

    async def place_order(self, symbol, side, amount, order_type="market", price=None,
                          tp_price=None, sl_price=None, pos_side=None,
                          trailing_callback_rate=None, trailing_active_price=None,
                          tp_pct=None, sl_pct=None):
        if self._exchange_name == "mexc":
            leverage = self._leverage_cache.get(symbol, 10)
            return await self._mexc_place_order_direct(
                symbol, side, amount, leverage, tp_price, sl_price, entry_price=price,
                trailing_callback_rate=trailing_callback_rate,
                trailing_active_price=trailing_active_price,
                tp_pct=tp_pct, sl_pct=sl_pct,
            )

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
    # Redis'te key yoksa bitget için module singleton, diğerleri için .env fallback veya hata
    if exchange == "bitget":
        return bitget
    if exchange == "mexc" and settings.MEXC_API_KEY:
        ex = create_exchange_client(exchange, settings.MEXC_API_KEY, settings.MEXC_API_SECRET)
        return _ExClient(ex, exchange_name=exchange, margin_type=margin_type)
    if exchange == "bybit" and settings.BYBIT_API_KEY:
        ex = create_exchange_client(exchange, settings.BYBIT_API_KEY, settings.BYBIT_API_SECRET)
        return _ExClient(ex, exchange_name=exchange, margin_type=margin_type)
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
                if not token or token.startswith("builtin") or token.startswith("custom__"):
                    token = str(uuid.uuid4())
                effective_params["webhook_token"] = token
                effective_params["_strategy_display"] = "tradingview_webhook"
                # Engine tradingview_webhook + custom_signal ikisini de yakalar

            # Hedge bot on_signal modunda webhook_token oluştur
            if strategy in ("hedge_bot", "dual_hedge"):
                trigger = effective_params.get("trigger_mode", "on_start")
                if trigger == "on_signal":
                    token = effective_params.get("webhook_token", "")
                    if not token:
                        token = str(uuid.uuid4())
                    effective_params["webhook_token"] = token

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
    margin_type: str = "cross"
    method: Optional[int] = None  # 1-5 arası, None=hepsi


@router.post("/tpsl-test")
async def test_tpsl_methods(data: TestOrderRequest):
    """Tek tek MEXC TP/SL yöntemi test eder. method=1..5, None=sadece m1."""
    import traceback as _tb
    results = {}
    ex_client = None
    m = data.method if data.method is not None else 1
    try:
        ex_client = await _get_exchange_client(data.exchange, margin_type=data.margin_type)
        await asyncio.wait_for(ex_client.exchange.load_markets(), timeout=30)
        ticker = await asyncio.wait_for(ex_client.exchange.fetch_ticker(data.symbol), timeout=15)
        price = float(ticker["last"])
        test_lev = min(data.leverage, 20)
        await ex_client.set_leverage(data.symbol, test_lev)

        market = ex_client.exchange.market(data.symbol)
        cs = float(market.get("contractSize", 1) or 1)
        amount = max(1, int(data.size_usdt * test_lev / (price * cs)))
        is_long = data.side == "buy"
        tp_price = round(price * (1 + data.tp_pct/100), 2) if is_long else round(price * (1 - data.tp_pct/100), 2)
        sl_price = round(price * (1 - data.sl_pct/100), 2) if is_long else round(price * (1 + data.sl_pct/100), 2)
        ms = data.symbol.split("/")[0] + "_" + data.symbol.split("/")[1].split(":")[0]
        mx_side = 1 if is_long else 3
        ot = 1 if data.margin_type == "isolated" else 2
        close_s = 2 if is_long else 4
        pt = 1 if is_long else 2
        results["setup"] = {"price": price, "tp": tp_price, "sl": sl_price, "amount": amount,
                            "test_leverage": test_lev, "method": m}

        async def open_pos():
            r = await ex_client.exchange.contractPrivatePostOrderSubmit({
                "symbol": ms, "price": 0, "vol": amount, "leverage": test_lev,
                "side": mx_side, "type": 5, "openType": ot})
            return str(r.get("data", ""))

        async def safe_close():
            try:
                # Tüm açık pozisyonları kapat
                resp = await ex_client.exchange.contractPrivateGetPositionOpenPositions({"symbol": ms})
                data_ = resp.get("data", []) if isinstance(resp, dict) else resp
                for p in (data_ or []):
                    vol = float(p.get("holdVol", 0))
                    if vol > 0:
                        cs2 = 2 if int(p.get("positionType", 0)) == 1 else 4
                        await ex_client.exchange.contractPrivatePostOrderSubmit({
                            "symbol": ms, "price": 0, "vol": int(vol),
                            "leverage": test_lev, "side": cs2, "type": 5, "openType": ot})
            except Exception:
                pass
            # Tüm plan emirlerini iptal et
            try:
                await ex_client.exchange.contractPrivatePostPlanorderCancelAll({"symbol": ms})
            except Exception:
                pass

        async def get_pos_id():
            resp = await ex_client.exchange.contractPrivateGetPositionOpenPositions({"symbol": ms})
            data_ = resp.get("data", []) if isinstance(resp, dict) else resp
            for p in (data_ or []):
                if int(p.get("positionType", 0)) == pt and float(p.get("holdVol", 0)) > 0:
                    return int(p.get("positionId", 0)), p
            return None, None

        async def check_tpsl():
            _, p = await get_pos_id()
            if p:
                return {"tp": p.get("takeProfitPrice"), "sl": p.get("stopLossPrice"),
                        "holdVol": p.get("holdVol"), "state": p.get("state")}
            return {"error": "no_position_found"}

        # Önce mevcut pozisyonları temizle
        await safe_close()
        await asyncio.sleep(1)

        if m == 1:
            # Market order body'de TP/SL
            oid = await ex_client.exchange.contractPrivatePostOrderSubmit({
                "symbol": ms, "price": 0, "vol": amount, "leverage": test_lev,
                "side": mx_side, "type": 5, "openType": ot,
                "takeProfitPrice": tp_price, "stopLossPrice": sl_price})
            await asyncio.sleep(2)
            results["result"] = {"method": "order_body_tpsl", "order": True,
                "orderId": str(oid.get("data", "")), "tpsl": await check_tpsl()}

        elif m == 2:
            # Market order + stoporder/change_price
            oid2 = await open_pos(); await asyncio.sleep(2)
            results["step1"] = {"orderId": oid2, "pos": await check_tpsl()}
            body2 = {"orderId": int(oid2), "stopLossPrice": sl_price, "takeProfitPrice": tp_price}
            r2 = await ex_client.exchange.contractPrivatePostStoporderChangePrice(body2)
            await asyncio.sleep(1)
            results["result"] = {"method": "stoporder_change_price", "resp": str(r2), "tpsl": await check_tpsl()}

        elif m == 3:
            # CCXT create_order with params
            oid3 = await ex_client.exchange.create_order(
                data.symbol, "market", "buy" if is_long else "sell", amount,
                params={"stopLossPrice": sl_price, "takeProfitPrice": tp_price,
                        "leverage": test_lev, "marginMode": data.margin_type})
            await asyncio.sleep(2)
            results["result"] = {"method": "ccxt_create_order", "id": str(oid3.get("id", "")), "tpsl": await check_tpsl()}

        elif m == 4:
            # Market order + plan/trigger orders
            await open_pos(); await asyncio.sleep(2)
            results["step1"] = {"pos": await check_tpsl()}
            tp_trigger = 1 if is_long else 2
            sl_trigger = 2 if is_long else 1
            tp_r = await ex_client.exchange.contractPrivatePostPlanorderPlace({
                "symbol": ms, "price": 0, "vol": amount, "side": close_s,
                "openType": ot, "leverage": test_lev,
                "triggerPrice": tp_price, "triggerType": tp_trigger,
                "executeCycle": 2, "orderType": 5, "trend": 1})
            sl_r = await ex_client.exchange.contractPrivatePostPlanorderPlace({
                "symbol": ms, "price": 0, "vol": amount, "side": close_s,
                "openType": ot, "leverage": test_lev,
                "triggerPrice": sl_price, "triggerType": sl_trigger,
                "executeCycle": 2, "orderType": 5, "trend": 1})
            await asyncio.sleep(1)
            results["result"] = {"method": "planorder_trigger", "tp": str(tp_r), "sl": str(sl_r), "tpsl": await check_tpsl()}

        elif m == 5:
            # Market order + string price values
            oid5 = await ex_client.exchange.contractPrivatePostOrderSubmit({
                "symbol": ms, "price": "0", "vol": amount, "leverage": test_lev,
                "side": mx_side, "type": 5, "openType": ot,
                "takeProfitPrice": str(tp_price), "stopLossPrice": str(sl_price)})
            await asyncio.sleep(2)
            results["result"] = {"method": "string_tpsl", "orderId": str(oid5.get("data", "")), "tpsl": await check_tpsl()}

        elif m == 6:
            # Market order + stoporder/place (pozisyon bazlı TP/SL — DOĞRU YÖNTEM)
            await open_pos(); await asyncio.sleep(2)
            results["step1"] = {"pos": await check_tpsl()}
            # positionId al
            pid, pos_info = await get_pos_id()
            results["step2"] = {"positionId": pid, "pos_info": str(pos_info)[:200] if pos_info else None}
            if pid:
                stop_body = {
                    "positionId": pid,
                    "vol": amount,
                    "takeProfitPrice": tp_price,
                    "stopLossPrice": sl_price,
                    "profitTrend": 1,
                    "lossTrend": 1,
                    "stopLossType": 0,
                    "takeProfitType": 0,
                    "stopLossOrderPrice": 0,
                    "takeProfitOrderPrice": 0,
                }
                stop_r = await ex_client.exchange.contractPrivatePostStoporderPlace(stop_body)
                await asyncio.sleep(1)
                results["result"] = {"method": "stoporder_place", "resp": str(stop_r), "tpsl": await check_tpsl()}
            else:
                results["result"] = {"method": "stoporder_place", "error": "positionId bulunamadı"}

        elif m == 0:
            # Sadece temizlik — tüm pozisyonları kapat
            results["result"] = {"method": "cleanup", "done": True}

        # Pozisyonu kapat
        if m != 0:
            await safe_close()

        return results
    except Exception as e:
        return {"error": str(e), "tb": _tb.format_exc()[-600:], "partial": results}
    finally:
        if ex_client:
            try: await ex_client.close()
            except Exception: pass


@router.post("/test-order")
async def test_order(data: TestOrderRequest):
    """
    Hızlı test işlemi — load_markets() olmadan direkt MEXC API.
    Body: {exchange, symbol, side, size_usdt, leverage, tp_pct, sl_pct}
    """
    import ccxt.async_support as ccxt_async
    from core.config import settings
    steps = []
    exchange_obj = None
    try:
        # Direkt CCXT instance (load_markets yok — hız için)
        exchange_obj = ccxt_async.mexc({
            "apiKey": settings.MEXC_API_KEY,
            "secret": settings.MEXC_API_SECRET,
            "options": {"defaultType": "swap"},
        })

        # Ticker ile fiyat al (load_markets gerektirmez)
        ms = data.symbol.split("/")[0] + "_" + data.symbol.split("/")[1].split(":")[0]  # ETH_USDT
        is_long = data.side == "buy"
        mx_side = 1 if is_long else 3
        ot = 1 if data.margin_type == "isolated" else 2

        # Fiyat — MEXC contract ticker
        ticker_resp = await exchange_obj.contractPublicGetTicker({"symbol": ms})
        price = float(ticker_resp.get("data", {}).get("lastPrice", 0))
        if not price:
            # fallback: data listesinden bul
            for t in (ticker_resp.get("data", []) if isinstance(ticker_resp.get("data"), list) else []):
                if t.get("symbol") == ms:
                    price = float(t.get("lastPrice", 0))
                    break
        steps.append(f"Fiyat: {price}")

        # Kontrat miktarı (ETH contractSize=0.01)
        cs_map = {"ETH_USDT": 0.01, "BTC_USDT": 0.0001, "SOL_USDT": 1, "DOGE_USDT": 100}
        cs = cs_map.get(ms, 0.01)
        notional = data.size_usdt * data.leverage
        amount = max(1, int(notional / (price * cs)))
        steps.append(f"Kontrat: {amount} (cs={cs}, notional=${notional:.1f})")

        # Leverage
        try:
            await asyncio.gather(
                exchange_obj.contractPrivatePostPositionChangeLeverage(
                    {"symbol": ms, "leverage": data.leverage, "openType": ot, "positionType": 1}),
                exchange_obj.contractPrivatePostPositionChangeLeverage(
                    {"symbol": ms, "leverage": data.leverage, "openType": ot, "positionType": 2}),
                return_exceptions=True
            )
            steps.append(f"Leverage: {data.leverage}x")
        except Exception as e:
            steps.append(f"Leverage uyarı: {e}")

        # TP/SL fiyatları
        tp_price = None
        sl_price = None
        if data.tp_pct > 0:
            tp_price = round(price * (1 - data.tp_pct/100), 2) if not is_long else round(price * (1 + data.tp_pct/100), 2)
        if data.sl_pct > 0:
            sl_price = round(price * (1 + data.sl_pct/100), 2) if not is_long else round(price * (1 - data.sl_pct/100), 2)
        steps.append(f"TP={tp_price} SL={sl_price}")

        # 1) Market order aç
        order_body = {
            "symbol": ms, "price": 0, "vol": amount,
            "leverage": data.leverage, "side": mx_side, "type": 5, "openType": ot
        }
        resp = await exchange_obj.contractPrivatePostOrderSubmit(order_body)
        order_id = str(resp.get("data", ""))
        steps.append(f"Order OK: id={order_id}")

        # 2) TP/SL — stoporder/place
        if tp_price or sl_price:
            await asyncio.sleep(1)
            target_type = 1 if is_long else 2
            pos_resp = await exchange_obj.contractPrivateGetPositionOpenPositions({"symbol": ms})
            pos_data = pos_resp.get("data", []) if isinstance(pos_resp, dict) else pos_resp
            pos_id = None
            for p in (pos_data or []):
                if int(p.get("positionType", 0)) == target_type and float(p.get("holdVol", 0)) > 0:
                    pos_id = int(p.get("positionId", 0))
                    break
            steps.append(f"Position: id={pos_id} type={target_type}")

            if pos_id:
                stop_body = {
                    "positionId": pos_id, "vol": amount,
                    "profitTrend": 1, "lossTrend": 1,
                    "stopLossType": 0, "takeProfitType": 0,
                    "stopLossOrderPrice": 0, "takeProfitOrderPrice": 0,
                }
                if tp_price:
                    stop_body["takeProfitPrice"] = tp_price
                if sl_price:
                    stop_body["stopLossPrice"] = sl_price
                stop_resp = await exchange_obj.contractPrivatePostStoporderPlace(stop_body)
                steps.append(f"StopOrder OK: {stop_resp}")
            else:
                steps.append("HATA: positionId bulunamadı!")

        return {"success": True, "order_id": order_id, "steps": steps,
                "details": {"price": price, "amount": amount, "tp": tp_price, "sl": sl_price}}

    except Exception as e:
        import traceback
        steps.append(f"HATA: {e}")
        return {"success": False, "error": str(e), "steps": steps,
                "traceback": traceback.format_exc()[-800:]}
    finally:
        if exchange_obj:
            try: await exchange_obj.close()
            except Exception: pass


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

        # Pozisyon — MEXC için direkt contract API kullan (CCXT fetch_positions eksik veri döner)
        pos_data = None
        all_positions = []  # Hedge bot için tüm pozisyonlar
        exchange_name = (bot.exchange or "bitget").lower()
        is_hedge = bot.strategy in ("hedge_bot", "dual_hedge")

        def _parse_mexc_pos(pos: dict, cur_price: float = 0) -> dict | None:
            vol = float(pos.get("holdVol", 0) or 0)
            if vol == 0:
                return None
            pos_type = int(pos.get("positionType", 1))  # 1=long, 2=short
            side = "long" if pos_type == 1 else "short"
            entry = float(pos.get("openAvgPrice", 0) or 0)
            leverage = int(pos.get("leverage", 1) or 1)
            contract_size = float(pos.get("contractSize", 0.001) or 0.001)

            notional = float(pos.get("positionValue", 0) or 0)
            if not notional and entry > 0:
                notional = vol * entry * contract_size

            # PnL: MEXC API çoğunlukla 0 döner, kendimiz hesaplıyoruz
            unrealized_pnl = float(pos.get("unrealisedPnl", 0) or pos.get("unrealizedPnl", 0) or 0)
            if unrealized_pnl == 0 and cur_price > 0 and entry > 0:
                position_value = vol * contract_size  # coin cinsinden
                if side == "long":
                    unrealized_pnl = position_value * (cur_price - entry)
                else:
                    unrealized_pnl = position_value * (entry - cur_price)

            margin = notional / leverage if leverage else notional
            pnl_pct = (unrealized_pnl / margin * 100) if margin else 0
            return {
                "side": side,
                "size": vol,
                "entry_price": entry,
                "notional": round(notional, 2),
                "pnl_usdt": round(unrealized_pnl, 4),
                "pnl_pct": round(pnl_pct, 2),
                "leverage": leverage,
            }

        def _parse_ccxt_pos(p: dict) -> dict | None:
            contracts = float(p.get("contracts", 0) or 0)
            if contracts == 0:
                return None
            entry = float(p.get("entryPrice", 0) or 0)
            notional = float(p.get("notional", 0) or 0) or (contracts * entry)
            side = p.get("side", "long")
            leverage = float(p.get("leverage", 1) or 1)
            unrealized_pnl = float(p.get("unrealizedPnl", 0) or 0)
            margin = notional / leverage if leverage else notional
            pnl_pct = (unrealized_pnl / margin * 100) if margin else 0
            return {
                "side": side,
                "size": contracts,
                "entry_price": entry,
                "notional": round(notional, 2),
                "pnl_usdt": round(unrealized_pnl, 4),
                "pnl_pct": round(pnl_pct, 2),
                "leverage": leverage,
            }

        try:
            if exchange_name == "mexc":
                mexc_symbol = bot.symbol.split("/")[0] + "_" + bot.symbol.split("/")[1].split(":")[0]
                resp = await asyncio.wait_for(
                    ex_client.exchange.contractPrivateGetPositionOpenPositions({"symbol": mexc_symbol}),
                    timeout=15
                )
                data = resp.get("data", []) if isinstance(resp, dict) else resp
                if data and isinstance(data, list):
                    for pos in data:
                        parsed = _parse_mexc_pos(pos, cur_price)
                        if parsed:
                            all_positions.append(parsed)
            else:
                positions = await asyncio.wait_for(ex_client.exchange.fetch_positions([bot.symbol]), timeout=10)
                for p in positions:
                    parsed = _parse_ccxt_pos(p)
                    if parsed:
                        all_positions.append(parsed)

            # Tek pozisyon (standart botlar): ilkini al
            if all_positions:
                pos_data = all_positions[0]
        except Exception as e:
            print(f"[Position API] fetch_positions hatası ({exchange_name}): {e}")

        # Hedge bot: tüm pozisyonları + net PnL döndür
        if is_hedge:
            net_pnl_usdt = sum(p["pnl_usdt"] for p in all_positions)
            net_pnl_pct = sum(p["pnl_pct"] for p in all_positions)
            long_pos = next((p for p in all_positions if p["side"] == "long"), None)
            short_pos = next((p for p in all_positions if p["side"] == "short"), None)
            return {
                "price": cur_price,
                "position": pos_data,
                "is_hedge": True,
                "positions": all_positions,
                "long_position": long_pos,
                "short_position": short_pos,
                "net_pnl_usdt": round(net_pnl_usdt, 4),
                "net_pnl_pct": round(net_pnl_pct, 2),
            }

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

        old_params = {}
        if bot.params:
            try:
                old_params = json.loads(bot.params)
            except:
                pass

        # params (margin_type gibi bot ayarları) + strategy_params (strateji özel) merge
        effective_params = {**old_params, **(data.strategy_params or {}), **(data.params or {})}
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
            old_token = old_params.get("webhook_token")
            # Always preserve existing token to avoid TradingView webhook URL updates
            if old_token:
                token = old_token
            else:
                token = effective_params.get("webhook_token") or effective_params.get("signal_source", "")
                if not token or token.startswith("builtin") or token.startswith("custom__"):
                    token = str(uuid.uuid4())

            effective_params["webhook_token"] = token
            effective_params["_strategy_display"] = "tradingview_webhook"

        # Hedge bot on_signal modunda webhook_token koru/oluştur
        if strategy in ("hedge_bot", "dual_hedge"):
            trigger = effective_params.get("trigger_mode", "on_start")
            if trigger == "on_signal":
                old_token = old_params.get("webhook_token")
                if old_token:
                    effective_params["webhook_token"] = old_token
                elif not effective_params.get("webhook_token"):
                    effective_params["webhook_token"] = str(uuid.uuid4())

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
    """Bot'un trade + sinyal performansı — TP/SL vuruş oranı, kâr/zarar özeti."""
    from models.trade import SignalLog, Trade, TradeStatus
    async with async_session() as session:
        # Sinyal performansı
        sig_result = await session.execute(
            select(SignalLog).where(
                SignalLog.bot_id == bot_id,
                SignalLog.outcome.isnot(None),
            ).order_by(SignalLog.created_at.desc())
        )
        signals = sig_result.scalars().all()

        # Trade geçmişi
        trade_result = await session.execute(
            select(Trade).where(Trade.bot_id == bot_id).order_by(Trade.opened_at.desc())
        )
        trades = trade_result.scalars().all()

    # Sinyal istatistikleri
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

    # Trade istatistikleri
    closed_trades = [t for t in trades if t.status == TradeStatus.CLOSED]
    open_trades = [t for t in trades if t.status == TradeStatus.OPEN]
    winning_trades = [t for t in closed_trades if (t.pnl or 0) > 0]
    trade_win_rate = (len(winning_trades) / len(closed_trades) * 100) if closed_trades else 0
    trade_total_pnl = sum(t.pnl or 0 for t in closed_trades)
    trade_total_pnl_pct = sum(t.pnl_pct or 0 for t in closed_trades)

    return {
        "bot_id": bot_id,
        # Sinyal performansı
        "total_signals": total,
        "open": still_open,
        "tp_hit": tp_hits,
        "sl_hit": sl_hits,
        "expired": expired,
        "win_rate": round(win_rate, 1),
        "avg_pnl_pct": round(avg_pnl, 2),
        "total_pnl_pct": round(total_pnl, 2),
        # Trade performansı
        "trades": {
            "total": len(trades),
            "open": len(open_trades),
            "closed": len(closed_trades),
            "winning": len(winning_trades),
            "losing": len(closed_trades) - len(winning_trades),
            "win_rate": round(trade_win_rate, 1),
            "total_pnl": round(trade_total_pnl, 4),
            "total_pnl_pct": round(trade_total_pnl_pct, 2),
        },
        "trade_history": [
            {
                "id": t.id,
                "side": t.side,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "quantity": t.quantity,
                "pnl": t.pnl,
                "pnl_pct": t.pnl_pct,
                "status": t.status.value if t.status else "unknown",
                "exit_reason": t.exit_reason,
                "leverage": t.leverage_used,
                "duration_min": t.duration_minutes,
                "opened_at": t.opened_at.isoformat() if t.opened_at else None,
                "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            }
            for t in trades[:50]
        ],
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
