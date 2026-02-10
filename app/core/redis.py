import redis.asyncio as redis
from app.config import settings

class RedisClient:
    _client: redis.Redis | None = None

    @classmethod
    async def get_client(cls) -> redis.Redis:
        if cls._client is None:
            cls._client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                decode_responses=True,
                auto_close_connection_pool=False
            )
        return cls._client

    @classmethod
    async def close(cls):
        if cls._client:
            await cls._client.close()
            cls._client = None

async def get_redis() -> redis.Redis:
    return await RedisClient.get_client()
