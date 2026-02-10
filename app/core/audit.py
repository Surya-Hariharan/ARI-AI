"""
The Record Layer — immutable audit logging.
Writes to Postgres (ORM) + structured log (stdout).
Never crashes the request if recording fails.
"""
from app.core.database import AsyncSessionLocal
from app.domain.models import IncomingRequest, Decision, RequestContext
from app.models import AuditLog
from app.core.logger import logger


async def analyze_and_record(
    req: IncomingRequest, 
    ctx: RequestContext, 
    decision: Decision
):
    log_entry = {
        "request_id": ctx.request_id,
        "user_id": ctx.device.user_id,
        "device_id": ctx.device.device_id,
        "intent": req.intent,
        "decision": decision.outcome.value if hasattr(decision.outcome, 'value') else str(decision.outcome),
        "reason": decision.reason,
        "actions": [a.model_dump() for a in decision.actions],
    }

    # 1. Always log to stdout (Splunk/Datadog/CloudWatch picks this up)
    logger.info("audit_log", **log_entry)

    # 2. Attempt Postgres insert (graceful degradation)
    try:
        async with AsyncSessionLocal() as session:
            record = AuditLog(
                request_id=ctx.request_id,
                user_id=ctx.device.user_id,
                device_id=ctx.device.device_id,
                intent=req.intent,
                decision=log_entry["decision"],
                actions=log_entry["actions"],
                meta={"reason": decision.reason, "oem": ctx.device.oem.value},
            )
            session.add(record)
            await session.commit()
    except Exception as e:
        # Never crash the request because audit failed, but alert loudly
        logger.error("audit_db_write_failed", error=str(e))
