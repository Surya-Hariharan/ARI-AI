from datetime import datetime
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.domain.models import IncomingRequest, Decision, RequestContext
from app.core.logger import logger

async def analyze_and_record(
    req: IncomingRequest, 
    ctx: RequestContext, 
    decision: Decision
):
    """
    The Record Layer.
    Writes immutable audit logs.
    This runs even if the action failed.
    """
    try:
        async with AsyncSessionLocal() as session:
            # In a real app, use a proper ORM model. For speed, using raw SQL here or assuming a table exists.
            # We will use a structured log for now which is also a form of recording.
            
            log_entry = {
                "timestamp": ctx.timestamp.isoformat(),
                "request_id": ctx.request_id,
                "user_id": ctx.device.user_id,
                "device_id": ctx.device.device_id,
                "intent": req.intent,
                "decision": decision.outcome,
                "reason": decision.reason,
                "actions": [a.model_dump() for a in decision.actions]
            }
            
            # 1. Structured Log (Splunk/Datadog/etc would pick this up)
            logger.info("audit_log", **log_entry)
            
            # 2. Db Insert (Placeholder)
            # await session.execute(
            #     text("INSERT INTO audit_logs (data) VALUES (:data)"), 
            #     {"data": json.dumps(log_entry)}
            # )
            # await session.commit()
            
    except Exception as e:
        logger.error("audit_recording_failed", error=str(e))
        # Never crash the request because audit failed, but alert loudly.
