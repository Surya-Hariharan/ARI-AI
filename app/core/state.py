"""
System State Machine — Redis-backed state management.
Only the Control Plane transitions state. All transitions are validated and logged.
Degrades gracefully when Redis is unavailable.
"""
import time
from typing import Optional
from app.domain.models import SystemState
from app.core.redis import get_redis
from app.core.logger import logger


# ─── Valid Transition Map ───────────────────────────────────────
# Every key maps to the set of states it is ALLOWED to move to.
# Any transition not in this map is DENIED.

VALID_TRANSITIONS: dict[SystemState, set[SystemState]] = {
    SystemState.IDLE:       {SystemState.LISTENING, SystemState.STANDBY},
    SystemState.LISTENING:  {SystemState.PROCESSING, SystemState.IDLE},
    SystemState.PROCESSING: {SystemState.EXECUTED, SystemState.DENIED, SystemState.DEGRADED},
    SystemState.EXECUTED:   {SystemState.IDLE},
    SystemState.DENIED:     {SystemState.IDLE},
    SystemState.DEGRADED:   {SystemState.IDLE, SystemState.STANDBY},
    SystemState.STANDBY:    {SystemState.IDLE},
}

# Redis key prefix for state storage
STATE_KEY_PREFIX = "ari:state:"
# State TTL — states auto-expire to prevent stale locks (24 hours)
STATE_TTL_SECONDS = 86400


class InvalidTransitionError(Exception):
    """Raised when a state transition violates the valid transitions map."""
    def __init__(self, current: SystemState, requested: SystemState):
        self.current = current
        self.requested = requested
        super().__init__(
            f"Invalid state transition: {current.value} → {requested.value}"
        )


async def _get_redis_safe():
    """Returns Redis client or None if unavailable."""
    try:
        client = await get_redis()
        await client.ping()
        return client
    except Exception:
        return None


async def get_system_state(device_id: str) -> SystemState:
    """
    Reads current system state for a device from Redis.
    Returns IDLE if no state exists, DEGRADED if Redis unavailable.
    """
    redis = await _get_redis_safe()
    if redis is None:
        logger.warning("state_degraded", device_id=device_id, reason="Redis unavailable")
        return SystemState.DEGRADED

    key = f"{STATE_KEY_PREFIX}{device_id}"
    try:
        raw = await redis.get(key)
        if raw is None:
            return SystemState.IDLE
        return SystemState(raw)
    except (ValueError, KeyError):
        logger.error("state_corrupt", device_id=device_id, raw_value=raw)
        return SystemState.IDLE


async def transition_state(
    device_id: str,
    new_state: SystemState,
    force: bool = False,
) -> SystemState:
    """
    Transitions device to a new state.
    Validates the transition against VALID_TRANSITIONS.
    Set force=True to bypass validation (emergency use only — logged as warning).
    Returns the new state on success.
    Raises InvalidTransitionError on invalid transition.
    """
    current = await get_system_state(device_id)

    # Validate transition
    if not force:
        allowed = VALID_TRANSITIONS.get(current, set())
        if new_state not in allowed:
            logger.warning(
                "state_transition_denied",
                device_id=device_id,
                current=current.value,
                requested=new_state.value,
                allowed=[s.value for s in allowed],
            )
            raise InvalidTransitionError(current, new_state)
    else:
        logger.warning(
            "state_transition_forced",
            device_id=device_id,
            current=current.value,
            new=new_state.value,
        )

    # Write to Redis
    redis = await _get_redis_safe()
    if redis is None:
        logger.error("state_write_failed", device_id=device_id, reason="Redis unavailable")
        raise RuntimeError("Cannot transition state: Redis unavailable")

    key = f"{STATE_KEY_PREFIX}{device_id}"
    await redis.set(key, new_state.value, ex=STATE_TTL_SECONDS)

    logger.info(
        "state_transitioned",
        device_id=device_id,
        from_state=current.value,
        to_state=new_state.value,
        forced=force,
    )
    return new_state


async def get_transition_map(device_id: str) -> dict:
    """Returns current state and allowed next transitions for a device."""
    current = await get_system_state(device_id)
    allowed = VALID_TRANSITIONS.get(current, set())
    return {
        "device_id": device_id,
        "current_state": current.value,
        "allowed_transitions": [s.value for s in allowed],
    }
