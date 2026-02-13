"""
WebSocket connection manager for slave nodes
Handles persistent connections, message routing, and connection lifecycle
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from typing import Dict, Optional
import asyncio
import json
import logging
from datetime import datetime

from app.core.security import verify_token
from app.core.database import SessionLocal
from app.models.node import Node, NodeStatus
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for slave nodes"""
    
    def __init__(self):
        # Active WebSocket connections: {node_id: websocket}
        self.active_connections: Dict[str, WebSocket] = {}
        # Message queues for each node: {node_id: asyncio.Queue}
        self.message_queues: Dict[str, asyncio.Queue] = {}
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
    
    async def connect(self, node_id: str, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        
        async with self._lock:
            # Disconnect existing connection if any
            if node_id in self.active_connections:
                logger.warning(f"Node {node_id} reconnecting, closing old connection")
                await self.disconnect(node_id)
            
            self.active_connections[node_id] = websocket
            self.message_queues[node_id] = asyncio.Queue()
            
        logger.info(f"Node {node_id} connected. Total connections: {len(self.active_connections)}")
        
        # Update node status in database
        await self._update_node_status(node_id, NodeStatus.ACTIVE)
    
    async def disconnect(self, node_id: str):
        """Remove a WebSocket connection"""
        async with self._lock:
            if node_id in self.active_connections:
                ws = self.active_connections[node_id]
                try:
                    await ws.close()
                except Exception as e:
                    logger.error(f"Error closing WebSocket for {node_id}: {e}")
                
                del self.active_connections[node_id]
                
                if node_id in self.message_queues:
                    del self.message_queues[node_id]
        
        logger.info(f"Node {node_id} disconnected. Total connections: {len(self.active_connections)}")
        
        # Update node status
        await self._update_node_status(node_id, NodeStatus.OFFLINE)
    
    async def disconnect_all(self):
        """Disconnect all nodes gracefully"""
        node_ids = list(self.active_connections.keys())
        for node_id in node_ids:
            await self.disconnect(node_id)
    
    async def send_to_node(self, node_id: str, message: dict):
        """Send a message to a specific node"""
        if node_id in self.active_connections:
            websocket = self.active_connections[node_id]
            try:
                await websocket.send_json(message)
                logger.debug(f"Sent message to {node_id}: {message.get('type')}")
                return True
            except Exception as e:
                logger.error(f"Error sending to {node_id}: {e}")
                await self.disconnect(node_id)
                return False
        else:
            logger.warning(f"Node {node_id} not connected")
            return False
    
    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        """Broadcast message to all connected nodes"""
        disconnected = []
        
        for node_id, websocket in self.active_connections.items():
            if exclude and node_id == exclude:
                continue
            
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {node_id}: {e}")
                disconnected.append(node_id)
        
        # Clean up disconnected nodes
        for node_id in disconnected:
            await self.disconnect(node_id)
    
    def is_connected(self, node_id: str) -> bool:
        """Check if a node is connected"""
        return node_id in self.active_connections
    
    async def _update_node_status(self, node_id: str, status: NodeStatus):
        """Update node status in database"""
        db = SessionLocal()
        try:
            node = db.query(Node).filter(Node.id == node_id).first()
            if node:
                node.status = status
                node.last_seen = datetime.utcnow()
                db.commit()
        except Exception as e:
            logger.error(f"Error updating node status: {e}")
            db.rollback()
        finally:
            db.close()


# Global connection manager instance
connection_manager = ConnectionManager()


@router.websocket("/node/{node_id}")
async def websocket_endpoint(websocket: WebSocket, node_id: str, token: Optional[str] = None):
    """
    WebSocket endpoint for slave node connections
    Requires JWT token for authentication
    """
    
    # Authenticate via query parameter or first message
    if not token:
        try:
            await websocket.accept()
            auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            token = auth_msg.get("token")
        except asyncio.TimeoutError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        except Exception:
            await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
            return
    else:
        # Token provided in query params, accept connection
        pass
    
    # Verify token
    payload = verify_token(token)
    if not payload or payload.get("sub") != node_id or payload.get("type") != "node":
        logger.warning(f"Authentication failed for node {node_id}")
        if not websocket.client_state.name == "DISCONNECTED":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Connect the node
    if token and websocket.client_state.name != "CONNECTED":
        await connection_manager.connect(node_id, websocket)
    elif websocket.client_state.name != "CONNECTED":
        await connection_manager.connect(node_id, websocket)
    
    # Send welcome message
    await websocket.send_json({
        "type": "connected",
        "message": "Connected to control server",
        "node_id": node_id
    })
    
    try:
        # Message handling loop
        while True:
            # Receive message from node
            data = await websocket.receive_json()
            
            message_type = data.get("type")
            
            if message_type == "heartbeat":
                # Update last heartbeat
                db = SessionLocal()
                try:
                    node = db.query(Node).filter(Node.id == node_id).first()
                    if node:
                        node.last_heartbeat = datetime.utcnow()
                        node.last_seen = datetime.utcnow()
                        node.status = NodeStatus.ACTIVE
                        db.commit()
                except Exception as e:
                    logger.error(f"Error updating heartbeat: {e}")
                    db.rollback()
                finally:
                    db.close()
                
                # Send heartbeat acknowledgment
                await websocket.send_json({"type": "heartbeat_ack"})
            
            elif message_type == "telemetry":
                # Handle telemetry data
                logger.debug(f"Received telemetry from {node_id}")
                # Could store in database or forward to monitoring system
            
            elif message_type == "command_result":
                # Handle command execution result
                command_id = data.get("command_id")
                result = data.get("result")
                error = data.get("error")
                
                logger.info(f"Command {command_id} result from {node_id}")
                
                # Update command in database
                db = SessionLocal()
                try:
                    from app.models.node import Command
                    command = db.query(Command).filter(Command.id == command_id).first()
                    if command:
                        command.status = "completed" if not error else "failed"
                        command.result = result
                        command.error = error
                        command.completed_at = datetime.utcnow()
                        db.commit()
                except Exception as e:
                    logger.error(f"Error updating command result: {e}")
                    db.rollback()
                finally:
                    db.close()
            
            elif message_type == "status_update":
                # Handle node status update
                new_status = data.get("status")
                logger.info(f"Node {node_id} status update: {new_status}")
                
                db = SessionLocal()
                try:
                    node = db.query(Node).filter(Node.id == node_id).first()
                    if node and new_status in [s.value for s in NodeStatus]:
                        node.status = NodeStatus(new_status)
                        db.commit()
                except Exception as e:
                    logger.error(f"Error updating node status: {e}")
                    db.rollback()
                finally:
                    db.close()
            
            else:
                logger.warning(f"Unknown message type from {node_id}: {message_type}")
    
    except WebSocketDisconnect:
        logger.info(f"Node {node_id} disconnected normally")
        await connection_manager.disconnect(node_id)
    
    except Exception as e:
        logger.error(f"Error in WebSocket handler for {node_id}: {e}")
        await connection_manager.disconnect(node_id)
