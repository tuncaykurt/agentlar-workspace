import asyncio
from core.database import async_session
from models.trade import Bot, BotStatus
from sqlalchemy import update

async def update_bot():
    async with async_session() as session:
        # Bot ID 3'ü XRP/USDT:USDT yapıyoruz test için
        await session.execute(
            update(Bot).where(Bot.id == 3).values(symbol="XRP/USDT:USDT")
        )
        await session.commit()
        print("Bot 3 updated to XRP/USDT:USDT")

if __name__ == "__main__":
    asyncio.run(update_bot())
