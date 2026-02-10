import time
import uuid
import structlog
from typing import Callable, Awaitable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logger import logger

class GateMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        
        # 1. Assign unique Request ID (The Gate starts here)
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Start timer
        start_time = time.time()
        
        # Contextualize logger
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path
        )
        
        logger.info("request_started", client=request.client.host)

        try:
            # 2. Proceed to next layer (Route Handlers -> Decide)
            response = await call_next(request)
            
            # 3. Record outcome (Success)
            process_time = time.time() - start_time
            logger.info(
                "request_finished",
                status_code=response.status_code,
                duration=process_time
            )
            
            response.headers["X-Request-ID"] = request_id
            return response
            
        except Exception as e:
            # 3. Record outcome (Failure)
            process_time = time.time() - start_time
            logger.error(
                "request_failed",
                error=str(e),
                duration=process_time
            )
            raise e
        finally:
            structlog.contextvars.clear_contextvars()
