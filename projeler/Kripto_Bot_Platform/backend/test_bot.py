import asyncio
from core.database import async_session
from sqlalchemy import select
from models.trade import Bot, WebhookProfile

async def main():
    async with async_session() as s:
        res = await s.execute(select(Bot))
        bots = res.scalars().all()
        for b in bots:
            print(f"Bot: {b.id} | {b.name} | {b.symbol} | strategy: {b.strategy} | balance: {b.initial_balance} | params: {b.params}")
            
        res2 = await s.execute(select(WebhookProfile))
        profiles = res2.scalars().all()
        for p in profiles:
            print(f"WebhookProfile: {p.token} | name: {p.name} | tp: {p.tp_pct} | sl: {p.sl_pct} | leverage: {p.leverage}")

asyncio.run(main())
