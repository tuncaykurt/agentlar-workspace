import asyncio
import ccxt.async_support as ccxt

async def main():
    # Use invalid keys to see if it raises auth error
    ex = ccxt.mexc({'apiKey': 'invalid', 'secret': 'invalid', 'options': {'defaultType': 'swap'}})
    try:
        bal = await ex.fetch_balance({'type': 'swap'})
        print(bal)
    except Exception as e:
        print(f"Exception: {type(e).__name__} - {str(e)}")
    finally:
        await ex.close()

if __name__ == "__main__":
    asyncio.run(main())
