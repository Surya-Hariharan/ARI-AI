"""
Security utilities for agent
"""
import hmac
import hashlib
import json
from typing import Dict, Any


def verify_signature(payload: Dict[str, Any], signature: str, secret_key: str) -> bool:
    """Verify command payload signature"""
    payload_str = json.dumps(payload, sort_keys=True)
    expected_signature = hmac.new(
        secret_key.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


def sign_payload(payload: Dict[str, Any], secret_key: str) -> str:
    """Sign a payload"""
    payload_str = json.dumps(payload, sort_keys=True)
    signature = hmac.new(
        secret_key.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return signature
