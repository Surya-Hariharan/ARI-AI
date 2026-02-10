from fastapi import APIRouter, Depends, BackgroundTasks
from app.domain.models import IncomingRequest, Decision, RequestContext, DecisionOutcome
from app.api.dependencies import get_request_context
from app.domain.logic import decide
from app.services.executor import execute_action
from app.core.audit import analyze_and_record

router = APIRouter()

@router.post("/process", response_model=Decision)
async def process_command(
    req: IncomingRequest,
    background_tasks: BackgroundTasks,
    ctx: RequestContext = Depends(get_request_context)
):
    """
    The Single Gate Entry Point.
    All voice/control requests pass through here.
    """
    
    # 1. GATE (Handled by Middleware + Dependency Injection of `ctx`)
    # If we are here, Auth is passed.
    
    # 2. DECIDE (Pure Logic)
    decision = decide(req, ctx)
    
    # 3. ACT (Controlled Side Effects)
    if decision.outcome == DecisionOutcome.ALLOW:
        for action in decision.actions:
            # Execute immediately or enqueue
            # For this strict framework, we execute sequentially to ensure order
            await execute_action(action)
            
    # 4. RECORD (Immutable Audit)
    # Run in background to reduce latency, but CRITICAL it happens.
    background_tasks.add_task(analyze_and_record, req, ctx, decision)
    
    return decision
