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
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

engine = create_async_engine(db_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def main():
    async with AsyncSessionLocal() as session:
        # Delete signals with missing data
        stmt = delete(SignalLog).where(
            (SignalLog.timeframe == None) |
            (SignalLog.rsi_14 == None) |
            (SignalLog.volatility_atr == None) |
            (SignalLog.ema200_dist == None)
        )
        result = await session.execute(stmt)
        await session.commit()
        print(f"Deleted {result.rowcount} signals with missing data.")

asyncio.run(main())
