"""
State Routes — API endpoints for system state management.
Only authenticated users with proper capabilities can transition state.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.domain.models import SystemState
from app.core.state import (
    get_system_state,
    transition_state,
    get_transition_map,
    InvalidTransitionError,
)
from app.core.security import get_current_user, TokenData
from app.core.logger import logger

router = APIRouter(prefix="/state", tags=["State Management"])


class TransitionRequest(BaseModel):
    new_state: SystemState
    force: bool = False  # Emergency override — requires admin


class StateResponse(BaseModel):
    device_id: str
    current_state: str
    allowed_transitions: list[str]


class TransitionResponse(BaseModel):
    device_id: str
    previous_state: str
    new_state: str
    forced: bool


@router.get("/{device_id}", response_model=StateResponse)
async def get_state(
    device_id: str,
    user: TokenData = Depends(get_current_user),
):
    """Query current system state and allowed transitions for a device."""
    info = await get_transition_map(device_id)
    return StateResponse(**info)


@router.post("/{device_id}/transition", response_model=TransitionResponse)
async def request_transition(
    device_id: str,
    request: TransitionRequest,
    user: TokenData = Depends(get_current_user),
):
    """
    Request a state transition for a device.
    Force transitions require 'admin' capability.
    """
    # Force transitions require admin
    if request.force and "admin" not in user.capabilities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Force transitions require admin capability",
        )

    current = await get_system_state(device_id)

    try:
        new = await transition_state(
            device_id=device_id,
            new_state=request.new_state,
            force=request.force,
        )
    except InvalidTransitionError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    return TransitionResponse(
        device_id=device_id,
        previous_state=current.value,
        new_state=new.value,
        forced=request.force,
    )
