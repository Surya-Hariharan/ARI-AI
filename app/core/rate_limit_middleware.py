import time
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.core.redis import get_redis
from app.core.logger import logger

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Identity
        # Use IP or X-Device-ID if available
        device_id = request.headers.get("X-Device-ID")
        ip = request.client.host if request.client else "unknown"
        
        identifier = device_id if device_id else ip
        
        # 2. Redis Check (Simple sliding window or fixed window)
        # Key: ratelimit:api:{identifier}
        # Limit: 60 req / min
        
        try:
            redis = await get_redis()
            key = f"ratelimit:api:{identifier}"
            
            # INCR and EXPIRE
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, 60)
                
            if current > 60:
                logger.warning("api_rate_limit_exceeded", identifier=identifier, count=current)
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "API rate limit exceeded. Slow down."}
                )
        except Exception as e:
            # Fail open if Redis is down? Or Log and continue?
            # For security, we might want to fail closed, but for UX, fail open.
            logger.error("rate_limit_error", error=str(e))
            # Continuing to next middleware if Redis fails
            
        return await call_next(request)
