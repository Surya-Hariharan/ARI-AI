"""
Telemetry service - collects and sends system metrics
"""
import asyncio
import logging
import psutil
from datetime import datetime

from core.config import settings

logger = logging.getLogger(__name__)


class TelemetryService:
    """Collects and sends telemetry data"""
    
    def __init__(self, connection_service):
        self.connection_service = connection_service
        self.running = False
        self._task = None
    
    async def start(self):
        """Start the telemetry service"""
        if not settings.TELEMETRY_ENABLED:
            logger.info("Telemetry disabled")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._telemetry_loop())
        logger.info("Telemetry service started")
    
    async def stop(self):
        """Stop the telemetry service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Telemetry service stopped")
    
    async def _telemetry_loop(self):
        """Main telemetry loop"""
        while self.running:
            try:
                if self.connection_service.is_connected():
                    await self._collect_and_send()
                
                await asyncio.sleep(settings.TELEMETRY_INTERVAL)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in telemetry loop: {e}")
                await asyncio.sleep(10)
    
    async def _collect_and_send(self):
        """Collect system metrics and send to server"""
        try:
            cpu_percent = int(psutil.cpu_percent(interval=1))
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            telemetry_data = {
                "type": "telemetry",
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent": cpu_percent,
                "memory_percent": int(memory.percent),
                "disk_percent": int(disk.percent),
                "data": {
                    "memory_available": memory.available,
                    "disk_free": disk.free
                }
            }
            
            success = await self.connection_service.send_message(telemetry_data)
            
            if success:
                logger.debug(f"Telemetry sent - CPU: {cpu_percent}%, MEM: {memory.percent}%")
            else:
                logger.warning("Failed to send telemetry")
        
        except Exception as e:
            logger.error(f"Error collecting telemetry: {e}")
