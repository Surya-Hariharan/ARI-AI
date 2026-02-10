"""
Agent Registry — Redis-backed registration and health tracking.
The Control Plane manages the lifecycle of all Execution Agents.
"""
import json
import time
import secrets
from typing import Optional, List
from app.core.redis import get_redis
from app.core.logger import logger
from app.agent.models import (
    AgentRegistration,
    AgentRecord,
    AgentStatus,
    AgentHeartbeat,
)


# Redis key patterns
AGENT_KEY_PREFIX = "ari:agent:"
AGENT_INDEX_KEY = "ari:agents:index"
# Agent TTL — agents that don't heartbeat within this window are marked UNRESPONSIVE
AGENT_TTL_SECONDS = 300  # 5 minutes


async def _get_redis_safe():
    """Returns Redis client or None if unavailable."""
    try:
        client = await get_redis()
        await client.ping()
        return client
    except Exception:
        return None


async def register_agent(registration: AgentRegistration) -> AgentRecord:
    """
    Registers a new Execution Agent with the Control Plane.
    Generates a per-agent HMAC signing key for instruction verification.
    """
    redis = await _get_redis_safe()
    if redis is None:
        raise RuntimeError("Cannot register agent: Redis unavailable")

    now = time.time()
    signing_key = secrets.token_hex(32)  # 256-bit per-agent key

    record = AgentRecord(
        agent_id=registration.agent_id,
        capabilities=[c.value for c in registration.capabilities],
        platform=registration.platform,
        version=registration.version,
        status=AgentStatus.REGISTERED,
        registered_at=now,
        last_heartbeat=now,
        signing_key=signing_key,
    )

    key = f"{AGENT_KEY_PREFIX}{registration.agent_id}"
    await redis.set(key, record.model_dump_json(), ex=AGENT_TTL_SECONDS)
    await redis.sadd(AGENT_INDEX_KEY, registration.agent_id)

    logger.info(
        "agent_registered",
        agent_id=registration.agent_id,
        capabilities=record.capabilities,
        platform=registration.platform,
    )

    return record


async def heartbeat(hb: AgentHeartbeat) -> Optional[AgentRecord]:
    """
    Processes a heartbeat from an agent.
    Refreshes TTL and updates status.
    Returns None if agent not found or revoked.
    """
    redis = await _get_redis_safe()
    if redis is None:
        return None

    key = f"{AGENT_KEY_PREFIX}{hb.agent_id}"
    raw = await redis.get(key)
    if raw is None:
        logger.warning("heartbeat_unknown_agent", agent_id=hb.agent_id)
        return None

    record = AgentRecord.model_validate_json(raw)

    # Revoked agents cannot heartbeat
    if record.status == AgentStatus.REVOKED:
        logger.warning("heartbeat_revoked_agent", agent_id=hb.agent_id)
        return None

    # Update record
    record.status = hb.status
    record.last_heartbeat = time.time()

    await redis.set(key, record.model_dump_json(), ex=AGENT_TTL_SECONDS)

    logger.debug("agent_heartbeat", agent_id=hb.agent_id, status=hb.status.value)
    return record


async def get_agent(agent_id: str) -> Optional[AgentRecord]:
    """Retrieves an agent record by ID. Checks for unresponsiveness."""
    redis = await _get_redis_safe()
    if redis is None:
        return None

    key = f"{AGENT_KEY_PREFIX}{agent_id}"
    raw = await redis.get(key)
    if raw is None:
        return None

    record = AgentRecord.model_validate_json(raw)
    
    # Auto-detect unresponsiveness
    # If agent is not revoked but hasn't heartbeat in TTL, mark as UNRESPONSIVE
    if record.status != AgentStatus.REVOKED:
        if time.time() - record.last_heartbeat > AGENT_TTL_SECONDS:
            record.status = AgentStatus.UNRESPONSIVE

    return record


async def list_agents() -> List[AgentRecord]:
    """Lists all registered agents, updating status for unresponsive ones."""
    redis = await _get_redis_safe()
    if redis is None:
        return []

    agent_ids = await redis.smembers(AGENT_INDEX_KEY)
    agents = []
    stale_ids = []
    now = time.time()

    for agent_id in agent_ids:
        key = f"{AGENT_KEY_PREFIX}{agent_id}"
        raw = await redis.get(key)
        if raw is None:
            stale_ids.append(agent_id)
            continue
        
        record = AgentRecord.model_validate_json(raw)
        
        # Auto-detect unresponsiveness
        if record.status != AgentStatus.REVOKED:
            if now - record.last_heartbeat > AGENT_TTL_SECONDS:
                record.status = AgentStatus.UNRESPONSIVE
            
        agents.append(record)

    # Clean up stale index entries
    if stale_ids:
        await redis.srem(AGENT_INDEX_KEY, *stale_ids)

    return agents


async def revoke_agent(agent_id: str) -> bool:
    """
    Marks an agent as REVOKED. It can no longer:
    - Receive instructions
    - Send heartbeats
    The record is kept for audit purposes (long TTL).
    """
    redis = await _get_redis_safe()
    if redis is None:
        return False

    key = f"{AGENT_KEY_PREFIX}{agent_id}"
    raw = await redis.get(key)
    if raw is None:
        return False

    record = AgentRecord.model_validate_json(raw)
    record.status = AgentStatus.REVOKED

    # Keep revoked agents for 24h for audit
    await redis.set(key, record.model_dump_json(), ex=86400)

    logger.warning("agent_revoked", agent_id=agent_id)
    return True
