"""
Distributed Slave Node Control Server
Main FastAPI application entry point
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.database import engine, Base
from app.api import routes_nodes, routes_commands
from app.websocket import connection_manager
from app.services.health_monitor import HealthMonitor

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Slave Node Control Server")
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized")
    
    # Start health monitor
    health_monitor = HealthMonitor()
    await health_monitor.start()
    logger.info("Health monitor started")
    
    yield
    
    # Shutdown
    logger.info("Shutting down gracefully")
    await health_monitor.stop()
    await connection_manager.disconnect_all()
    logger.info("All connections closed")


app = FastAPI(
    title="Slave Node Control Server",
    description="Production-grade distributed agent control plane",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(routes_nodes.router, prefix="/api/v1/nodes", tags=["nodes"])
app.include_router(routes_commands.router, prefix="/api/v1/commands", tags=["commands"])
app.include_router(connection_manager.router, prefix="/ws", tags=["websocket"])


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "nodes_connected": len(connection_manager.active_connections)
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Slave Node Control Server",
        "version": "1.0.0",
        "status": "operational"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
