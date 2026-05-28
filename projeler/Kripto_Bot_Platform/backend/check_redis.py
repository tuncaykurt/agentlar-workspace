import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.redis_client import get_redis

async def main():
    r = get_redis()
    hft = await r.get('hft_sim:settings')
    grid = await r.get('grid_live:state')
    print("hft_sim:", hft)
    print("grid_live:", grid)

asyncio.run(main())
