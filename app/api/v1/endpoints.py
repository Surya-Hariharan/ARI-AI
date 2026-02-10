from fastapi import APIRouter, HTTPException, Depends
from app.models import DeviceRegistration, SignedRequest, CommandResponse
from app.services.device_service import device_service
from app.core.auth import require_signed_request
from app.core.intent import intent_engine
from app.core.rate_limit import rate_limiter

router = APIRouter()

@router.post("/register", response_model=DeviceRegistration)
async def register_device(device: DeviceRegistration):
    """
    [v1] Registers a new Android device.
    """
    return device_service.register_device(device)

@router.post("/execute", response_model=CommandResponse)
async def execute_command(signed_request: SignedRequest):
    """
    [v1] Main execution endpoint.
    """
    # 1. Verify Signature
    payload = require_signed_request(signed_request)
    
    # 0. Rate Limit Check
    device_id = signed_request.public_key[-32:] 
    if not rate_limiter.is_allowed(device_id):
         raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # 2. Extract Command
    command_text = payload.get("command", "")
    device_context = payload.get("context", {})

    # 3. Process Intent
    response = intent_engine.process_command(command_text, device_context)
    
    return response
