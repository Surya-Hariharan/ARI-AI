"""
The Act Layer.
Executes side effects based on strict instructions from the Decide layer.

When an Execution Agent is registered, actions are dispatched via the
Agent protocol (signed instruction envelopes). When no agent is available,
falls back to local simulation with logging.
"""
import structlog
from app.domain.models import Action
from app.agent.dispatcher import dispatch_instruction
from app.agent.registry import list_agents
from app.agent.models import AgentStatus

logger = structlog.get_logger()


async def _find_capable_agent(action_type: str):
    """
    Finds a healthy agent that declares the required capability.
    Returns the agent record or None.
    """
    agents = await list_agents()
    for agent in agents:
        if (
            agent.status in (AgentStatus.REGISTERED, AgentStatus.HEALTHY)
            and action_type in agent.capabilities
        ):
            return agent
    return None


async def execute_action(action: Action):
    """
    Dispatches an action to an Execution Agent if one is available.
    Falls back to local simulation if no agent can handle the action.
    """
    logger.info("executing_action", type=action.action_type, target=action.target)

    # 1. Try to find a capable agent
    agent = await _find_capable_agent(action.action_type)

    if agent is not None:
        # 2. Dispatch via signed instruction envelope
        envelope = await dispatch_instruction(
            agent_id=agent.agent_id,
            action_type=action.action_type,
            target=action.target,
            params=action.params,
        )
        if envelope:
            logger.info(
                "action_dispatched_to_agent",
                agent_id=agent.agent_id,
                instruction_id=envelope["instruction_id"],
            )
            return

        logger.warning("agent_dispatch_failed", agent_id=agent.agent_id)

    # 3. Fallback: local simulation (no agent available)
    logger.info("action_fallback_local", type=action.action_type)
    try:
        if action.action_type == "IOT_CONTROL":
            logger.info("iot_command_simulated", device=action.target, state=action.params)
            
        elif action.action_type == "TTS":
            logger.info("tts_simulated", text=action.params.get("text"))
            
        elif action.action_type == "QUERY":
            logger.info("query_simulated", query=action.target)
            
        else:
            logger.warning("unknown_action_type", type=action.action_type)
            
    except Exception as e:
        logger.error("action_failed", action=action.model_dump(), error=str(e))
        raise e
