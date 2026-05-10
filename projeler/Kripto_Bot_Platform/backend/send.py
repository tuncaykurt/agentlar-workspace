import httpx
import asyncio

async def main():
    url = "http://localhost:8000/api/signals/webhook/tv/test-mexc"
    payload = {
        "action": "sell",
        "symbol": "ETHUSDT",
        "price": 3000,
        "message": "Sell Signal"
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload)
        print("Status:", resp.status_code)
        print("Body:", resp.text)

if __name__ == "__main__":
    asyncio.run(main())
