from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import uvicorn

from app.models import DeviceRegistration, SignedRequest
from app.services.device_service import device_service
from app.core.auth import require_signed_request
from app.core.intent import intent_engine, CommandResponse
from app.core.state import state_manager
from app.db.supabase import get_supabase

app = FastAPI(
    title="ARI Master Node",
    description="Backend control plane for ARI Android Assistant",
    version="1.1.0"
)

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

class HealthCheck(BaseModel):
    status: str = "OK"
    node_type: str = "MASTER"
    registered_devices: int
    db_status: str = "UNKNOWN"

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

@app.post("/register", response_model=DeviceRegistration)
async def register_device(device: DeviceRegistration):
    """
    Registers a new Android device. 
    In production, this might need an initial proof-of-trust or be open for clean installs.
    """
    return device_service.register_device(device)

from app.core.rate_limit import rate_limiter

@app.post("/execute", response_model=CommandResponse)
async def execute_command(signed_request: SignedRequest):
    """
    Main execution endpoint.
    1. Verifies signature (Auth)
    2. Parses intent (Logic)
    3. Checks State Machine (Safety)
    4. Returns executable action (Slave Command)
    """
    # 1. Verify Signature
    payload = require_signed_request(signed_request)
    
    # 0. Rate Limit Check (After auth to identify device by key/ID)
    # In a real app, we'd map public_key to device_id efficiently.
    # Here we assume payload has device_context or we use the public_key as ID
    device_id = signed_request.public_key[-32:] # continuous hash proxy
    if not rate_limiter.is_allowed(device_id):
         raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # 2. Extract Command
    command_text = payload.get("command", "")
    device_context = payload.get("context", {})

    # 3. Process Intent
    response = intent_engine.process_command(command_text, device_context)
    
    return response

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
