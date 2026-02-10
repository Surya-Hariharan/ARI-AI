"""
Keycloak/OIDC Integration — production authentication provider.
Verifies tokens issued by Keycloak using its JWKS (public key set).

Enabled by setting AUTH_PROVIDER=keycloak in environment.
When disabled (AUTH_PROVIDER=local), this module is never called.
"""
import time
from typing import Optional
import httpx
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
from pydantic import BaseModel
from app.config import settings
from app.core.logger import logger


# ─── JWKS Cache ─────────────────────────────────────────────────
# Public keys are cached to avoid hitting Keycloak on every request.

_jwks_cache: Optional[dict] = None
_jwks_cache_expiry: float = 0.0
JWKS_CACHE_TTL_SECONDS = 3600  # Re-fetch keys every hour


class KeycloakTokenData(BaseModel):
    """Parsed token data from a Keycloak JWT."""
    username: str
    capabilities: list[str] = []
    email: Optional[str] = None
    realm_roles: list[str] = []


async def _fetch_jwks() -> dict:
    """
    Fetches the JWKS (JSON Web Key Set) from Keycloak's well-known endpoint.
    Caches the result to avoid repeated network calls.
    """
    global _jwks_cache, _jwks_cache_expiry

    now = time.time()
    if _jwks_cache and now < _jwks_cache_expiry:
        return _jwks_cache

    url = (
        f"{settings.KEYCLOAK_SERVER_URL}"
        f"/realms/{settings.KEYCLOAK_REALM}"
        f"/protocol/openid-connect/certs"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()

        _jwks_cache = response.json()
        _jwks_cache_expiry = now + JWKS_CACHE_TTL_SECONDS

        logger.info("keycloak_jwks_fetched", key_count=len(_jwks_cache.get("keys", [])))
        return _jwks_cache

    except Exception as e:
        logger.error("keycloak_jwks_fetch_failed", error=str(e))
        # Return stale cache if available
        if _jwks_cache:
            logger.warning("keycloak_using_stale_jwks")
            return _jwks_cache
        raise RuntimeError(f"Cannot fetch Keycloak JWKS: {e}")


def _find_signing_key(jwks: dict, token: str) -> Optional[dict]:
    """Finds the correct signing key from JWKS based on the token's 'kid' header."""
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except JWTError:
        return None

    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key

    return None


async def verify_keycloak_token(token: str) -> KeycloakTokenData:
    """
    Verifies a JWT token issued by Keycloak.
    
    Steps:
    1. Fetch JWKS from Keycloak (cached)
    2. Find the matching signing key
    3. Decode and verify the token
    4. Extract user info and roles/capabilities
    
    Raises RuntimeError on verification failure.
    """
    # 1. Get JWKS
    jwks = await _fetch_jwks()

    # 2. Find signing key
    signing_key = _find_signing_key(jwks, token)
    if signing_key is None:
        raise RuntimeError("No matching signing key found in Keycloak JWKS")

    # 3. Decode and verify
    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.KEYCLOAK_CLIENT_ID,
            issuer=(
                f"{settings.KEYCLOAK_SERVER_URL}/realms/{settings.KEYCLOAK_REALM}"
            ),
        )
    except JWTError as e:
        logger.warning("keycloak_token_invalid", error=str(e))
        raise RuntimeError(f"Invalid Keycloak token: {e}")

    # 4. Extract user info
    username = payload.get("preferred_username") or payload.get("sub", "unknown")
    email = payload.get("email")

    # Extract realm roles
    realm_access = payload.get("realm_access", {})
    realm_roles = realm_access.get("roles", [])

    # Extract client-specific roles (capabilities)
    resource_access = payload.get("resource_access", {})
    client_access = resource_access.get(settings.KEYCLOAK_CLIENT_ID, {})
    client_roles = client_access.get("roles", [])

    # Merge roles into capabilities
    # Convention: realm roles are prefixed, client roles map to capabilities directly
    capabilities = list(client_roles)
    if "admin" in realm_roles or "ari-admin" in realm_roles:
        capabilities.append("admin")

    logger.info(
        "keycloak_token_verified",
        username=username,
        capabilities=capabilities,
    )

    return KeycloakTokenData(
        username=username,
        capabilities=capabilities,
        email=email,
        realm_roles=realm_roles,
    )
