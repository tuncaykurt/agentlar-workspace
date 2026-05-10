import asyncio
from core.database import async_session
from models.trade import SignalLog
from sqlalchemy import select, func

async def main():
    async with async_session() as session:
        res = await session.execute(select(func.count(SignalLog.id)))
        total = res.scalar()
        print(f"Total signals: {total}")
        for field in ["timeframe", "rsi_14", "volatility_atr", "volume_ratio", "ema200_dist", "outcome"]:
            res = await session.execute(select(func.count(SignalLog.id)).where(getattr(SignalLog, field).is_(None)))
            print(f"Null {field}: {res.scalar()}")

asyncio.run(main())
