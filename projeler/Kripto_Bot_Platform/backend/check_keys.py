import asyncio
import json
from core.redis_client import get_redis

async def main():
    redis = get_redis()
    keys = await redis.keys("exchange_keys:*")
    print(keys)
    for k in keys:
        raw = await redis.get(k)
        print(k, raw)

if __name__ == "__main__":
    asyncio.run(main())
