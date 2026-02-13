"""
API routes for command dispatch and management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import logging
from datetime import datetime

from app.core.database import get_db
from app.core.security import sign_payload
from app.models.node import Command, Node, NodeStatus
from app.schemas.node import CommandRequest, CommandResponse
from app.websocket.connection_manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/execute", response_model=CommandResponse)
async def execute_command(request: CommandRequest, db: Session = Depends(get_db)):
    """
    Execute a command on a slave node
    Supported commands: ping, system_info, restart_agent, custom_task
    """
    
    # Verify node exists
    node = db.query(Node).filter(Node.id == request.node_id).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {request.node_id} not found"
        )
    
    # Check if node is online
    if not connection_manager.is_connected(request.node_id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Node {request.node_id} is not connected"
        )
    
    # Create command record
    command_id = str(uuid.uuid4())
    
    command_payload = {
        "command_id": command_id,
        "type": request.command_type,
        "payload": request.payload,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Sign the command
    signature = sign_payload(command_payload)
    
    command = Command(
        id=command_id,
        node_id=request.node_id,
        command_type=request.command_type,
        payload=request.payload,
        signature=signature,
        status="sent",
        sent_at=datetime.utcnow()
    )
    
    db.add(command)
    node.total_commands += 1
    db.commit()
    
    # Send command to node via WebSocket
    message = {
        "type": "command",
        "command_id": command_id,
        "command_type": request.command_type,
        "payload": request.payload,
        "signature": signature
    }
    
    success = await connection_manager.send_to_node(request.node_id, message)
    
    if not success:
        command.status = "failed"
        command.error = "Failed to send command to node"
        node.failed_commands += 1
        db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send command to node"
        )
    
    logger.info(f"Command {command_id} sent to node {request.node_id}")
    
    return CommandResponse(
        command_id=command_id,
        node_id=request.node_id,
        command_type=request.command_type,
        status="sent",
        message="Command sent successfully"
    )


@router.get("/{command_id}")
async def get_command_status(command_id: str, db: Session = Depends(get_db)):
    """Get the status and result of a command"""
    command = db.query(Command).filter(Command.id == command_id).first()
    
    if not command:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Command {command_id} not found"
        )
    
    return {
        "command_id": command.id,
        "node_id": command.node_id,
        "command_type": command.command_type,
        "status": command.status,
        "result": command.result,
        "error": command.error,
        "created_at": command.created_at,
        "sent_at": command.sent_at,
        "completed_at": command.completed_at
    }


@router.get("/node/{node_id}/history")
async def get_node_command_history(
    node_id: str,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get command execution history for a node"""
    commands = db.query(Command).filter(
        Command.node_id == node_id
    ).order_by(
        Command.created_at.desc()
    ).limit(limit).all()
    
    return commands


@router.post("/broadcast")
async def broadcast_command(request: CommandRequest, db: Session = Depends(get_db)):
    """
    Broadcast a command to all connected nodes
    Use with caution!
    """
    
    # Get all active nodes
    active_nodes = db.query(Node).filter(
        Node.status == NodeStatus.ACTIVE
    ).all()
    
    if not active_nodes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active nodes found"
        )
    
    results = []
    
    for node in active_nodes:
        if not connection_manager.is_connected(node.id):
            continue
        
        # Create command for each node
        command_id = str(uuid.uuid4())
        
        command_payload = {
            "command_id": command_id,
            "type": request.command_type,
            "payload": request.payload,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        signature = sign_payload(command_payload)
        
        command = Command(
            id=command_id,
            node_id=node.id,
            command_type=request.command_type,
            payload=request.payload,
            signature=signature,
            status="sent",
            sent_at=datetime.utcnow()
        )
        
        db.add(command)
        node.total_commands += 1
        
        # Send command
        message = {
            "type": "command",
            "command_id": command_id,
            "command_type": request.command_type,
            "payload": request.payload,
            "signature": signature
        }
        
        success = await connection_manager.send_to_node(node.id, message)
        
        results.append({
            "node_id": node.id,
            "command_id": command_id,
            "success": success
        })
    
    db.commit()
    
    logger.info(f"Broadcast command {request.command_type} to {len(results)} nodes")
    
    return {
        "message": "Broadcast completed",
        "command_type": request.command_type,
        "results": results
    }
