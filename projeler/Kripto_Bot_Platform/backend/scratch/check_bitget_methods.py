
import ccxt
import asyncio

async def check_methods():
    exchange = ccxt.bitget()
    print("Bitget methods:")
    methods = [m for m in dir(exchange) if not m.startswith('_')]
    for m in sorted(methods):
        if 'tpsl' in m.lower() or 'stop' in m.lower() or 'loss' in m.lower() or 'profit' in m.lower() or 'position' in m.lower():
            print(f" - {m}")
    await exchange.close()

if __name__ == "__main__":
    asyncio.run(check_methods())
