"""
Backend Normalizer — sanitizes raw device telemetry before it reaches Groq.
Groq never sees raw app names, user identifiers, or OS-level data.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


# --- Input Models (what the device sends) ---

class BatteryTelemetry(BaseModel):
    level: int = Field(..., ge=0, le=100)
    charging: bool = False
    health: str = "GOOD"  # GOOD | DEGRADED | UNKNOWN
    screen_on_time_hours: float = 0.0
    idle_drain_rate: Optional[str] = None  # LOW | NORMAL | HIGH

class DisplayTelemetry(BaseModel):
    refresh_rate: str = "60Hz"
    adaptive: bool = True
    brightness_avg: str = "MEDIUM"  # LOW | MEDIUM | HIGH
    dark_mode: bool = True

class UsagePatterns(BaseModel):
    background_drain: str = "NORMAL"  # LOW | NORMAL | ELEVATED | HIGH
    top_consumers: List[str] = []  # Categories only: "Social", "Video", "Games"

class SystemTelemetry(BaseModel):
    thermal: str = "NORMAL"  # NORMAL | WARM | HOT | CRITICAL
    network: str = "WIFI"   # WIFI | MOBILE | NONE
    power_saver: bool = False
    signal_strength: Optional[str] = None  # STRONG | MEDIUM | WEAK

class DeviceTelemetry(BaseModel):
    """Raw telemetry from the device. Already categorical — no PII."""
    battery: BatteryTelemetry
    display: DisplayTelemetry
    usage: UsagePatterns = UsagePatterns()
    system: SystemTelemetry = SystemTelemetry()

class UserPreferences(BaseModel):
    """Personalization without profiling."""
    prefers_smooth_ui: bool = True
    accepts_display_tradeoffs: bool = True
    accepts_network_tradeoffs: bool = True


# --- Output Model (what Groq sees) ---

class NormalizedContext(BaseModel):
    """Sanitized payload safe to send to Groq. No PII, no raw data."""
    battery: dict
    display: dict
    usage_patterns: dict
    system_state: dict
    user_preferences: dict = {}


def normalize(telemetry: DeviceTelemetry, prefs: Optional[UserPreferences] = None) -> NormalizedContext:
    """
    Strips anything Groq shouldn't see and produces a clean context summary.
    This is the firewall between device data and the LLM.
    """
    # Sanitize top consumers — only allow known categories
    ALLOWED_CATEGORIES = {"Social", "Video", "Games", "Music", "Productivity", "Communication", "System", "Other"}
    safe_consumers = [c for c in telemetry.usage.top_consumers if c in ALLOWED_CATEGORIES]

    return NormalizedContext(
        battery={
            "level": telemetry.battery.level,
            "health": telemetry.battery.health,
            "drain_rate": telemetry.battery.idle_drain_rate or "UNKNOWN",
            "screen_on_time_hours": round(telemetry.battery.screen_on_time_hours, 1),
            "charging": telemetry.battery.charging,
        },
        display={
            "refresh_rate": telemetry.display.refresh_rate,
            "adaptive": telemetry.display.adaptive,
            "brightness_avg": telemetry.display.brightness_avg,
            "dark_mode": telemetry.display.dark_mode,
        },
        usage_patterns={
            "background_drain": telemetry.usage.background_drain,
            "top_consumers": safe_consumers,
        },
        system_state={
            "thermal": telemetry.system.thermal,
            "network": telemetry.system.network,
            "power_saver": telemetry.system.power_saver,
        },
        user_preferences=prefs.model_dump() if prefs else {},
    )
