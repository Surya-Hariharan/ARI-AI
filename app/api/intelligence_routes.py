"""
Intelligence Routes — Battery & Device Health Analysis powered by Groq.

Flow: Device Telemetry → Normalize → Groq → ARI Filter → User
"""
from fastapi import APIRouter, BackgroundTasks
from app.domain.normalizer import DeviceTelemetry, UserPreferences, normalize
from app.services.groq_client import analyze_with_groq, GroqAnalysis, Recommendation
from app.core.logger import logger
from pydantic import BaseModel
from typing import Optional, List


router = APIRouter(prefix="/intelligence", tags=["Intelligence"])


# --- Request/Response Models ---

class AnalyzeRequest(BaseModel):
    telemetry: DeviceTelemetry
    preferences: Optional[UserPreferences] = None

class FilteredRecommendation(BaseModel):
    setting: str
    impact: str
    reason: str
    tradeoff: str
    reversible: bool

class AnalyzeResponse(BaseModel):
    summary: str
    recommendations: List[FilteredRecommendation]
    confidence: float


# --- Safety Filter (ARI Decision Layer) ---

# Blocklist: settings Groq might hallucinate that we must never suggest
BLOCKED_SETTINGS = {
    "root", "adb", "developer options", "bootloader",
    "factory reset", "system partition", "custom rom",
    "magisk", "xposed", "kernel",
}

def ari_filter(recommendations: List[Recommendation]) -> List[FilteredRecommendation]:
    """
    ARI's safety gate for Groq output.
    Removes unsafe, irreversible, or hallucinated suggestions.
    """
    filtered = []
    for rec in recommendations:
        # Check blocklist
        setting_lower = rec.setting.lower()
        if any(blocked in setting_lower for blocked in BLOCKED_SETTINGS):
            logger.warning("groq_recommendation_blocked", setting=rec.setting)
            continue

        # Only pass reversible recommendations (safety-first)
        if not rec.reversible:
            logger.warning("groq_irreversible_blocked", setting=rec.setting)
            continue

        filtered.append(FilteredRecommendation(
            setting=rec.setting,
            impact=rec.impact,
            reason=rec.reason,
            tradeoff=rec.tradeoff,
            reversible=rec.reversible,
        ))

    return filtered[:5]  # Max 5 recommendations


# --- Endpoint ---

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_device(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Analyzes device telemetry and returns filtered recommendations.
    
    Flow: Normalize → Groq → ARI Filter → Response
    """
    # 1. NORMALIZE (strip anything Groq shouldn't see)
    normalized = normalize(request.telemetry, request.preferences)
    logger.info("intelligence_analyze", battery_level=request.telemetry.battery.level)

    # 2. GROQ (constrained analysis)
    analysis = await analyze_with_groq(normalized)

    # 3. ARI FILTER (safety gate)
    safe_recommendations = ari_filter(analysis.recommendations)

    # 4. RETURN (user sees only filtered results)
    return AnalyzeResponse(
        summary=analysis.summary,
        recommendations=safe_recommendations,
        confidence=analysis.confidence,
    )
