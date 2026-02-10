from enum import Enum
from pydantic import BaseModel
from typing import Dict, Any, List

class OEM(str, Enum):
    SAMSUNG = "SAMSUNG"
    ONEPLUS = "ONEPLUS"
    OTOROLA = "MOTOROLA" # MOTOROLA typo fix
    MOTOROLA = "MOTOROLA"
    XIAOMI = "XIAOMI"
    OPPO = "OPPO"
    VIVO = "VIVO"
    REALME = "REALME"
    GOOGLE = "GOOGLE" # Pixel/Stock
    UNKNOWN = "UNKNOWN"

class OEMConstraint(str, Enum):
    # Background constraints
    AGGRESSIVE_BACKGROUND_KILL = "AGGRESSIVE_BACKGROUND_KILL"
    REQUIRE_HIGH_PRIORITY_PUSH = "REQUIRE_HIGH_PRIORITY_PUSH"
    BROKEN_WEBSOCKETS_IN_DOZE = "BROKEN_WEBSOCKETS_IN_DOZE"
    
    # Permission/Sensor constraints
    AUTO_RESET_PERMISSIONS = "AUTO_RESET_PERMISSIONS"
    SENSOR_RATE_LIMIT = "SENSOR_RATE_LIMIT"
    
    # WebView/Session constraints
    WEBVIEW_SESSION_FRAGILE = "WEBVIEW_SESSION_FRAGILE"

class OEMProfile(BaseModel):
    name: OEM
    constraints: List[OEMConstraint]
    recommended_sync_interval_seconds: int = 300 # Default 5 min
    safe_push_priority: str = "normal"

# Knowledge Base from User Research
OEM_KNOWLEDGE_BASE: Dict[OEM, OEMProfile] = {
    OEM.GOOGLE: OEMProfile(
        name=OEM.GOOGLE,
        constraints=[], # Baseline
        recommended_sync_interval_seconds=900, # 15 min is fine
    ),
    OEM.SAMSUNG: OEMProfile(
        name=OEM.SAMSUNG,
        constraints=[
            OEMConstraint.AGGRESSIVE_BACKGROUND_KILL, 
            OEMConstraint.WEBVIEW_SESSION_FRAGILE
        ],
        recommended_sync_interval_seconds=300,
    ),
    OEM.XIAOMI: OEMProfile(
        name=OEM.XIAOMI,
        constraints=[
            OEMConstraint.AGGRESSIVE_BACKGROUND_KILL,
            OEMConstraint.REQUIRE_HIGH_PRIORITY_PUSH,
            OEMConstraint.BROKEN_WEBSOCKETS_IN_DOZE
        ],
        safe_push_priority="high",
        recommended_sync_interval_seconds=60, # Keep it alive
    ),
    OEM.OPPO: OEMProfile(
        name=OEM.OPPO,
        constraints=[OEMConstraint.AGGRESSIVE_BACKGROUND_KILL],
        recommended_sync_interval_seconds=120,
    ),
    OEM.VIVO: OEMProfile(
        name=OEM.VIVO,
        constraints=[OEMConstraint.AGGRESSIVE_BACKGROUND_KILL, OEMConstraint.REQUIRE_HIGH_PRIORITY_PUSH],
        safe_push_priority="high",
        recommended_sync_interval_seconds=120,
    ),
    # Add others as needed
}

def get_oem_profile(oem: OEM) -> OEMProfile:
    return OEM_KNOWLEDGE_BASE.get(oem, OEMProfile(name=OEM.UNKNOWN, constraints=[]))

def infer_oem_from_user_agent(ua: str) -> OEM:
    ua = ua.lower()
    if "samsung" in ua: return OEM.SAMSUNG
    if "xiaomi" in ua or "redmi" in ua or "miui" in ua: return OEM.XIAOMI
    if "oneplus" in ua: return OEM.ONEPLUS
    if "oppo" in ua: return OEM.OPPO
    if "vivo" in ua: return OEM.VIVO
    if "realme" in ua: return OEM.REALME
    if "moto" in ua: return OEM.MOTOROLA
    if "pixel" in ua: return OEM.GOOGLE
    return OEM.UNKNOWN
