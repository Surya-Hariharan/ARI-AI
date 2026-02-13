"""
Node state machine implementation
Manages state transitions: BOOTING → CONNECTING → ACTIVE → DEGRADED → OFFLINE
"""
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class NodeState(str, Enum):
    """Possible node states"""
    BOOTING = "BOOTING"
    CONNECTING = "CONNECTING"
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"


class StateMachine:
    """Manages node state transitions"""
    
    # Valid state transitions
    VALID_TRANSITIONS = {
        NodeState.BOOTING: [NodeState.CONNECTING, NodeState.OFFLINE],
        NodeState.CONNECTING: [NodeState.ACTIVE, NodeState.OFFLINE],
        NodeState.ACTIVE: [NodeState.DEGRADED, NodeState.OFFLINE, NodeState.CONNECTING],
        NodeState.DEGRADED: [NodeState.ACTIVE, NodeState.OFFLINE, NodeState.CONNECTING],
        NodeState.OFFLINE: [NodeState.CONNECTING, NodeState.BOOTING]
    }
    
    def __init__(self):
        self._current_state = NodeState.OFFLINE
        self._previous_state = None
    
    @property
    def current_state(self) -> NodeState:
        """Get current state"""
        return self._current_state
    
    @property
    def previous_state(self) -> NodeState:
        """Get previous state"""
        return self._previous_state
    
    def transition_to(self, new_state: NodeState) -> bool:
        """
        Attempt to transition to a new state
        Returns True if transition is valid and completed
        """
        if new_state == self._current_state:
            return True
        
        if new_state not in self.VALID_TRANSITIONS.get(self._current_state, []):
            logger.warning(
                f"Invalid state transition: {self._current_state} → {new_state}"
            )
            return False
        
        logger.info(f"State transition: {self._current_state} → {new_state}")
        self._previous_state = self._current_state
        self._current_state = new_state
        
        return True
    
    def can_transition_to(self, new_state: NodeState) -> bool:
        """Check if transition to new state is valid"""
        return new_state in self.VALID_TRANSITIONS.get(self._current_state, [])
    
    def is_connected(self) -> bool:
        """Check if node is in a connected state"""
        return self._current_state in [NodeState.ACTIVE, NodeState.DEGRADED]
    
    def is_operational(self) -> bool:
        """Check if node is operational"""
        return self._current_state == NodeState.ACTIVE
