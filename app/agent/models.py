"""
Execution Agent Contract Models.

These models define the communication protocol between the 
ARI Control Plane (Node A) and any Execution Agent (Node B).

The Agent is:
- Untrusted by default
- Replaceable
- Sandbox-contained  
- Policy-blind

It NEVER decides. It ONLY executes signed instructions.
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


# ─── Agent Status ───────────────────────────────────────────────

class AgentStatus(str, Enum):
    REGISTERED = "REGISTERED"       # Just registered, not yet healthy
    HEALTHY = "HEALTHY"             # Responding to heartbeats
    DEGRADED = "DEGRADED"           # Partial functionality
    UNRESPONSIVE = "UNRESPONSIVE"   # Missed heartbeats
    REVOKED = "REVOKED"             # Explicitly revoked by Control Plane


class AgentCapability(str, Enum):
    """What an agent can do. Must be declared at registration."""
    IOT_CONTROL = "IOT_CONTROL"
    TTS = "TTS"
    QUERY = "QUERY"
    TELEMETRY = "TELEMETRY"
    DEVICE_ADMIN = "DEVICE_ADMIN"


# ─── Agent Registration ────────────────────────────────────────

class AgentRegistration(BaseModel):
    """Agent announces itself to the Control Plane."""
    agent_id: str = Field(..., description="Unique agent identifier")
    capabilities: List[AgentCapability] = Field(
        default=[], description="What this agent can execute"
    )
    platform: str = Field(
        default="unknown", description="Platform info (e.g., 'Android 14, Pixel 8')"
    )
    version: str = Field(
        default="0.0.0", description="Agent software version"
    )


class AgentRecord(BaseModel):
    """Internal representation of a registered agent."""
    agent_id: str
    capabilities: List[str]
    platform: str
    version: str
    status: AgentStatus = AgentStatus.REGISTERED
    registered_at: float  # Unix timestamp
    last_heartbeat: float  # Unix timestamp
    signing_key: str  # Per-agent HMAC key


# ─── Agent Heartbeat ───────────────────────────────────────────

class AgentHeartbeat(BaseModel):
    """Periodic health check from Agent → Control Plane."""
    agent_id: str
    status: AgentStatus = AgentStatus.HEALTHY
    uptime_seconds: float = 0.0
    last_result_id: Optional[str] = None  # ID of last completed instruction
    error: Optional[str] = None


# ─── Instruction Envelope ──────────────────────────────────────

class InstructionAction(BaseModel):
    """The action payload within an instruction envelope."""
    action_type: str
    target: str
    params: Dict[str, Any] = {}


class InstructionEnvelope(BaseModel):
    """
    Signed command from Control Plane → Execution Agent.
    
    The Agent MUST:
    1. Verify the signature before executing
    2. Check expiration (reject if expired)
    3. Execute exactly once
    4. Report the result back
    """
    instruction_id: str = Field(..., description="Unique instruction ID (UUID)")
    agent_id: str = Field(..., description="Target agent")
    action: InstructionAction
    issued_at: float = Field(..., description="Unix timestamp when issued")
    expires_at: float = Field(..., description="Unix timestamp — reject if past this")
    signature: str = Field(..., description="HMAC-SHA256 signature over canonical payload")


# ─── Execution Result ──────────────────────────────────────────

class ExecutionStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REJECTED = "REJECTED"   # Agent rejected the instruction (bad signature, expired, etc.)
    TIMEOUT = "TIMEOUT"     # Agent didn't complete in time


class ExecutionResult(BaseModel):
    """Agent reports back to Control Plane after executing (or rejecting) an instruction."""
    instruction_id: str
    agent_id: str
    status: ExecutionStatus
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    executed_at: float = Field(..., description="Unix timestamp of execution")
