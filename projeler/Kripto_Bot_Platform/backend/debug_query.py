
import asyncio
import sys
import os
import json

# Backend dizinini path'e ekle
sys.path.append("/app")

from core.database import async_session
from models.trade import Bot
from sqlalchemy import select as sa_select

async def check():
    symbol_ccxt = "BTC/USDT:USDT"
    strategies = ["tradingview_webhook", "custom_signal", "freqtrade"]
    
    async with async_session() as session:
        print(f"Querying for symbol: {symbol_ccxt} and strategies: {strategies}")
        stmt = sa_select(Bot).where(
            Bot.strategy.in_(strategies),
            Bot.symbol == symbol_ccxt
        )
        result = await session.execute(stmt)
        bots = result.scalars().all()
        print(f"Found {len(bots)} bots")
        for b in bots:
            print(f"Bot: ID={b.id}, Name='{b.name}', Symbol='{b.symbol}', Strategy='{b.strategy}', Status='{b.status}'")

if __name__ == "__main__":
    asyncio.run(check())
