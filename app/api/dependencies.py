from fastapi import Depends, Request
from datetime import datetime, timezone
from app.core.security import get_current_user, TokenData
from app.domain.models import RequestContext, DeviceContext, SystemState

async def get_request_context(
    request: Request,
    user: TokenData = Depends(get_current_user)
) -> RequestContext:
    
    # Extract device info from headers or token
    device_id = request.headers.get("X-Device-ID", "unknown")
    
    # Construct Context
    ctx = RequestContext(
        request_id=request.state.request_id,
        timestamp=datetime.now(timezone.utc),
        state=SystemState.ACTIVE, # TODO: Fetch from Redis
        device=DeviceContext(
            device_id=device_id,
            user_id=user.username
        ),
        permissions=user.capabilities
    )
    return ctx
