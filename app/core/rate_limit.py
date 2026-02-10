import time
from fastapi import HTTPException, status, Request
from typing import Dict, Tuple

class RateLimiter:
    def __init__(self, requests_per_minute: int = 20):
        self.rate_limit = requests_per_minute
        self.request_history: Dict[str, list] = {}

    def is_allowed(self, device_id: str) -> bool:
        current_time = time.time()
        
        # Initialize history for new device
        if device_id not in self.request_history:
            self.request_history[device_id] = []

        # Filter out requests older than 1 minute
        self.request_history[device_id] = [
            timestamp for timestamp in self.request_history[device_id]
            if current_time - timestamp < 60
        ]

        # Check limit
        if len(self.request_history[device_id]) >= self.rate_limit:
            return False

        # Add current request
        self.request_history[device_id].append(current_time)
        return True

# global instance
rate_limiter = RateLimiter(requests_per_minute=20)

async def check_rate_limit(request: Request):
    """
    Dependency to check rate limits. 
    Assumes the request body is parsed or signature verification happened.
    However, for a middleware-like check before signature verification (to save CPU),
    we might need headers. For now, we'll check based on public_key in the body 
    if possible, or just IP.
    
    Given the structure, we can check it inside the endpoint logic *after* parsing 
    the SignedRequest but *before* processing intent.
    """
    pass 
    # This is a placeholder since we are implementing it logically in the execute endpoint
    # or we can extract device_id from the signed payload.
