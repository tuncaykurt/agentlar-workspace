import asyncio
import json
from backend.core.redis_client import get_redis

async def main():
    redis = get_redis()
    state_raw = await redis.get("grid_live:state")
    if state_raw:
        state = json.loads(state_raw)
        print("GRID STATE BB WIDTH:", state.get("bb_width"))
        print("GRID STATE BB MID:", state.get("bb_mid"))
        print("GRID STATE GRID MODE:", state.get("grid_mode"))
    else:
        print("NO STATE")

    meta_raw = await redis.get("bb_grid:meta:ETH/USDT:USDT")
    if meta_raw:
        print("META RAW:", meta_raw)
    else:
        print("NO META RAW")

asyncio.run(main())
