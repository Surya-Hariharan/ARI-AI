"""
WebSocket connection service
Maintains persistent connection to control server with exponential backoff
"""
import asyncio
import websockets
import json
import logging
from typing import Optional
import aiohttp

from core.config import settings
from core.state_machine import StateMachine, NodeState
from services.command_executor import CommandExecutor

logger = logging.getLogger(__name__)


class ConnectionService:
    """Manages WebSocket connection to control server"""
    
    def __init__(self, state_machine: StateMachine, command_executor: CommandExecutor):
        self.state_machine = state_machine
        self.command_executor = command_executor
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.running = False
        self.reconnect_delay = settings.WS_RECONNECT_DELAY_BASE
        self.reconnect_attempts = 0
    
    async def start(self):
        """Start the connection service"""
        self.running = True
        
        # Register or re-register with control server
        await self._register_node()
        
        # Start connection loop
        while self.running:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Connection error: {e}")
                self.state_machine.transition_to(NodeState.OFFLINE)
                
                # Exponential backoff
                await asyncio.sleep(self.reconnect_delay)
                self.reconnect_delay = min(
                    self.reconnect_delay * 2,
                    settings.WS_RECONNECT_DELAY_MAX
                )
                self.reconnect_attempts += 1
                
                if settings.WS_RECONNECT_MAX_ATTEMPTS > 0 and \
                   self.reconnect_attempts >= settings.WS_RECONNECT_MAX_ATTEMPTS:
                    logger.error("Max reconnect attempts reached, stopping")
                    break
    
    async def stop(self):
        """Stop the connection service"""
        self.running = False
        if self.websocket:
            await self.websocket.close()
    
    async def _register_node(self):
        """Register node with control server"""
        logger.info("Registering with control server")
        
        registration_data = {
            "hardware_id": settings.HARDWARE_ID,
            "hostname": settings.HOSTNAME,
            "name": f"agent-{settings.HOSTNAME}",
            "metadata": {
                "agent_version": "1.0.0"
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{settings.CONTROL_SERVER_HTTP}/api/v1/nodes/register",
                    json=registration_data
                ) as response:
                    if response.status == 201 or response.status == 200:
                        data = await response.json()
                        settings.NODE_ID = data["node_id"]
                        settings.NODE_TOKEN = data["token"]
                        logger.info(f"Registration successful - Node ID: {settings.NODE_ID}")
                    else:
                        error = await response.text()
                        logger.error(f"Registration failed: {error}")
                        raise Exception("Registration failed")
        
        except Exception as e:
            logger.error(f"Registration error: {e}")
            raise
    
    async def _connect_and_listen(self):
        """Connect to WebSocket and listen for messages"""
        if not settings.NODE_ID or not settings.NODE_TOKEN:
            logger.error("Node not registered, cannot connect")
            return
        
        self.state_machine.transition_to(NodeState.CONNECTING)
        
        ws_url = f"{settings.CONTROL_SERVER_URL}/ws/node/{settings.NODE_ID}"
        
        logger.info(f"Connecting to {ws_url}")
        
        async with websockets.connect(ws_url) as websocket:
            self.websocket = websocket
            
            # Send authentication
            await websocket.send(json.dumps({
                "token": settings.NODE_TOKEN
            }))
            
            # Wait for connection confirmation
            welcome_msg = await websocket.recv()
            welcome_data = json.loads(welcome_msg)
            
            if welcome_data.get("type") == "connected":
                logger.info("Connected to control server")
                self.state_machine.transition_to(NodeState.ACTIVE)
                self.reconnect_delay = settings.WS_RECONNECT_DELAY_BASE
                self.reconnect_attempts = 0
            
            # Message handling loop
            while self.running:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    await self._handle_message(json.loads(message))
                except asyncio.TimeoutError:
                    continue
                except websockets.exceptions.ConnectionClosed:
                    logger.warning("WebSocket connection closed")
                    break
    
    async def _handle_message(self, data: dict):
        """Handle incoming message from control server"""
        message_type = data.get("type")
        
        logger.debug(f"Received message: {message_type}")
        
        if message_type == "command":
            # Execute command
            command_id = data.get("command_id")
            command_type = data.get("command_type")
            payload = data.get("payload", {})
            signature = data.get("signature")
            
            logger.info(f"Received command: {command_type} (ID: {command_id})")
            
            # Execute command asynchronously
            asyncio.create_task(self._execute_command(command_id, command_type, payload))
        
        elif message_type == "heartbeat_ack":
            # Heartbeat acknowledged
            pass
        
        elif message_type == "ping":
            # Respond to ping
            await self.send_message({"type": "pong"})
        
        else:
            logger.warning(f"Unknown message type: {message_type}")
    
    async def _execute_command(self, command_id: str, command_type: str, payload: dict):
        """Execute a command and send result"""
        try:
            result = await self.command_executor.execute(command_type, payload)
            
            # Send result back to server
            await self.send_message({
                "type": "command_result",
                "command_id": command_id,
                "result": result,
                "error": None
            })
            
            logger.info(f"Command {command_id} completed successfully")
        
        except Exception as e:
            logger.error(f"Command {command_id} failed: {e}")
            
            # Send error back to server
            await self.send_message({
                "type": "command_result",
                "command_id": command_id,
                "result": None,
                "error": str(e)
            })
    
    async def send_message(self, data: dict) -> bool:
        """Send a message to the control server"""
        if not self.websocket or not self.state_machine.is_connected():
            logger.warning("Cannot send message, not connected")
            return False
        
        try:
            await self.websocket.send(json.dumps(data))
            return True
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            return False
    
    def is_connected(self) -> bool:
        """Check if currently connected"""
        return self.websocket is not None and self.state_machine.is_connected()
