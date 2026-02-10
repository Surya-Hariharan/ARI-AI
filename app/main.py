from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.logger import logger
from app.config import settings
from app.core.middleware import GateMiddleware
from app.core.rate_limit_middleware import RateLimitMiddleware

from app.core.redis import RedisClient
from app.core.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", msg="ARI Control Plane Starting up...")
    
    # Initialize Redis connection
    try:
        redis = await RedisClient.get_client()
        await redis.ping()
        logger.info("redis_connected", host=settings.REDIS_HOST)
    except Exception as e:
        logger.warning("redis_unavailable", error=str(e), msg="Continuing without Redis — rate limiting disabled")
    
    # Initialize Database (create tables if they don't exist)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database_connected", server=settings.POSTGRES_SERVER)
    except Exception as e:
        logger.warning("database_unavailable", error=str(e), msg="Continuing without Postgres — audit logging to stdout only")
    
    # Log auth provider
    logger.info("auth_provider", provider=settings.AUTH_PROVIDER)
    
    yield
    
    # Shutdown
    logger.info("shutdown", msg="ARI Control Plane Shutting down...")
    await RedisClient.close()
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS — environment-based origin whitelist
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enforce Rate Limits (Level 1)
app.add_middleware(RateLimitMiddleware)

# Register Routers
from app.api.routes import router as api_router
from app.api.intelligence_routes import router as intelligence_router
from app.api.auth_routes import router as auth_router
from app.api.state_routes import router as state_router
from app.api.agent_routes import router as agent_router

app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(intelligence_router, prefix=settings.API_V1_STR)
app.include_router(state_router, prefix=settings.API_V1_STR)
app.include_router(agent_router, prefix=settings.API_V1_STR)

# Enforce the Gate
app.add_middleware(GateMiddleware)

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "ARI Control Plane",
        "auth_provider": settings.AUTH_PROVIDER,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
