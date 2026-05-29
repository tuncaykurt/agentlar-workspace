"""
Borsa API key yönetimi ve bakiye sorgulama.
Auth kaldırıldı — tek kullanıcı "default".
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from exchange.exchange_factory import fetch_balance_for, create_exchange_client, SUPPORTED_EXCHANGES
from core.redis_client import get_redis
import json

router = APIRouter(prefix="/exchanges", tags=["exchanges"])

from api.routes.auth import get_current_user


class ExchangeKeysRequest(BaseModel):
    exchange: str
    api_key: str
    secret: str
    passphrase: Optional[str] = ""


@router.get("")
async def list_exchanges(user_id: int = Depends(get_current_user)):
    redis = get_redis()
    result = []
    for name, cfg in SUPPORTED_EXCHANGES.items():
        raw = await redis.get(f"exchange_keys:{user_id}:{name}")
        result.append({
            "exchange": name,
            "label": cfg["label"],
            "connected": raw is not None,
            "needs_passphrase": cfg["needs_passphrase"],
        })
    return result


@router.post("/save")
async def save_keys(data: ExchangeKeysRequest, user_id: int = Depends(get_current_user)):
    if data.exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(400, f"Desteklenmeyen borsa. Desteklenenler: {list(SUPPORTED_EXCHANGES)}")

    redis = get_redis()
    keys = {
        "api_key": data.api_key,
        "secret": data.secret,
        "passphrase": data.passphrase or "",
    }
    await redis.set(f"exchange_keys:{user_id}:{data.exchange}", json.dumps(keys))
    return {"status": "ok", "exchange": data.exchange}


@router.delete("/{exchange}")
async def delete_keys(exchange: str, user_id: int = Depends(get_current_user)):
    redis = get_redis()
    await redis.delete(f"exchange_keys:{user_id}:{exchange}")
    return {"status": "deleted", "exchange": exchange}


@router.post("/{exchange}/test")
async def test_connection(exchange: str, user_id: int = Depends(get_current_user)):
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{user_id}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı.")

    keys = json.loads(raw)
    try:
        balance = await fetch_balance_for(
            exchange,
            keys["api_key"],
            keys["secret"],
            keys.get("passphrase", ""),
        )
        return {"status": "ok", "exchange": exchange, "balance": balance}
    except Exception as e:
        raise HTTPException(400, f"Bağlantı hatası: {str(e)}")


class TestOrderRequest(BaseModel):
    symbol: str = "ETH/USDT:USDT"
    side: str = "buy"          # buy = long, sell = short
    amount_usdt: float = 10.0
    leverage: int = 1
    tp_pct: float = 10.0       # take profit %
    sl_pct: float = 10.0       # stop loss %


@router.post("/{exchange}/test-order")
async def test_order(exchange: str, data: TestOrderRequest, user_id: int = Depends(get_current_user)):
    """Gerçek test emri — MEXC/Bitget/Binance üzerinde pozisyon aç"""
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{user_id}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı")

    keys = json.loads(raw)
    client = create_exchange_client(exchange, keys["api_key"], keys["secret"], keys.get("passphrase", ""))

    try:
        # Piyasa bilgisi al
        await client.load_markets()
        market = client.market(data.symbol)
        ticker = await client.fetch_ticker(data.symbol)
        current_price = ticker["last"]

        # Kaldıraç ayarla
        try:
            await client.set_leverage(data.leverage, data.symbol)
        except Exception as e:
            print(f"[TestOrder] Leverage ayar hatası (devam): {e}")

        # Miktar hesapla (USDT -> kontrat adedi)
        contract_size = market.get("contractSize", 1) or 1
        raw_amount = data.amount_usdt / (current_price * contract_size)
        # MEXC swap: amount = kontrat sayısı (tam sayı), minimum 1
        amount = max(1, int(raw_amount))

        # TP/SL hesapla
        if data.side == "buy":
            tp_price = round(current_price * (1 + data.tp_pct / 100), 2)
            sl_price = round(current_price * (1 - data.sl_pct / 100), 2)
        else:
            tp_price = round(current_price * (1 - data.tp_pct / 100), 2)
            sl_price = round(current_price * (1 + data.sl_pct / 100), 2)

        # Market emri aç — TP/SL dahil
        order = await client.create_order(
            symbol=data.symbol,
            type="market",
            side=data.side,
            amount=amount,
            params={
                "takeProfitPrice": tp_price,
                "stopLossPrice": sl_price,
            },
        )

        # Yedek: TP/SL params ile acilmadiysa ayri emir olarak dene
        tp_order = None
        sl_order = None
        tp_in_order = order.get("takeProfitPrice") or order.get("info", {}).get("takeProfitPrice")
        sl_in_order = order.get("stopLossPrice") or order.get("info", {}).get("stopLossPrice")

        if not tp_in_order:
            try:
                tp_side = "sell" if data.side == "buy" else "buy"
                tp_order = await client.create_order(
                    symbol=data.symbol,
                    type="limit",
                    side=tp_side,
                    amount=amount,
                    price=tp_price,
                    params={"reduceOnly": True},
                )
            except Exception as e:
                tp_order = {"error": str(e)}

        if not sl_in_order:
            try:
                sl_side = "sell" if data.side == "buy" else "buy"
                # MEXC trigger order
                sl_order = await client.create_order(
                    symbol=data.symbol,
                    type="limit",
                    side=sl_side,
                    amount=amount,
                    price=sl_price,
                    params={"stopPrice": sl_price, "reduceOnly": True, "triggerType": "1"},
                )
            except Exception as e:
                sl_order = {"error": str(e)}

        return {
            "status": "ok",
            "exchange": exchange,
            "symbol": data.symbol,
            "side": data.side,
            "amount": amount,
            "price": current_price,
            "tp_price": tp_price,
            "sl_price": sl_price,
            "order": {
                "id": order.get("id"),
                "status": order.get("status"),
                "filled": order.get("filled"),
                "cost": order.get("cost"),
            },
            "tp_order": tp_order if isinstance(tp_order, dict) and "error" in tp_order else {"id": tp_order.get("id") if tp_order else None},
            "sl_order": sl_order if isinstance(sl_order, dict) and "error" in sl_order else {"id": sl_order.get("id") if sl_order else None},
        }
    except Exception as e:
        import traceback
        raise HTTPException(400, f"İşlem hatası: {str(e)}\n{traceback.format_exc()}")
    finally:
        await client.close()


async def _fetch_symbols_from_exchange(exchange: str, keys: dict) -> dict:
    """Borsa sembollerini çek — arka planda veya direkt çağrılır."""
    client = create_exchange_client(exchange, keys["api_key"], keys["secret"], keys.get("passphrase", ""))
    # Timeout ayarı — gateway timeout'unu önlemek için
    client.timeout = 30000  # 30 saniye

    try:
        await client.load_markets()
        symbols = []
        for symbol, market in client.markets.items():
            # Sadece aktif swap/futures kontratları
            if not market.get("swap") and not market.get("future"):
                continue
            if not market.get("active", True):
                continue
            # Sadece USDT marjinli
            if market.get("settle") != "USDT" and market.get("quote") != "USDT":
                continue

            # Fee bilgisi
            taker_fee = market.get("taker", 0) or 0
            maker_fee = market.get("maker", 0) or 0

            # Max leverage
            max_leverage = None
            limits = market.get("limits", {})
            leverage_limits = limits.get("leverage", {})
            if leverage_limits and leverage_limits.get("max"):
                max_leverage = int(leverage_limits["max"])

            base = market.get("base", "")

            symbols.append({
                "symbol": symbol,
                "base": base,
                "taker_fee": round(taker_fee * 100, 4),
                "maker_fee": round(maker_fee * 100, 4),
                "zero_fee": taker_fee == 0 and maker_fee == 0,
                "max_leverage": max_leverage,
            })

        symbols.sort(key=lambda x: x["base"])
        return {"exchange": exchange, "symbols": symbols, "total": len(symbols)}
    finally:
        await client.close()


@router.get("/{exchange}/symbols")
async def get_symbols(exchange: str):
    """Borsadaki tüm futures sembollerini fee ve max leverage bilgisiyle döndür."""
    import asyncio
    redis = get_redis()

    # 1 saatlik cache — sembol listesi nadiren değişir
    cache_key = f"symbols_cache:{exchange}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı")

    keys = json.loads(raw)

    try:
        # 45 saniye timeout ile çalıştır — gateway timeout'unun altında kal
        result = await asyncio.wait_for(
            _fetch_symbols_from_exchange(exchange, keys),
            timeout=45.0
        )
        await redis.set(cache_key, json.dumps(result), ex=3600)  # 1 saat cache
        return result
    except asyncio.TimeoutError:
        raise HTTPException(504, "Borsa API yanıt vermedi — lütfen tekrar deneyin")
    except Exception as e:
        import traceback
        raise HTTPException(400, f"Sembol listesi alınamadı: {str(e)}\n{traceback.format_exc()}")


class ClosePositionRequest(BaseModel):
    symbol: str = "ETH/USDT:USDT"


@router.post("/{exchange}/close-position")
async def close_position(exchange: str, data: ClosePositionRequest):
    """Açık pozisyonu kapat"""
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı")

    keys = json.loads(raw)
    client = create_exchange_client(exchange, keys["api_key"], keys["secret"], keys.get("passphrase", ""))

    try:
        await client.load_markets()
        positions = await client.fetch_positions([data.symbol])
        closed = []
        for pos in positions:
            contracts = float(pos.get("contracts", 0))
            if contracts == 0:
                continue
            side = "sell" if pos["side"] == "long" else "buy"
            order = await client.create_order(
                symbol=data.symbol,
                type="market",
                side=side,
                amount=contracts,
                params={"reduceOnly": True},
            )
            closed.append({
                "side": pos["side"],
                "contracts": contracts,
                "order_id": order.get("id"),
            })
        return {"status": "ok", "closed": closed}
    except Exception as e:
        import traceback
        raise HTTPException(400, f"Pozisyon kapatma hatası: {str(e)}\n{traceback.format_exc()}")
    finally:
        await client.close()


@router.get("/{exchange}/balance")
async def get_balance(exchange: str):
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı")

    # 30 saniyelik cache — borsa API'sini her çağrıda meşgul etme
    cache_key = f"balance_cache:{DEFAULT_USER}:{exchange}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    keys = json.loads(raw)
    try:
        result = await fetch_balance_for(
            exchange,
            keys["api_key"],
            keys["secret"],
            keys.get("passphrase", ""),
        )
        await redis.set(cache_key, json.dumps(result), ex=30)
        return result
    except Exception as e:
        raise HTTPException(400, f"Bakiye alınamadı: {str(e)}")
