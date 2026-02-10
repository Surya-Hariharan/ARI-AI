"""
Agent Routes — API endpoints for Execution Agent lifecycle.
These endpoints are called BY agents (not by the UI).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.agent.models import (
    AgentRegistration,
    AgentRecord,
    AgentHeartbeat,
    ExecutionResult,
    AgentStatus,
)
from app.agent.registry import (
    register_agent,
    heartbeat,
    get_agent,
    list_agents,
    revoke_agent,
)
from app.agent.dispatcher import (
    get_pending_instructions,
    record_result,
)
from app.core.security import get_current_user, TokenData
from app.core.logger import logger
from pydantic import BaseModel


router = APIRouter(prefix="/agent", tags=["Execution Agent"])


# ─── Response Models ────────────────────────────────────────────

class RegisterResponse(BaseModel):
    agent_id: str
    status: str
    signing_key: str  # Returned ONLY at registration — agent must store this
    message: str


class HeartbeatResponse(BaseModel):
    acknowledged: bool
    agent_status: str


class InstructionPollResponse(BaseModel):
    agent_id: str
    instructions: List[dict]
    count: int


class ResultResponse(BaseModel):
    instruction_id: str
    recorded: bool


class AgentInfoResponse(BaseModel):
    agent_id: str
    capabilities: List[str]
    platform: str
    version: str
    status: str
    registered_at: float
    last_heartbeat: float


# ─── Endpoints ──────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse)
async def register_new_agent(
    registration: AgentRegistration,
    user: TokenData = Depends(get_current_user),
):
    """
    Register a new Execution Agent with the Control Plane.
    Returns a per-agent signing key that MUST be stored securely by the agent.
    This key is used to verify instruction signatures.
    
    Requires 'admin' capability.
    """
    if "admin" not in user.capabilities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent registration requires admin capability",
        )

    try:
        record = await register_agent(registration)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    return RegisterResponse(
        agent_id=record.agent_id,
        status=record.status.value,
        signing_key=record.signing_key,
        message="Agent registered. Store the signing_key securely — it will not be shown again.",
    )


@router.post("/heartbeat", response_model=HeartbeatResponse)
async def agent_heartbeat(hb: AgentHeartbeat):
    """
    Periodic health check from an agent.
    Agents should send heartbeats every 60 seconds.
    Missing 5 consecutive heartbeats (5 min) marks the agent as UNRESPONSIVE.
    """
    record = await heartbeat(hb)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or has been revoked",
        )

    return HeartbeatResponse(
        acknowledged=True,
        agent_status=record.status.value,
    )


@router.get("/instructions/{agent_id}", response_model=InstructionPollResponse)
async def poll_instructions(agent_id: str):
    """
    Agent polls for pending signed instructions.
    This is a DESTRUCTIVE READ — once polled, instructions are consumed.
    The agent MUST verify each instruction's signature before executing.
    """
    # Verify agent exists
    agent = await get_agent(agent_id)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not registered",
        )
    if agent.status == AgentStatus.REVOKED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent has been revoked",
        )

    instructions = await get_pending_instructions(agent_id)

    return InstructionPollResponse(
        agent_id=agent_id,
        instructions=instructions,
        count=len(instructions),
    )


@router.post("/result", response_model=ResultResponse)
async def report_result(result: ExecutionResult):
    """
    Agent reports the result of an instruction execution.
    """
    recorded = await record_result(result)
    if not recorded:
        logger.warning("result_not_recorded", instruction_id=result.instruction_id)

    return ResultResponse(
        instruction_id=result.instruction_id,
        recorded=recorded,
    )


@router.get("/status/{agent_id}", response_model=AgentInfoResponse)
async def get_agent_status(
    agent_id: str,
    user: TokenData = Depends(get_current_user),
):
    """
    Query an agent's current status.
    Requires 'admin' capability.
    """
    if "admin" not in user.capabilities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent status query requires admin capability",
        )

    agent = await get_agent(agent_id)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return AgentInfoResponse(
        agent_id=agent.agent_id,
        capabilities=agent.capabilities,
        platform=agent.platform,
        version=agent.version,
        status=agent.status.value,
        registered_at=agent.registered_at,
        last_heartbeat=agent.last_heartbeat,
    )


@router.post("/revoke/{agent_id}")
async def revoke_agent_endpoint(
    agent_id: str,
    user: TokenData = Depends(get_current_user),
):
    """
    Revoke an agent. Revoked agents cannot receive instructions or heartbeat.
    Requires 'admin' capability.
    """
    if "admin" not in user.capabilities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent revocation requires admin capability",
        )

    success = await revoke_agent(agent_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )

    return {"agent_id": agent_id, "status": "REVOKED", "message": "Agent revoked successfully"}
