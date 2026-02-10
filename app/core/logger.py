import logging
import sys
import structlog
from typing import Any

def setup_logging(json_logs: bool = False, log_level: str = "INFO"):
    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        timestamper,
    ]

    if json_logs:
        # Format for production (JSON)
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Format for development (Pretty print)
        processors = shared_processors + [
            structlog.stdlib.ConsoleRenderer(),
        ]

    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure standard library logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level.upper(),
    )
    
setup_logging()
logger = structlog.get_logger()
