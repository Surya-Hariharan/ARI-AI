from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any
import time

class DeviceRegistration(BaseModel):
    device_id: str = Field(..., description="Unique hardware ID of the Android device")
    public_key: str = Field(..., description="PEM encoded public key")
    model: str = Field(..., description="Device model name (e.g. Pixel 8)")
    android_version: str = Field(..., description="Android SDK version")

class SignedRequest(BaseModel):
    payload: Dict[str, Any] = Field(..., description="The actual request data")
    signature: str = Field(..., description="Hex-encoded signature of the payload")
    public_key: str = Field(..., description="Public key matching the signature")
    timestamp: int = Field(..., description="Unix timestamp of the request")

    @validator('timestamp')
    def validate_timestamp(cls, v):
        # Replay protection: Request must be within last 60 seconds
        current_time = int(time.time())
        if abs(current_time - v) > 60:
            raise ValueError("Request timestamp too old or in future")
        return v
