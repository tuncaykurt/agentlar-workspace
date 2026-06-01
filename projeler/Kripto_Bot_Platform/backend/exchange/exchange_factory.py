"""
Çoklu borsa desteği: Bitget, Binance, MEXC
CCXT kullanarak dinamik client oluşturur.
"""
import ccxt.async_support as ccxt
from core.redis_client import get_redis
import json

# Public (keyless) client cache — her borsa için tek instance
_public_clients: dict[str, ccxt.Exchange] = {}


SUPPORTED_EXCHANGES = {
    "bitget": {
        "class": ccxt.bitget,
        "options": {"defaultType": "swap"},
        "balance_params": {"type": "swap"},
        "needs_passphrase": True,
        "label": "Bitget",
    },
    "binance": {
        "class": ccxt.binance,
        "options": {"defaultType": "future"},
        "balance_params": {},
        "needs_passphrase": False,
        "label": "Binance",
    },
    "mexc": {
        "class": ccxt.mexc,
        "options": {"defaultType": "swap"},
        "balance_params": {"type": "swap"},
        "needs_passphrase": False,
        "label": "MEXC",
    },
}


def create_exchange_client(
    exchange_name: str,
    api_key: str,
    secret: str,
    passphrase: str = "",
) -> ccxt.Exchange:
    config = SUPPORTED_EXCHANGES.get(exchange_name)
    if not config:
        raise ValueError(f"Desteklenmeyen borsa: {exchange_name}. Desteklenenler: {list(SUPPORTED_EXCHANGES)}")

    params = {
        "apiKey": api_key,
        "secret": secret,
        "options": config["options"],
    }
    if passphrase:
        params["password"] = passphrase

    return config["class"](params)


def get_public_client(exchange_name: str) -> ccxt.Exchange:
    """Public (keyless) CCXT client — OHLCV, ticker gibi public endpoint'ler için.
    Her borsa için tek instance cache'lenir."""
    if exchange_name not in SUPPORTED_EXCHANGES:
        exchange_name = "mexc"  # fallback

    if exchange_name not in _public_clients:
        config = SUPPORTED_EXCHANGES[exchange_name]
        _public_clients[exchange_name] = config["class"]({
            "options": config["options"],
        })
    return _public_clients[exchange_name]


async def get_user_preferred_exchange(user_id: int | None = None) -> str:
    """Kullanıcının bağlı olduğu ilk borsayı döndür.
    Öncelik: mexc > binance > bitget (en çok kullanılandan başla)."""
    try:
        redis = get_redis()
        user_key = "default" if user_id is None else str(user_id)
        for ex_name in ["mexc", "binance", "bitget"]:
            raw = await redis.get(f"exchange_keys:{user_key}:{ex_name}")
            if raw:
                return ex_name
    except Exception:
        pass
    return "mexc"  # default


async def fetch_balance_for(
    exchange_name: str,
    api_key: str,
    secret: str,
    passphrase: str = "",
) -> dict:
    config = SUPPORTED_EXCHANGES[exchange_name]
    client = create_exchange_client(exchange_name, api_key, secret, passphrase)
    try:
        balance = await client.fetch_balance(config.get("balance_params", {}))
        return {
            "exchange": exchange_name,
            "total": float(balance["total"].get("USDT", 0) or 0),
            "free": float(balance["free"].get("USDT", 0) or 0),
            "used": float(balance["used"].get("USDT", 0) or 0),
        }
    finally:
        await client.close()
