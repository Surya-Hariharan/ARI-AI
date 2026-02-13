"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.node import NodeStatus


class NodeRegisterRequest(BaseModel):
    """Node registration request"""
    hardware_id: str = Field(..., description="Unique hardware identifier")
    hostname: str = Field(..., description="Node hostname")
    ip_address: Optional[str] = None
    name: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class NodeRegisterResponse(BaseModel):
    """Node registration response"""
    node_id: str
    token: str
    message: str


class NodeResponse(BaseModel):
    """Node information response"""
    id: str
    name: Optional[str]
    status: NodeStatus
    hardware_id: str
    hostname: str
    ip_address: Optional[str]
    last_heartbeat: Optional[datetime]
    last_seen: Optional[datetime]
    created_at: datetime
    metadata: Dict[str, Any]
    
    class Config:
        from_attributes = True


class CommandRequest(BaseModel):
    """Command execution request"""
    node_id: str
    command_type: str = Field(..., description="Command type: ping, system_info, restart_agent, custom_task")
    payload: Dict[str, Any] = Field(default_factory=dict)


class CommandResponse(BaseModel):
    """Command execution response"""
    command_id: str
    node_id: str
    command_type: str
    status: str
    message: str


class TelemetryRequest(BaseModel):
    """Telemetry data submission"""
    node_id: str
    cpu_percent: int
    memory_percent: int
    disk_percent: int
    data: Dict[str, Any] = Field(default_factory=dict)


class HeartbeatRequest(BaseModel):
    """Heartbeat request"""
    node_id: str
    status: NodeStatus
    metadata: Dict[str, Any] = Field(default_factory=dict)
