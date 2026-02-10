import time
from app.core.redis import get_redis
from app.domain.models import RequestContext, IncomingRequest, Decision, DecisionOutcome
from fastapi import HTTPException, status

# Constants
L1_WINDOW_SECONDS = 60
L1_MAX_REQUESTS = 60 # 1 req/sec per device roughly
L3_VOICE_LOCK_SECONDS = 10 # Max voice session duration

async def check_rate_limits(req: IncomingRequest, ctx: RequestContext):
    """
    Enforces Level 2 (Intent Cooldown) and Level 3 (Voice Lock).
    Returns None if allowed, raises HTTPException or returns Decision (depending on arch) if denied.
    """
    redis = await get_redis()
    
    # LEVEL 3: Voice Session Locking
    # Only one active voice session per device at a time.
    if req.type == "VOICE_COMMAND":
        lock_key = f"voice_lock:{ctx.device.device_id}"
        # Try to acquire lock
        is_locked = await redis.get(lock_key)
        if is_locked:
             # If locked, DENY
             return Decision(
                 outcome=DecisionOutcome.SILENT_DROP,
                 reason="Voice session already active (L3 Lock)",
             )
        
        # Acquire lock (auto-expire)
        await redis.set(lock_key, "1", ex=L3_VOICE_LOCK_SECONDS)

    # LEVEL 2: Intent Cooldown
    # Prevent spamming specific heavy actions
    if req.intent:
        cooldown_key = f"cooldown:{ctx.device.device_id}:{req.intent}"
        in_cooldown = await redis.get(cooldown_key)
        
        if in_cooldown:
            return Decision(
                outcome=DecisionOutcome.DENY,
                reason=f"Action cooldown active for {req.intent} (L2 Limit)",
            )
            
        # Set cooldown based on intent type (could be dynamic)
        # For now, default 2 seconds for everything
        await redis.set(cooldown_key, "1", ex=2)
        
    return None

async def check_replay_attack(nonce: str, timestamp: float, device_id: str):
    """
    Prevents Replay Attacks.
    1. Check timestamp freshness.
    2. Check if nonce is recently used.
    """
    # 1. Timestamp Freshness (e.g., must be within 60 seconds)
    now = time.time()
    if abs(now - timestamp) > 60:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request timestamp too old or in future"
        )
        
    # 2. Nonce Uniqueness
    redis = await get_redis()
    nonce_key = f"nonce:{device_id}:{nonce}"
    
    # SETNX (Set if Not Exists) - Atomic
    is_new = await redis.set(nonce_key, "1", nx=True, ex=300) # 5 min TTL
    
    if not is_new:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Replay detected (Nonce reused)"
        )
