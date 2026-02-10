from typing import Dict, Any, Optional
from pydantic import BaseModel
from app.models import CommandResponse
from .state import state_manager, SystemState

class IntentEngine:
    def process_command(self, command_text: str, device_context: Dict[str, Any]) -> CommandResponse:
        """
        Parses raw text into a structured command for the Android slave.
        """
        # Check system state first
        if state_manager.current_state == SystemState.READ_ONLY:
            return CommandResponse(
                action="SPEAK",
                tts_response="System is in read-only mode. I cannot perform actions right now.",
                status="DENY"
            )

        cmd = command_text.lower().strip()

        # 1. Flashlight
        if "flashlight" in cmd or "torch" in cmd:
            if "on" in cmd:
                return CommandResponse(action="FLASHLIGHT_ON", tts_response="Turning flashlight on.")
            elif "off" in cmd:
                return CommandResponse(action="FLASHLIGHT_OFF", tts_response="Turning flashlight off.")
            else:
                return CommandResponse(action="FLASHLIGHT_TOGGLE", tts_response="Toggling flashlight.")

        # 2. Volume
        if "volume" in cmd:
            if "up" in cmd or "loud" in cmd:
                return CommandResponse(action="VOLUME_UP", tts_response="Turning volume up.")
            elif "down" in cmd or "quiet" in cmd:
                return CommandResponse(action="VOLUME_DOWN", tts_response="Turning volume down.")
            elif "mute" in cmd:
                return CommandResponse(action="VOLUME_MUTE", tts_response="Muting volume.")

        # 3. Time/Battery (Local info)
        if "battery" in cmd:
             return CommandResponse(action="GET_BATTERY", tts_response="Checking battery level.")

        # Default / Fallback
        return CommandResponse(
            action="SPEAK",
            tts_response=f"I heard '{command_text}', but I don't know how to do that yet.",
            status="DENY"
        )

# Global intent engine
intent_engine = IntentEngine()
