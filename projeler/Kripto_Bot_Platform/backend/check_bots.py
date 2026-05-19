import asyncio
from core.database import async_session
from models.trade import Bot, BotStatus
from sqlalchemy import select

async def check_bots():
    async with async_session() as session:
        result = await session.execute(select(Bot))
        bots = result.scalars().all()
        print(f"Total bots found: {len(bots)}")
        for bot in bots:
            print(f"ID: {bot.id}, Name: {bot.name}, Symbol: {bot.symbol}, Strategy: {bot.strategy}, Status: {bot.status}")

if __name__ == "__main__":
    asyncio.run(check_bots())
