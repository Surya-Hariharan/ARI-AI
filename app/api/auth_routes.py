"""
Auth Routes — Login endpoint for token generation.
In production, replace with Keycloak/Auth0 integration.
"""
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.core.security import (
    create_access_token,
    verify_password,
    get_password_hash,
)
from app.config import settings

router = APIRouter(tags=["Auth"])

# ============================================================
# DEV-ONLY: In-memory user store
# Replace with Keycloak/Auth0 or a Postgres user table in production
# ============================================================
DEV_USERS = {
    "admin": {
        "password_hash": get_password_hash("admin123"),
        "capabilities": ["admin", "intent.turn_on_light", "intent.system_status", "intent.speak"],
    },
    "user": {
        "password_hash": get_password_hash("user123"),
        "capabilities": ["intent.turn_on_light", "intent.system_status"],
    },
}


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login/access-token", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Authenticate and return a JWT token.
    
    DEV CREDENTIALS:
    - admin / admin123 (full access)
    - user / user123 (limited access)
    """
    user = DEV_USERS.get(request.username)
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token = create_access_token(
        data={
            "sub": request.username,
            "caps": user["capabilities"],
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return TokenResponse(access_token=token)
