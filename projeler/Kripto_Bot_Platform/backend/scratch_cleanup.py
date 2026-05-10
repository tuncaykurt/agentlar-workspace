import asyncio
from core.database import async_session
from models.trade import SignalLog
from sqlalchemy import select, func

async def count_signals():
    async with async_session() as s:
        # Total count
        res = await s.execute(select(func.count(SignalLog.id)))
        print('Total Signal Logs:', res.scalar())
        
        # Breakdown by action and outcome
        res = await s.execute(select(SignalLog.action, SignalLog.outcome, func.count(SignalLog.id)).group_by(SignalLog.action, SignalLog.outcome))
        print('Breakdown:')
        for row in res.all():
            print(f"Action: {row[0]}, Outcome: {row[1]}, Count: {row[2]}")

if __name__ == "__main__":
    asyncio.run(count_signals())
