"""
Configuration management for the control server
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Server
    APP_NAME: str = "Slave Node Control Server"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/slave_nodes"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_REDIS_PUBSUB: bool = os.getenv("USE_REDIS_PUBSUB", "false").lower() == "true"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
    ]
    
    # Heartbeat
    HEARTBEAT_TIMEOUT_SECONDS: int = 30
    HEARTBEAT_CHECK_INTERVAL: int = 10
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 10
    WS_RECONNECT_MAX_RETRIES: int = 5
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
