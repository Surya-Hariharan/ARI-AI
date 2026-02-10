from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from app.models import DeviceRegistration, SignedRequest, CommandResponse
from app.services.device_service import device_service
from app.core.auth import require_signed_request
from app.core.intent import intent_engine
from app.core.rate_limit import rate_limiter
from app.core.state import state_manager
from app.db.supabase import get_supabase
from app.api.v1.endpoints import router as api_v1_router
from app.services.config_service import config_service

app = FastAPI(
    title="ARI Master Node",
    description="Backend control plane for ARI Android Assistant",
    version="1.2.0"
)

# Mount Versioned API
app.include_router(api_v1_router, prefix="/api/v1")

@app.on_event("startup")
async def startup_event():
    """
    Check external dependencies on startup.
    Non-blocking: If Supabase fails, we log it and continue in DEGRADED mode if needed.
    """
    supabase = get_supabase()
    if supabase:
        print("✅ Supabase Client Initialized")
    else:
        print("⚠️ Supabase Client Unavailable - Running in DEGRADED mode")
        state_manager.set_state("DEGRADED")
    
    print(f"🚀 ARI Master Node Started. Kill Switch: {config_service.get_flag('KILL_SWITCH')}")

class HealthCheck(BaseModel):
    status: str = "OK"
    node_type: str = "MASTER"
    registered_devices: int
    db_status: str = "UNKNOWN"
    api_version: str = "v1"

@app.get("/", response_model=HealthCheck)
async def health_check():
    """
    Basic health check to verify Master Node is online and reachable.
    """
    supabase_status = "CONNECTED" if get_supabase() else "DISCONNECTED"
    return HealthCheck(
        status="OK", 
        node_type="MASTER",
        registered_devices=len(device_service.devices),
        db_status=supabase_status
    )

# --- Legacy / Deprecated Endpoints (Backward Compatibility) ---

@app.post("/register", response_model=DeviceRegistration, deprecated=True)
async def register_device_legacy(device: DeviceRegistration):
    """
    [DEPRECATED] Use /api/v1/register instead.
    """
    return device_service.register_device(device)

@app.post("/execute", response_model=CommandResponse, deprecated=True)
async def execute_command_legacy(signed_request: SignedRequest):
    """
    [DEPRECATED] Use /api/v1/execute instead.
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
