from enum import Enum
from pydantic import BaseModel

class SystemState(str, Enum):
    NORMAL = "NORMAL"         # Full functionality
    DEGRADED = "DEGRADED"     # Some external services down (e.g. LLM/Search)
    READ_ONLY = "READ_ONLY"   # No state changes allowed
    LOCAL_ONLY = "LOCAL_ONLY" # Backend unreachable/maintenance, device should process locally if possible (though Architecture says Backend decides)

class StateManager:
    def __init__(self):
        self._current_state = SystemState.NORMAL
    
    @property
    def current_state(self) -> SystemState:
        return self._current_state

    def set_state(self, new_state: SystemState):
        print(f"System State Transition: {self._current_state} -> {new_state}")
        self._current_state = new_state

    def check_health(self):
        # In a real system, this would ping DB, Redis, LLM APIs etc.
        # For now, we assume NORMAL unless manually toggled.
        pass

# Global state instance
state_manager = StateManager()
