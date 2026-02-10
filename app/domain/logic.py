from app.domain.models import (
    IncomingRequest, 
    RequestContext, 
    Decision, 
    DecisionOutcome, 
    Action,
    SystemState
)

def decide(req: IncomingRequest, ctx: RequestContext) -> Decision:
    """
    The Core Decision Engine.
    Pure function: Input (Request + Context) -> Output (Decision).
    No side effects allowed here.
    """
    
    # 1. State-Aware Authorization
    if ctx.state == SystemState.STANDBY:
        # specific policy: If system is in standby, only allow 'wake_word' or critical system events
        if req.intent != "wake_system" and req.type != "SYSTEM_EVENT":
            return Decision(
                outcome=DecisionOutcome.DENY,
                reason="System is in STANDBY mode. Wake up first.",
            )

    # 2. Capability Check (Capability-based permissions)
    # Map intents to required capabilities
    required_capability = f"intent.{req.intent}"
    
    # This is a simplified check. In a real system, you might have more complex mapping.
    # For now, we assume if the intent is "turn_on_light", you need "intent.turn_on_light" capability
    # OR a wildcard "admin" capability.
    
    has_permission = (
        required_capability in ctx.permissions or 
        "admin" in ctx.permissions or
        "root" in ctx.permissions
    )

    if not has_permission:
        return Decision(
            outcome=DecisionOutcome.DENY,
            reason=f"Missing capability: {required_capability}",
        )

    # 3. Intent Resolution (The 'Brain')
    actions = []
    
    if req.intent == "turn_on_light":
        actions.append(Action(
            action_type="IOT_CONTROL",
            target=req.payload.get("target_device", "unknown_device"),
            params={"state": "ON"}
        ))
    elif req.intent == "system_status":
        actions.append(Action(
            action_type="QUERY",
            target="SYSTEM_HEALTH",
            params={}
        ))
    elif req.intent == "speak":
        actions.append(Action(
            action_type="TTS",
            target="speaker_main",
            params={"text": req.payload.get("text", "")}
        ))
    
    # 4. Final Approval
    return Decision(
        outcome=DecisionOutcome.ALLOW,
        reason="Policy check passed",
        actions=actions
    )
