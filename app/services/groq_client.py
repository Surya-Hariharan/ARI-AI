"""
Groq Recommendation Engine — constrained analysis, never execution.

Rules:
- Groq never controls the device
- Groq never sees raw personal data
- Groq only explains + recommends
- ARI decides, User approves
"""
import json
import httpx
from app.config import settings
from app.core.logger import logger
from app.domain.normalizer import NormalizedContext
from pydantic import BaseModel
from typing import List, Optional


# --- Response Models ---

class Recommendation(BaseModel):
    setting: str
    impact: str  # HIGH | MEDIUM | LOW
    reason: str
    tradeoff: str
    reversible: bool = True

class GroqAnalysis(BaseModel):
    summary: str
    recommendations: List[Recommendation] = []
    confidence: float = 0.0


# --- System Prompt (heavily constrained) ---

SYSTEM_PROMPT = """You are a mobile power optimization analyst for ARI, a device health assistant.

STRICT RULES:
- You do NOT control devices.
- You ONLY provide ranked recommendations.
- You MUST explain impact, tradeoffs, and reversibility for each suggestion.
- NEVER recommend actions requiring root, ADB, or hidden APIs.
- NEVER claim certainty about hardware degradation.
- NEVER use guilt language or alarming tone.
- All recommendations must be phrased as "Based on current patterns..."
- Output MUST be valid JSON matching the schema below.

OUTPUT SCHEMA:
{
  "summary": "Brief explanation of findings",
  "recommendations": [
    {
      "setting": "What to change",
      "impact": "HIGH | MEDIUM | LOW",
      "reason": "Why this helps",
      "tradeoff": "What the user gives up",
      "reversible": true
    }
  ],
  "confidence": 0.0 to 1.0
}

Rank recommendations by impact (highest first). Maximum 5 recommendations."""


async def analyze_with_groq(context: NormalizedContext) -> GroqAnalysis:
    """
    Sends sanitized device context to Groq and returns structured recommendations.
    Fails gracefully — never crashes the app.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("groq_skipped", reason="No API key configured")
        return GroqAnalysis(
            summary="Intelligence unavailable — API key not configured.",
            recommendations=[],
            confidence=0.0,
        )

    user_message = f"""Analyze this device telemetry and provide optimization recommendations:

{json.dumps(context.model_dump(), indent=2)}"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.3,  # Low temp for consistent analysis
                    "max_tokens": 1024,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)

        return GroqAnalysis(**parsed)

    except httpx.TimeoutException:
        logger.error("groq_timeout")
        return GroqAnalysis(summary="Analysis timed out. Try again later.", confidence=0.0)
    except httpx.HTTPStatusError as e:
        logger.error("groq_http_error", status=e.response.status_code)
        return GroqAnalysis(summary="Analysis service temporarily unavailable.", confidence=0.0)
    except (json.JSONDecodeError, KeyError, Exception) as e:
        logger.error("groq_parse_error", error=str(e))
        return GroqAnalysis(summary="Could not parse analysis results.", confidence=0.0)
