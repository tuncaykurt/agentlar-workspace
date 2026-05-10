import asyncio
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import sys
sys.path.append("backend")
from core.config import settings
from models.trade import SignalLog

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SignalLog).limit(10))
        for row in result.scalars():
            print(f"ID: {row.id}, Timeframe: {row.timeframe}, RSI: {row.rsi_14}, Vol: {row.volatility_atr}")

asyncio.run(main())
