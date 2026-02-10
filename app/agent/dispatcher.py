"""
Agent Dispatcher — creates signed instructions and manages the instruction queue.
The Control Plane dispatches; the Agent polls and executes.
"""
import json
import time
from typing import Optional, List
from app.core.redis import get_redis
from app.core.signing import create_signed_envelope, verify_envelope
from app.core.logger import logger
from app.agent.models import (
    InstructionEnvelope,
    ExecutionResult,
    ExecutionStatus,
)
from app.agent.registry import get_agent


# Redis key patterns
INSTRUCTION_QUEUE_PREFIX = "ari:instructions:"
RESULT_KEY_PREFIX = "ari:result:"
# Instructions expire after 5 minutes if not picked up
INSTRUCTION_TTL_SECONDS = 300


async def _get_redis_safe():
    """Returns Redis client or None if unavailable."""
    try:
        client = await get_redis()
        await client.ping()
        return client
    except Exception:
        return None


async def dispatch_instruction(
    agent_id: str,
    action_type: str,
    target: str,
    params: dict,
    ttl_seconds: int = 60,
) -> Optional[dict]:
    """
    Creates a signed instruction envelope and queues it for agent pickup.
    
    Returns the envelope dict on success, None on failure.
    The agent polls GET /agent/instructions/{agent_id} to retrieve it.
    """
    # 1. Verify agent exists and is not revoked
    agent = await get_agent(agent_id)
    if agent is None:
        logger.warning("dispatch_unknown_agent", agent_id=agent_id)
        return None

    from app.agent.models import AgentStatus
    if agent.status == AgentStatus.REVOKED:
        logger.warning("dispatch_revoked_agent", agent_id=agent_id)
        return None

    # 2. Create signed envelope using agent's per-agent key
    envelope = create_signed_envelope(
        agent_id=agent_id,
        action_type=action_type,
        target=target,
        params=params,
        ttl_seconds=ttl_seconds,
        signing_key=agent.signing_key,
    )
    instruction_id = envelope["instruction_id"]

    # 3. Queue in Redis (list-based queue per agent) AND Enforce Idempotency
    redis = await _get_redis_safe()
    if redis is None:
        logger.error("dispatch_redis_unavailable", agent_id=agent_id)
        return None

    # Idempotency check: Ensure this instruction ID hasn't been seen before
    # We store the ID with a 24h TTL to prevent replays/duplicates
    idempotency_key = f"ari:instruction_id:{instruction_id}"
    is_new = await redis.set(idempotency_key, "dispatched", ex=86400, nx=True)
    
    if not is_new:
         logger.warning("dispatch_duplicate_id_detected", instruction_id=instruction_id)
         return None

    queue_key = f"{INSTRUCTION_QUEUE_PREFIX}{agent_id}"
    await redis.rpush(queue_key, json.dumps(envelope))
    await redis.expire(queue_key, INSTRUCTION_TTL_SECONDS)

    logger.info(
        "instruction_dispatched",
        instruction_id=instruction_id,
        agent_id=agent_id,
        action_type=action_type,
    )

    return envelope


async def get_pending_instructions(agent_id: str) -> List[dict]:
    """
    Retrieves and removes all pending instructions for an agent.
    This is a destructive read — once polled, instructions are consumed.
    """
    redis = await _get_redis_safe()
    if redis is None:
        return []

    queue_key = f"{INSTRUCTION_QUEUE_PREFIX}{agent_id}"

    instructions = []
    while True:
        raw = await redis.lpop(queue_key)
        if raw is None:
            break
        try:
            instructions.append(json.loads(raw))
        except json.JSONDecodeError:
            logger.error("instruction_parse_error", raw=raw)

    if instructions:
        logger.info(
            "instructions_polled",
            agent_id=agent_id,
            count=len(instructions),
        )

    return instructions


async def record_result(result: ExecutionResult) -> bool:
    """
    Records an execution result reported by an agent.
    Stored in Redis for retrieval by the Control Plane.
    """
    redis = await _get_redis_safe()
    if redis is None:
        # Log to stdout as fallback
        logger.info(
            "execution_result_fallback",
            instruction_id=result.instruction_id,
            agent_id=result.agent_id,
            status=result.status.value,
        )
        return False

    key = f"{RESULT_KEY_PREFIX}{result.instruction_id}"
    await redis.set(key, result.model_dump_json(), ex=3600)  # Keep results for 1 hour

    logger.info(
        "execution_result_recorded",
        instruction_id=result.instruction_id,
        agent_id=result.agent_id,
        status=result.status.value,
    )

    return True
