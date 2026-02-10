from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class RequestType(str, Enum):
    VOICE_COMMAND = "VOICE_COMMAND"
    SYSTEM_EVENT = "SYSTEM_EVENT"
    DIRECT_CONTROL = "DIRECT_CONTROL"

class SystemState(str, Enum):
    ACTIVE = "ACTIVE"
    STANDBY = "STANDBY"
    DEGRADED = "DEGRADED"

class DeviceContext(BaseModel):
    device_id: str
    user_id: Optional[str] = None
    location: Optional[str] = None
    client_version: Optional[str] = None

class RequestContext(BaseModel):
    request_id: str
    timestamp: datetime
    state: SystemState
    device: DeviceContext
    permissions: list[str] = []

class IncomingRequest(BaseModel):
    type: RequestType
    intent: str
    payload: Dict[str, Any] = {}
    
class DecisionOutcome(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    SILENT_DROP = "SILENT_DROP"
    ESCALATE = "ESCALATE"

class Action(BaseModel):
    action_type: str
    target: str
    params: Dict[str, Any] = {}

class Decision(BaseModel):
    outcome: DecisionOutcome
    reason: str
    actions: list[Action] = []
