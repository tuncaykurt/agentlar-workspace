import asyncio
from core.database import async_session
from models.trade import SignalLog
from sqlalchemy import delete, select, func

async def main():
    async with async_session() as session:
        # Check how many signals have missing data
        res = await session.execute(select(func.count(SignalLog.id)).where(SignalLog.timeframe.is_(None)))
        count = res.scalar()
        print(f"Silinecek eksik verili sinyal sayisi (timeframe null): {count}")
        
        # Sinyal verisi en baştan düzgün otursun diye
        res2 = await session.execute(select(func.count(SignalLog.id)).where(SignalLog.rsi_14.is_(None)))
        count2 = res2.scalar()
        print(f"Silinecek eksik verili sinyal sayisi (rsi null): {count2}")

        # Delete them
        await session.execute(delete(SignalLog).where(SignalLog.timeframe.is_(None)))
        await session.execute(delete(SignalLog).where(SignalLog.rsi_14.is_(None)))
        await session.commit()
        print("Eksik verili sinyaller temizlendi.")

asyncio.run(main())
