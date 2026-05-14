"""
Çoklu borsa desteği: Bitget, Binance, MEXC
CCXT kullanarak dinamik client oluşturur.
"""
import ccxt.async_support as ccxt

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
