from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature
import base64
import json
from fastapi import HTTPException, status

def verify_signature(payload: dict, signature: str, public_key_pem: str) -> bool:
    """
    Verifies that the payload was signed by the private key corresponding to the public_key_pem.
    """
    try:
        # Load the public key
        public_key = serialization.load_pem_public_key(
            public_key_pem.encode('utf-8')
        )
        
        # Canonicalize payload to ensure consistent signing (simple JSON dump)
        # In production, ensure the client sorts keys exactly the same way
        payload_bytes = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
        
        # Decode signature (assuming Base64 encoded)
        signature_bytes = base64.b64decode(signature)
        
        # Verify
        public_key.verify(
            signature_bytes,
            payload_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        return True
    except (InvalidSignature, ValueError, Exception) as e:
        print(f"Signature verification failed: {e}")
        return False

def require_signed_request(request_data: 'SignedRequest'):
    """
    FastAPI dependency to enforce signature verification.
    """
    if not verify_signature(request_data.payload, request_data.signature, request_data.public_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature or unauthorized device"
        )
    return request_data.payload
