from app.domain.oem_rules import infer_oem_from_user_agent, OEM, get_oem_profile
from app.domain.logic import decide
from app.domain.models import IncomingRequest, RequestContext, DeviceContext, SystemState, RequestType
from datetime import datetime, timezone

def test_oem_detection():
    ua_xiaomi = "Mozilla/5.0 (Linux; Android 10; Redmi Note 8 Pro) AppleWebKit/537.36..."
    assert infer_oem_from_user_agent(ua_xiaomi) == OEM.XIAOMI

    ua_samsung = "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36..."
    assert infer_oem_from_user_agent(ua_samsung) == OEM.SAMSUNG
    
    ua_pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36..."
    assert infer_oem_from_user_agent(ua_pixel) == OEM.GOOGLE

def test_oem_rule_application():
    # 1. Setup Context for Xiaomi (Hostile OEM)
    ctx_xiaomi = RequestContext(
        request_id="123",
        timestamp=datetime.now(timezone.utc),
        state=SystemState.ACTIVE,
        device=DeviceContext(device_id="d1", oem=OEM.XIAOMI),
        permissions=["intent.turn_on_light"]
    )
    
    req = IncomingRequest(
        type=RequestType.VOICE_COMMAND,
        intent="turn_on_light",
        payload={"target_device": "lamp_1"}
    )
    
    # 2. Decide
    decision_xiaomi = decide(req, ctx_xiaomi)
    
    # 3. Assert High Priority Push is enforced
    action = decision_xiaomi.actions[0]
    assert action.params.get("push_priority") == "high"


def test_oem_rule_default():
    # 1. Setup Context for Google (Friendly OEM)
    ctx_pixel = RequestContext(
        request_id="124",
        timestamp=datetime.now(timezone.utc),
        state=SystemState.ACTIVE,
        device=DeviceContext(device_id="d2", oem=OEM.GOOGLE),
        permissions=["intent.turn_on_light"]
    )
    
    req = IncomingRequest(
        type=RequestType.VOICE_COMMAND,
        intent="turn_on_light",
        payload={"target_device": "lamp_1"}
    )
    
    # 2. Decide
    decision_pixel = decide(req, ctx_pixel)
    
    # 3. Assert Normal Priority
    action = decision_pixel.actions[0]
    assert action.params.get("push_priority") == "normal"
