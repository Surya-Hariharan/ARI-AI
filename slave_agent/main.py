"""
Slave Node Agent - Main Entry Point
Production-grade distributed agent with WebSocket connection to control server
"""
import asyncio
import logging
import signal
import sys

from core.config import settings
from core.state_machine import StateMachine, NodeState
from services.connection_service import ConnectionService
from services.heartbeat import HeartbeatService
from services.telemetry import TelemetryService
from services.command_executor import CommandExecutor

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('agent.log')
    ]
)
logger = logging.getLogger(__name__)


class SlaveNodeAgent:
    """Main agent orchestrator"""
    
    def __init__(self):
        self.state_machine = StateMachine()
        self.connection_service = None
        self.heartbeat_service = None
        self.telemetry_service = None
        self.command_executor = CommandExecutor()
        self.running = False
    
    async def start(self):
        """Start the agent"""
        logger.info(f"Starting Slave Node Agent - Node ID: {settings.NODE_ID}")
        logger.info(f"Control Server: {settings.CONTROL_SERVER_URL}")
        
        # Transition to BOOTING state
        self.state_machine.transition_to(NodeState.BOOTING)
        
        # Initialize services
        self.connection_service = ConnectionService(
            state_machine=self.state_machine,
            command_executor=self.command_executor
        )
        
        self.heartbeat_service = HeartbeatService(
            connection_service=self.connection_service,
            state_machine=self.state_machine
        )
        
        self.telemetry_service = TelemetryService(
            connection_service=self.connection_service
        )
        
        self.running = True
        
        # Start all services
        tasks = [
            asyncio.create_task(self.connection_service.start()),
            asyncio.create_task(self.heartbeat_service.start()),
            asyncio.create_task(self.telemetry_service.start()),
            asyncio.create_task(self._monitor_state())
        ]
        
        logger.info("All services started")
        
        # Wait for all tasks
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("Agent tasks cancelled")
    
    async def stop(self):
        """Stop the agent gracefully"""
        logger.info("Stopping Slave Node Agent")
        self.running = False
        
        # Stop all services
        if self.connection_service:
            await self.connection_service.stop()
        
        if self.heartbeat_service:
            await self.heartbeat_service.stop()
        
        if self.telemetry_service:
            await self.telemetry_service.stop()
        
        logger.info("Agent stopped gracefully")
    
    async def _monitor_state(self):
        """Monitor and log state transitions"""
        last_state = None
        
        while self.running:
            current_state = self.state_machine.current_state
            
            if current_state != last_state:
                logger.info(f"State transition: {last_state} → {current_state}")
                last_state = current_state
            
            await asyncio.sleep(1)


# Signal handlers for graceful shutdown
agent_instance = None


def signal_handler(sig, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {sig}, initiating graceful shutdown")
    if agent_instance:
        asyncio.create_task(agent_instance.stop())


async def main():
    """Main entry point"""
    global agent_instance
    
    agent_instance = SlaveNodeAgent()
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await agent_instance.start()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
    finally:
        await agent_instance.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Agent terminated")
