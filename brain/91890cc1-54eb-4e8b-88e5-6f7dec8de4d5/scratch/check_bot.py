
import asyncio
import sys
import os

# Backend dizinini path'e ekle
sys.path.append(os.getcwd())

from core.database import async_session
from sqlalchemy import text

async def check():
    async with async_session() as session:
        result = await session.execute(text("SELECT id, name, symbol, strategy, status FROM bots WHERE id=3"))
        row = result.fetchone()
        print(f"Bot info: {row}")

if __name__ == "__main__":
    asyncio.run(check())
