"""
Database models for slave nodes
"""
from sqlalchemy import Column, String, DateTime, Integer, JSON, Enum as SQLEnum
from sqlalchemy.sql import func
from datetime import datetime
import enum

from app.core.database import Base


class NodeStatus(str, enum.Enum):
    """Node status enumeration"""
    BOOTING = "BOOTING"
    CONNECTING = "CONNECTING"
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"


class Node(Base):
    """Slave node model"""
    __tablename__ = "nodes"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=True)
    status = Column(SQLEnum(NodeStatus), default=NodeStatus.OFFLINE)
    
    # Hardware info
    hardware_id = Column(String, unique=True, index=True)
    hostname = Column(String)
    ip_address = Column(String)
    
    # Metadata
    metadata = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_heartbeat = Column(DateTime(timezone=True))
    last_seen = Column(DateTime(timezone=True))
    
    # Stats
    total_commands = Column(Integer, default=0)
    failed_commands = Column(Integer, default=0)


class Command(Base):
    """Command execution log"""
    __tablename__ = "commands"
    
    id = Column(String, primary_key=True, index=True)
    node_id = Column(String, index=True)
    command_type = Column(String)
    payload = Column(JSON)
    signature = Column(String)
    
    # Execution
    status = Column(String, default="pending")  # pending, sent, acknowledged, completed, failed
    result = Column(JSON)
    error = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    metadata = Column(JSON, default={})


class Telemetry(Base):
    """Telemetry data from nodes"""
    __tablename__ = "telemetry"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    node_id = Column(String, index=True)
    
    # Metrics
    cpu_percent = Column(Integer)
    memory_percent = Column(Integer)
    disk_percent = Column(Integer)
    
    # Additional data
    data = Column(JSON, default={})
    
    # Timestamp
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
