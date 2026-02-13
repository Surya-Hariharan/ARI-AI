"""
Health monitoring service for slave nodes
Checks heartbeat timeouts and updates node status
"""
import asyncio
import logging
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.node import Node, NodeStatus

logger = logging.getLogger(__name__)


class HealthMonitor:
    """Monitors node health via heartbeat checks"""
    
    def __init__(self):
        self._running = False
        self._task = None
    
    async def start(self):
        """Start the health monitor"""
        if self._running:
            logger.warning("Health monitor already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("Health monitor started")
    
    async def stop(self):
        """Stop the health monitor"""
        if not self._running:
            return
        
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        logger.info("Health monitor stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self._running:
            try:
                await self._check_heartbeats()
                await asyncio.sleep(settings.HEARTBEAT_CHECK_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health monitor: {e}")
                await asyncio.sleep(5)
    
    async def _check_heartbeats(self):
        """Check all nodes for heartbeat timeouts"""
        db = SessionLocal()
        try:
            timeout_threshold = datetime.utcnow() - timedelta(
                seconds=settings.HEARTBEAT_TIMEOUT_SECONDS
            )
            
            # Find nodes with stale heartbeats
            stale_nodes = db.query(Node).filter(
                Node.status.in_([NodeStatus.ACTIVE, NodeStatus.DEGRADED]),
                Node.last_heartbeat < timeout_threshold
            ).all()
            
            for node in stale_nodes:
                logger.warning(f"Node {node.id} heartbeat timeout, marking as OFFLINE")
                node.status = NodeStatus.OFFLINE
            
            if stale_nodes:
                db.commit()
                logger.info(f"Marked {len(stale_nodes)} nodes as offline")
        
        except Exception as e:
            logger.error(f"Error checking heartbeats: {e}")
            db.rollback()
        finally:
            db.close()
