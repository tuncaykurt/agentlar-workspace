import asyncio
from backend.exchange.mexc_client import MEXCClient

async def main():
    ex = MEXCClient()
    print("Fetching OHLCV...")
    try:
        ohlcv = await ex.get_ohlcv("ETH/USDT:USDT", "5m", 100)
        print(f"OHLCV Length: {len(ohlcv) if ohlcv else 0}")
        if ohlcv:
            print("Latest:", ohlcv[-1])
    except Exception as e:
        print("Error:", e)
    finally:
        await ex.close()

asyncio.run(main())
