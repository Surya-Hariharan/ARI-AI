"""
Rate Limiting — L2 (Intent Cooldown) + L3 (Voice Session Lock) + Replay Protection.
All Redis-dependent checks degrade gracefully when Redis is unavailable.
"""
import time
from app.core.redis import get_redis
from app.domain.models import RequestContext, IncomingRequest, Decision, DecisionOutcome
from app.core.logger import logger
from fastapi import HTTPException, status

# Constants
L1_WINDOW_SECONDS = 60
L1_MAX_REQUESTS = 60
L3_VOICE_LOCK_SECONDS = 10


async def _get_redis_safe():
    """Returns Redis client or None if unavailable."""
    try:
        client = await get_redis()
        await client.ping()
        return client
    except Exception:
        return None


async def check_rate_limits(req: IncomingRequest, ctx: RequestContext):
    """
    Enforces Level 2 (Intent Cooldown) and Level 3 (Voice Lock).
    Returns None if allowed, Decision if denied.
    Degrades gracefully when Redis is unavailable (allows all requests).
    """
    redis = await _get_redis_safe()
    if redis is None:
        logger.debug("rate_limit_skipped", reason="Redis unavailable")
        return None

    # LEVEL 3: Voice Session Locking
    if req.type == "VOICE_COMMAND":
        lock_key = f"voice_lock:{ctx.device.device_id}"
        is_locked = await redis.get(lock_key)
        if is_locked:
            return Decision(
                outcome=DecisionOutcome.SILENT_DROP,
                reason="Voice session already active (L3 Lock)",
            )
        await redis.set(lock_key, "1", ex=L3_VOICE_LOCK_SECONDS)

    # LEVEL 2: Intent Cooldown
    if req.intent:
        cooldown_key = f"cooldown:{ctx.device.device_id}:{req.intent}"
        in_cooldown = await redis.get(cooldown_key)

        if in_cooldown:
            return Decision(
                outcome=DecisionOutcome.DENY,
                reason=f"Action cooldown active for {req.intent} (L2 Limit)",
            )
        await redis.set(cooldown_key, "1", ex=2)

    return None


async def check_replay_attack(nonce: str, timestamp: float, device_id: str):
    """
    Prevents Replay Attacks.
    Degrades gracefully when Redis is unavailable (skips nonce check but still validates timestamp).
    """
    # 1. Timestamp Freshness (always enforced — no Redis needed)
    now = time.time()
    if abs(now - timestamp) > 60:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request timestamp too old or in future",
        )

    # 2. Nonce Uniqueness (requires Redis)
    redis = await _get_redis_safe()
    if redis is None:
        logger.debug("replay_check_skipped", reason="Redis unavailable")
        return

    nonce_key = f"nonce:{device_id}:{nonce}"
    is_new = await redis.set(nonce_key, "1", nx=True, ex=300)

    if not is_new:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Replay detected (Nonce reused)",
        )
