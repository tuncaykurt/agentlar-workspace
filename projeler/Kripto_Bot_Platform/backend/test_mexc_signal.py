import asyncio
import json
from sqlalchemy import select
from core.database import async_session
from models.trade import Bot, BotStatus
from bot.engine import BotEngine
from datetime import datetime


async def setup_bot_and_trigger():
    async with async_session() as session:
        # Create or update ETH bot
        query = select(Bot).where(Bot.symbol == "ETH/USDT:USDT", Bot.exchange == "mexc")
        result = await session.execute(query)
        bot = result.scalar_one_or_none()
        
        params = {
            "tp_pct": 0.4,
            "sl_pct": 0.2,
            "leverage": 500,
            "margin_mode": "cross",
            "trade_amount": 7.0
        }
        
        if not bot:
            print("Creating new bot for ETH/USDT on MEXC...")
            bot = Bot(
                name="MEXC ETH Test Bot",
                symbol="ETH/USDT:USDT",
                exchange="mexc",
                strategy="tradingview_webhook",
                status=BotStatus.RUNNING,
                paper_mode=False,
                leverage=500,
                risk_per_trade=7.0,
                params=json.dumps(params)
            )
            session.add(bot)
        else:
            print("Updating existing bot...")
            bot.status = BotStatus.RUNNING
            bot.params = json.dumps(params)
            bot.leverage = 500
            bot.risk_per_trade = 7.0
            
        await session.commit()
        await session.refresh(bot)
        print(f"Bot ID {bot.id} is active.")

    # Now simulate a webhook signal via the BotEngine
    print("Simulating Buy signal via Bot Engine...")
    engine = BotEngine()
    
    # We can inject a signal to redis or just call engine directly if possible.
    # Actually, it's easier to inject to redis and let the engine process it if engine is running.
    # But wait, is the engine running in the background? Yes, docker container runs the backend.
    # If the backend is running, we just need to send a POST request to the webhook endpoint.
    import httpx
    
    webhook_url = "http://localhost:8000/api/signals/webhook/tv/test-mexc"
    payload = {
        "action": "buy",
        "symbol": "ETHUSDT",
        "price": 0,
        "message": "Test Buy Signal"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(webhook_url, json=payload)
        print("Webhook response:", resp.status_code, resp.text)
        
if __name__ == "__main__":
    asyncio.run(setup_bot_and_trigger())
