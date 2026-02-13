"""
Heartbeat service - sends periodic heartbeats to control server
"""
import asyncio
import logging
from datetime import datetime

from core.config import settings
from core.state_machine import StateMachine

logger = logging.getLogger(__name__)


class HeartbeatService:
    """Sends periodic heartbeats to maintain connection"""
    
    def __init__(self, connection_service, state_machine: StateMachine):
        self.connection_service = connection_service
        self.state_machine = state_machine
        self.running = False
        self._task = None
    
    async def start(self):
        """Start the heartbeat service"""
        self.running = True
        self._task = asyncio.create_task(self._heartbeat_loop())
        logger.info("Heartbeat service started")
    
    async def stop(self):
        """Stop the heartbeat service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Heartbeat service stopped")
    
    async def _heartbeat_loop(self):
        """Main heartbeat loop"""
        while self.running:
            try:
                if self.connection_service.is_connected():
                    await self._send_heartbeat()
                
                await asyncio.sleep(settings.HEARTBEAT_INTERVAL)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
                await asyncio.sleep(5)
    
    async def _send_heartbeat(self):
        """Send a heartbeat message"""
        message = {
            "type": "heartbeat",
            "timestamp": datetime.utcnow().isoformat(),
            "status": self.state_machine.current_state.value
        }
        
        success = await self.connection_service.send_message(message)
        
        if success:
            logger.debug("Heartbeat sent")
        else:
            logger.warning("Failed to send heartbeat")
