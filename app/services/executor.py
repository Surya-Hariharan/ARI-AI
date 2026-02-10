import structlog
from app.domain.models import Action

logger = structlog.get_logger()

async def execute_action(action: Action):
    """
    The Act Layer.
    Executes side effects based on the strict instructions from the Decide layer.
    """
    logger.info("executing_action", type=action.action_type, target=action.target)
    
    try:
        if action.action_type == "IOT_CONTROL":
            # Simulate IoT call
            # await iot_service.set_state(action.target, action.params)
            logger.info("iot_command_sent", device=action.target, state=action.params)
            
        elif action.action_type == "TTS":
            # Simulate TTS generation
            logger.info("speaking", text=action.params.get("text"))
            
        elif action.action_type == "QUERY":
            # Simulate DB/System Query
            logger.info("query_executed", query=action.target)
            
        else:
            logger.warning("unknown_action_type", type=action.action_type)
            
    except Exception as e:
        logger.error("action_failed", action=action.model_dump(), error=str(e))
        # Depending on policy, we might want to re-raise or just log
        raise e
