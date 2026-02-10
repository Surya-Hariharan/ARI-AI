from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.core.logger import logger
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", msg="ARI Control Plane Starting up...")
    # Initialize DB connection (todo)
    # Initialize Redis connection (todo)
    yield
    logger.info("shutdown", msg="ARI Control Plane Shutting down...")
    # Close connections (todo)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ARI Control Plane"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
