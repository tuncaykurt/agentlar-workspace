"""
Borsa API key yönetimi ve bakiye sorgulama.
Auth kaldırıldı — tek kullanıcı "default".
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from exchange.exchange_factory import fetch_balance_for, create_exchange_client, SUPPORTED_EXCHANGES
from core.redis_client import get_redis
import json

router = APIRouter(prefix="/exchanges", tags=["exchanges"])

DEFAULT_USER = "default"


class ExchangeKeysRequest(BaseModel):
    exchange: str
    api_key: str
    secret: str
    passphrase: Optional[str] = ""


@router.get("")
async def list_exchanges():
    redis = get_redis()
    result = []
    for name, cfg in SUPPORTED_EXCHANGES.items():
        raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{name}")
        result.append({
            "exchange": name,
            "label": cfg["label"],
            "connected": raw is not None,
            "needs_passphrase": cfg["needs_passphrase"],
        })
    return result


@router.post("/save")
async def save_keys(data: ExchangeKeysRequest):
    if data.exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(400, f"Desteklenmeyen borsa. Desteklenenler: {list(SUPPORTED_EXCHANGES)}")

    redis = get_redis()
    keys = {
        "api_key": data.api_key,
        "secret": data.secret,
        "passphrase": data.passphrase or "",
    }
    await redis.set(f"exchange_keys:{DEFAULT_USER}:{data.exchange}", json.dumps(keys))
    return {"status": "ok", "exchange": data.exchange}


@router.delete("/{exchange}")
async def delete_keys(exchange: str):
    redis = get_redis()
    await redis.delete(f"exchange_keys:{DEFAULT_USER}:{exchange}")
    return {"status": "deleted", "exchange": exchange}


@router.post("/{exchange}/test")
async def test_connection(exchange: str):
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
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
async def test_order(exchange: str, data: TestOrderRequest):
    """Gerçek test emri — MEXC/Bitget/Binance üzerinde pozisyon aç"""
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
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

        # Market emri aç
        order = await client.create_order(
            symbol=data.symbol,
            type="market",
            side=data.side,
            amount=amount,
        )

        # TP/SL hesapla
        if data.side == "buy":
            tp_price = round(current_price * (1 + data.tp_pct / 100), 2)
            sl_price = round(current_price * (1 - data.sl_pct / 100), 2)
        else:
            tp_price = round(current_price * (1 - data.tp_pct / 100), 2)
            sl_price = round(current_price * (1 + data.sl_pct / 100), 2)

        # TP emri
        tp_order = None
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

        # SL emri — MEXC trigger/stop-limit
        sl_order = None
        try:
            sl_side = "sell" if data.side == "buy" else "buy"
            sl_order = await client.create_order(
                symbol=data.symbol,
                type="limit",
                side=sl_side,
                amount=amount,
                price=sl_price,
                params={
                    "reduceOnly": True,
                    "stopPrice": sl_price,
                    "triggerType": "1",   # MEXC: 1=trigger order
                },
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


@router.get("/{exchange}/balance")
async def get_balance(exchange: str):
    redis = get_redis()
    raw = await redis.get(f"exchange_keys:{DEFAULT_USER}:{exchange}")
    if not raw:
        raise HTTPException(404, f"{exchange} için API key bulunamadı")

    keys = json.loads(raw)
    try:
        return await fetch_balance_for(
            exchange,
            keys["api_key"],
            keys["secret"],
            keys.get("passphrase", ""),
        )
    except Exception as e:
        raise HTTPException(400, f"Bakiye alınamadı: {str(e)}")
