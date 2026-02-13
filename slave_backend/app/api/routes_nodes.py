"""
API routes for node management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import logging
from datetime import datetime

from app.core.database import get_db
from app.core.security import generate_node_token
from app.models.node import Node, NodeStatus, Telemetry
from app.schemas.node import (
    NodeRegisterRequest,
    NodeRegisterResponse,
    NodeResponse,
    TelemetryRequest,
    HeartbeatRequest
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=NodeRegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_node(request: NodeRegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new slave node or re-register existing one
    Returns node_id and JWT token
    """
    
    # Check if hardware_id already exists
    existing_node = db.query(Node).filter(Node.hardware_id == request.hardware_id).first()
    
    if existing_node:
        # Re-registration
        logger.info(f"Re-registering node: {existing_node.id}")
        node_id = existing_node.id
        
        # Update node info
        existing_node.hostname = request.hostname
        existing_node.ip_address = request.ip_address
        existing_node.name = request.name or existing_node.name
        existing_node.metadata = request.metadata
        existing_node.status = NodeStatus.CONNECTING
        existing_node.updated_at = datetime.utcnow()
        
        db.commit()
        
        message = "Node re-registered successfully"
    else:
        # New registration
        node_id = str(uuid.uuid4())
        
        new_node = Node(
            id=node_id,
            hardware_id=request.hardware_id,
            hostname=request.hostname,
            ip_address=request.ip_address,
            name=request.name or f"node-{node_id[:8]}",
            metadata=request.metadata,
            status=NodeStatus.CONNECTING,
            created_at=datetime.utcnow()
        )
        
        db.add(new_node)
        db.commit()
        
        logger.info(f"Registered new node: {node_id}")
        message = "Node registered successfully"
    
    # Generate JWT token for the node
    token = generate_node_token(node_id)
    
    return NodeRegisterResponse(
        node_id=node_id,
        token=token,
        message=message
    )


@router.get("/", response_model=List[NodeResponse])
async def list_nodes(db: Session = Depends(get_db)):
    """List all registered nodes"""
    nodes = db.query(Node).all()
    return nodes


@router.get("/{node_id}", response_model=NodeResponse)
async def get_node(node_id: str, db: Session = Depends(get_db)):
    """Get detailed information about a specific node"""
    node = db.query(Node).filter(Node.id == node_id).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found"
        )
    
    return node


@router.delete("/{node_id}")
async def delete_node(node_id: str, db: Session = Depends(get_db)):
    """Delete a node registration"""
    node = db.query(Node).filter(Node.id == node_id).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found"
        )
    
    db.delete(node)
    db.commit()
    
    logger.info(f"Deleted node: {node_id}")
    
    return {"message": f"Node {node_id} deleted successfully"}


@router.post("/heartbeat")
async def receive_heartbeat(request: HeartbeatRequest, db: Session = Depends(get_db)):
    """
    Receive heartbeat from a node (alternative to WebSocket)
    """
    node = db.query(Node).filter(Node.id == request.node_id).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {request.node_id} not found"
        )
    
    node.last_heartbeat = datetime.utcnow()
    node.last_seen = datetime.utcnow()
    node.status = request.status
    node.metadata.update(request.metadata)
    
    db.commit()
    
    return {"message": "Heartbeat received", "status": "ok"}


@router.post("/telemetry")
async def receive_telemetry(request: TelemetryRequest, db: Session = Depends(get_db)):
    """
    Receive telemetry data from a node
    """
    node = db.query(Node).filter(Node.id == request.node_id).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {request.node_id} not found"
        )
    
    # Store telemetry
    telemetry = Telemetry(
        node_id=request.node_id,
        cpu_percent=request.cpu_percent,
        memory_percent=request.memory_percent,
        disk_percent=request.disk_percent,
        data=request.data,
        timestamp=datetime.utcnow()
    )
    
    db.add(telemetry)
    db.commit()
    
    return {"message": "Telemetry received", "status": "ok"}


@router.get("/{node_id}/telemetry")
async def get_node_telemetry(node_id: str, limit: int = 100, db: Session = Depends(get_db)):
    """Get recent telemetry data for a node"""
    telemetry = db.query(Telemetry).filter(
        Telemetry.node_id == node_id
    ).order_by(
        Telemetry.timestamp.desc()
    ).limit(limit).all()
    
    return telemetry
