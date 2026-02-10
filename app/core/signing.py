"""
Instruction Signing — HMAC-SHA256 envelope signing and verification.
Ensures integrity and authenticity of commands from Control Plane → Execution Agent.
"""
import hashlib
import hmac
import json
import time
import uuid
from typing import Any, Optional
from app.config import settings
from app.core.logger import logger


def _canonicalize(payload: dict) -> bytes:
    """
    Produces a deterministic canonical byte representation of a dict.
    Keys sorted, no whitespace, UTF-8 encoded.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_payload(payload: dict, key: Optional[str] = None) -> str:
    """
    Signs a dict payload using HMAC-SHA256.
    Returns hex-encoded signature string.
    """
    signing_key = (key or settings.AGENT_SIGNING_KEY).encode("utf-8")
    canonical = _canonicalize(payload)
    signature = hmac.new(signing_key, canonical, hashlib.sha256).hexdigest()
    return signature


def verify_signature(payload: dict, signature: str, key: Optional[str] = None) -> bool:
    """
    Verifies HMAC-SHA256 signature against a dict payload.
    Uses constant-time comparison to prevent timing attacks.
    """
    signing_key = (key or settings.AGENT_SIGNING_KEY).encode("utf-8")
    canonical = _canonicalize(payload)
    expected = hmac.new(signing_key, canonical, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def create_signed_envelope(
    agent_id: str,
    action_type: str,
    target: str,
    params: dict[str, Any],
    ttl_seconds: int = 60,
    signing_key: Optional[str] = None,
) -> dict:
    """
    Creates a fully signed instruction envelope for an Execution Agent.

    The envelope contains:
    - instruction_id: unique identifier
    - agent_id: target agent
    - action: what to do
    - params: how to do it
    - issued_at: Unix timestamp
    - expires_at: Unix timestamp (issued_at + ttl)
    - signature: HMAC-SHA256 over the canonical payload (excluding signature itself)
    """
    now = time.time()
    instruction_id = str(uuid.uuid4())

    envelope = {
        "instruction_id": instruction_id,
        "agent_id": agent_id,
        "action": {
            "action_type": action_type,
            "target": target,
            "params": params,
        },
        "issued_at": now,
        "expires_at": now + ttl_seconds,
    }

    # Sign the envelope (signature covers everything above)
    signature = sign_payload(envelope, key=signing_key)
    envelope["signature"] = signature

    logger.info(
        "instruction_signed",
        instruction_id=instruction_id,
        agent_id=agent_id,
        action_type=action_type,
    )

    return envelope


def verify_envelope(envelope: dict, signing_key: Optional[str] = None) -> bool:
    """
    Verifies a signed instruction envelope.
    Checks:
    1. Signature validity (HMAC-SHA256)
    2. Expiration (must not be expired)
    Returns True if valid, False otherwise.
    """
    signature = envelope.get("signature")
    if not signature:
        logger.warning("envelope_missing_signature", envelope_id=envelope.get("instruction_id"))
        return False

    now = time.time()

    # 1. Expiration Check
    expires_at = envelope.get("expires_at", 0)
    if now > expires_at:
        logger.warning(
            "envelope_expired",
            instruction_id=envelope.get("instruction_id"),
            expired_at=expires_at,
            server_time=now,
        )
        return False

    # 2. Time Skew / Future Timestamp Check
    # Ensure issued_at is not in the future (with 5s tolerance)
    issued_at = envelope.get("issued_at", 0)
    if issued_at > now + 5:
        logger.warning(
            "envelope_future_timestamp",
            instruction_id=envelope.get("instruction_id"),
            issued_at=issued_at,
            server_time=now,
            diff=issued_at - now,
        )
        return False

    # 3. Message Age Check (Optional but good for replay mitigation)
    # If message is too old (e.g. > 60s) even if not expired, treat with suspicion
    if now - issued_at > 60:
         logger.warning(
            "envelope_too_old",
            instruction_id=envelope.get("instruction_id"),
            age=now - issued_at,
        )
         # We don't necessarily fail here if TTL is long, but good to log

    # Verify signature (extract payload without signature field)
    payload = {k: v for k, v in envelope.items() if k != "signature"}
    is_valid = verify_signature(payload, signature, key=signing_key)

    if not is_valid:
        logger.warning(
            "envelope_signature_invalid",
            instruction_id=envelope.get("instruction_id"),
        )

    return is_valid
