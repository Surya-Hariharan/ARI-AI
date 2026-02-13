"""
Command executor - safely executes commands from control server
"""
import asyncio
import logging
import platform
import psutil
import os
from typing import Dict, Any, Callable

logger = logging.getLogger(__name__)


class CommandExecutor:
    """Executes commands with proper error handling and sandboxing"""
    
    def __init__(self):
        # Map command types to handler functions
        self.handlers: Dict[str, Callable] = {
            "ping": self._handle_ping,
            "system_info": self._handle_system_info,
            "restart_agent": self._handle_restart_agent,
            "custom_task": self._handle_custom_task
        }
    
    async def execute(self, command_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a command and return result"""
        logger.info(f"Executing command: {command_type}")
        
        handler = self.handlers.get(command_type)
        
        if not handler:
            raise ValueError(f"Unknown command type: {command_type}")
        
        try:
            result = await handler(payload)
            return result
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            raise
    
    async def _handle_ping(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Handle ping command"""
        return {
            "status": "pong",
            "message": "Agent is alive"
        }
    
    async def _handle_system_info(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Collect and return system information"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return {
                "platform": platform.system(),
                "platform_release": platform.release(),
                "platform_version": platform.version(),
                "architecture": platform.machine(),
                "hostname": platform.node(),
                "processor": platform.processor(),
                "cpu_count": psutil.cpu_count(),
                "cpu_percent": cpu_percent,
                "memory_total": memory.total,
                "memory_available": memory.available,
                "memory_percent": memory.percent,
                "disk_total": disk.total,
                "disk_used": disk.used,
                "disk_percent": disk.percent
            }
        except Exception as e:
            logger.error(f"Error collecting system info: {e}")
            raise
    
    async def _handle_restart_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Handle agent restart command"""
        logger.warning("Agent restart requested")
        
        # Schedule restart after sending response
        asyncio.create_task(self._restart_after_delay())
        
        return {
            "status": "restarting",
            "message": "Agent will restart in 5 seconds"
        }
    
    async def _restart_after_delay(self):
        """Restart the agent process after a delay"""
        await asyncio.sleep(5)
        logger.info("Restarting agent")
        os.execv(__file__, ['python'] + [__file__])
    
    async def _handle_custom_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle custom task command
        This is a placeholder for custom logic
        """
        task_type = payload.get("task_type")
        task_data = payload.get("data", {})
        
        logger.info(f"Executing custom task: {task_type}")
        
        # Implement custom task logic here
        # For now, just echo back
        
        return {
            "status": "completed",
            "task_type": task_type,
            "result": f"Custom task {task_type} executed",
            "data": task_data
        }
