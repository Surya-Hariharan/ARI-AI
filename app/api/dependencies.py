from fastapi import Depends, Request
from datetime import datetime, timezone
from app.core.security import get_current_user, TokenData
from app.domain.models import RequestContext, DeviceContext, SystemState
from app.domain.oem_rules import infer_oem_from_user_agent
from app.core.rate_limit import check_replay_attack
from app.core.state import get_system_state

async def get_request_context(
    request: Request,
    user: TokenData = Depends(get_current_user)
) -> RequestContext:
    
    # Extract device info from headers or token
    device_id = request.headers.get("X-Device-ID", "unknown")
    user_agent = request.headers.get("User-Agent", "")
    nonce = request.headers.get("X-Nonce", "")
    try:
        ts = float(request.headers.get("X-Timestamp", "0"))
    except ValueError:
        ts = 0.0
        
    # Replay Protection (Critical)
    if nonce and ts > 0:
        await check_replay_attack(nonce, ts, device_id)
        
    oem = infer_oem_from_user_agent(user_agent)

    # Fetch live system state from Redis (not hardcoded)
    current_state = await get_system_state(device_id)
    
    # Construct Context
    ctx = RequestContext(
        request_id=request.state.request_id,
        timestamp=datetime.now(timezone.utc),
        state=current_state,
        device=DeviceContext(
            device_id=device_id,
            user_id=user.username,
            oem=oem
        ),
        permissions=user.capabilities
    )
    return ctx
