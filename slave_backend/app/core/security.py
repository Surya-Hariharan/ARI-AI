"""
Security utilities for JWT authentication and payload signing
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
import hmac
import hashlib
import json

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    
    return encoded_jwt


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def sign_payload(payload: Dict[str, Any]) -> str:
    """Sign a payload with HMAC-SHA256"""
    payload_str = json.dumps(payload, sort_keys=True)
    signature = hmac.new(
        settings.SECRET_KEY.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature


def verify_signature(payload: Dict[str, Any], signature: str) -> bool:
    """Verify payload signature"""
    expected_signature = sign_payload(payload)
    return hmac.compare_digest(expected_signature, signature)


def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def generate_node_token(node_id: str) -> str:
    """Generate a JWT token for a node"""
    token_data = {
        "sub": node_id,
        "type": "node",
        "iat": datetime.utcnow()
    }
    return create_access_token(token_data)
