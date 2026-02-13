"""
Configuration for slave node agent
"""
import os
import uuid
import platform
import hashlib


def get_hardware_id() -> str:
    """
    Generate unique hardware-based identifier
    Combines hostname, MAC address, and platform info
    """
    components = [
        platform.node(),
        str(uuid.getnode()),  # MAC address
        platform.machine(),
        platform.system()
    ]
    
    combined = "-".join(components)
    return hashlib.sha256(combined.encode()).hexdigest()[:32]


class Settings:
    """Agent configuration settings"""
    
    # Node Identity
    HARDWARE_ID: str = get_hardware_id()
    HOSTNAME: str = platform.node()
    NODE_ID: str = os.getenv("NODE_ID", "")  # Will be assigned after registration
    
    # Control Server
    CONTROL_SERVER_URL: str = os.getenv(
        "CONTROL_SERVER_URL",
        "ws://localhost:8000"
    )
    CONTROL_SERVER_HTTP: str = os.getenv(
        "CONTROL_SERVER_HTTP",
        "http://localhost:8000"
    )
    
    # Authentication
    NODE_TOKEN: str = os.getenv("NODE_TOKEN", "")  # JWT token from registration
    
    # WebSocket
    WS_RECONNECT_DELAY_BASE: float = 1.0  # Base delay for exponential backoff
    WS_RECONNECT_DELAY_MAX: float = 60.0  # Max delay between reconnections
    WS_RECONNECT_MAX_ATTEMPTS: int = 0  # 0 = infinite
    
    # Heartbeat
    HEARTBEAT_INTERVAL: int = 10  # seconds
    
    # Telemetry
    TELEMETRY_INTERVAL: int = 30  # seconds
    TELEMETRY_ENABLED: bool = True
    
    # Execution
    COMMAND_TIMEOUT: int = 300  # seconds
    ENABLE_SANDBOX: bool = True
    
    # Logging
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_FILE: str = "agent.log"
    
    # Cache
    CACHE_DIR: str = os.getenv("CACHE_DIR", "./cache")
    ENABLE_OFFLINE_CACHE: bool = True


settings = Settings()
