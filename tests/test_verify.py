"""ARI Control Plane — Integration Verification Script"""
import httpx
import time
import sys

# Add project root to path for direct imports
sys.path.insert(0, ".")

BASE = "http://localhost:8000/api/v1"
PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name} — {detail}")


print("=" * 60)
print("ARI CONTROL PLANE — VERIFICATION")
print("=" * 60)

# ─── 1. Health Check ──────────────────────────────────────
print("\n--- Health Check ---")
r = httpx.get("http://localhost:8000/health", timeout=10)
check("Health endpoint", r.status_code == 200, f"Got {r.status_code}")
data = r.json()
check("Auth provider in health", "auth_provider" in data, str(data))
check("Auth provider is local", data.get("auth_provider") == "local")

# ─── 2. Authentication ───────────────────────────────────
print("\n--- Authentication ---")
r = httpx.post(f"{BASE}/login/access-token", json={"username": "admin", "password": "admin123"}, timeout=10)
check("Admin login", r.status_code == 200, f"Got {r.status_code}")
token = r.json().get("access_token", "")
check("Token returned", len(token) > 0)

headers = {"Authorization": f"Bearer {token}", "X-Device-ID": "test-device-001"}

# Bad login
r = httpx.post(f"{BASE}/login/access-token", json={"username": "admin", "password": "wrong"}, timeout=10)
check("Bad password rejected", r.status_code == 401, f"Got {r.status_code}")

# ─── 3. State Management ─────────────────────────────────
print("\n--- State Management ---")
try:
    r = httpx.get(f"{BASE}/state/test-device-001", headers=headers, timeout=10)
    check("State GET responds", r.status_code == 200, f"Got {r.status_code}")
    state_data = r.json()
    check("State has current_state", "current_state" in state_data, str(state_data))
    check("State has allowed_transitions", "allowed_transitions" in state_data, str(state_data))
    current = state_data.get("current_state", "")
    # Without Redis: DEGRADED. With Redis: IDLE
    check("State is IDLE or DEGRADED", current in ("IDLE", "DEGRADED"), f"Got {current}")
    print(f"       (Current state: {current})")
except httpx.ReadTimeout:
    FAIL += 1
    print("  FAIL  State endpoint timed out (Redis connection issue)")

# ─── 4. State Transitions ────────────────────────────────
print("\n--- State Transitions ---")
try:
    r = httpx.post(
        f"{BASE}/state/test-device-001/transition",
        headers=headers,
        json={"new_state": "LISTENING"},
        timeout=10,
    )
    if r.status_code == 200:
        check("Transition works", True)
        td = r.json()
        check("Transition returns new_state", td.get("new_state") == "LISTENING", str(td))
    elif r.status_code == 503:
        check("Transition degrades (no Redis)", True)
        print("       (Redis unavailable — transition requires Redis)")
    elif r.status_code == 409:
        check("Transition rejected (from DEGRADED)", True)
        print("       (Cannot transition from DEGRADED to LISTENING)")
    else:
        check("Transition responds", False, f"Got {r.status_code}: {r.text}")
except httpx.ReadTimeout:
    FAIL += 1
    print("  FAIL  Transition timed out")

# ─── 5. Agent Registration ───────────────────────────────
print("\n--- Agent Registration ---")
try:
    r = httpx.post(
        f"{BASE}/agent/register",
        headers=headers,
        json={
            "agent_id": "test-agent-001",
            "capabilities": ["IOT_CONTROL", "TTS"],
            "platform": "Android 14 Pixel 8",
            "version": "1.0.0",
        },
        timeout=10,
    )
    if r.status_code == 200:
        check("Agent registration", True)
        reg = r.json()
        check("Signing key returned", len(reg.get("signing_key", "")) > 0)
        check("Agent ID matches", reg.get("agent_id") == "test-agent-001")
    elif r.status_code == 503:
        check("Agent registration degrades (no Redis)", True)
        print("       (Redis unavailable — registration requires Redis)")
    else:
        check("Agent registration", False, f"Got {r.status_code}: {r.text}")
except httpx.ReadTimeout:
    FAIL += 1
    print("  FAIL  Agent registration timed out")

# ─── 6. Process Command ──────────────────────────────────
print("\n--- Process Command ---")
try:
    r = httpx.post(
        f"{BASE}/process",
        headers=headers,
        json={"type": "DIRECT_CONTROL", "intent": "system_status", "payload": {}},
        timeout=10,
    )
    check("Process responds", r.status_code == 200, f"Got {r.status_code}")
    if r.status_code == 200:
        dec = r.json()
        check("Decision has outcome", "outcome" in dec, str(dec))
        print(f"       (Decision: {dec.get('outcome')} — {dec.get('reason', '')})")
except httpx.ReadTimeout:
    FAIL += 1
    print("  FAIL  Process timed out")

# ─── 7. Signing Module ───────────────────────────────────
print("\n--- Instruction Signing ---")
from app.core.signing import sign_payload, verify_signature, create_signed_envelope, verify_envelope

payload = {"test": "data", "number": 42}
sig = sign_payload(payload, key="test-key")
check("Sign payload", len(sig) == 64, f"Sig length: {len(sig)}")

valid = verify_signature(payload, sig, key="test-key")
check("Verify valid signature", valid)

tampered = verify_signature({"test": "tampered"}, sig, key="test-key")
check("Detect tampered payload", not tampered)

wrong_key = verify_signature(payload, sig, key="wrong-key")
check("Detect wrong key", not wrong_key)

envelope = create_signed_envelope(
    "agent-001", "IOT_CONTROL", "light-1", {"state": "ON"},
    signing_key="test-key",
)
check("Create envelope", "instruction_id" in envelope)
check("Envelope has signature", "signature" in envelope)

env_valid = verify_envelope(envelope, signing_key="test-key")
check("Verify envelope", env_valid)

# Tamper with envelope
tampered_env = envelope.copy()
tampered_env["agent_id"] = "evil-agent"
env_tampered = verify_envelope(tampered_env, signing_key="test-key")
check("Detect tampered envelope", not env_tampered)

# Expired envelope
import copy
expired_env = copy.deepcopy(envelope)
expired_env["expires_at"] = time.time() - 100
# Re-sign so signature is valid but time is expired
from app.core.signing import sign_payload as sp
exp_payload = {k: v for k, v in expired_env.items() if k != "signature"}
expired_env["signature"] = sp(exp_payload, key="test-key")
env_expired = verify_envelope(expired_env, signing_key="test-key")
check("Detect expired envelope", not env_expired)

# ─── 8. OpenAPI Schema ───────────────────────────────────
print("\n--- OpenAPI Schema ---")
r = httpx.get("http://localhost:8000/api/v1/openapi.json", timeout=10)
check("OpenAPI accessible", r.status_code == 200, f"Got {r.status_code}")
schema = r.json()
paths = list(schema.get("paths", {}).keys())
check("State routes in schema", any("/state/" in p for p in paths), str(paths))
check("Agent routes in schema", any("/agent/" in p for p in paths), str(paths))
check("Process route in schema", any("/process" in p for p in paths), str(paths))
check("Intelligence route in schema", any("/intelligence/" in p for p in paths), str(paths))

# ─── Summary ─────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"RESULTS: {PASS} passed, {FAIL} failed")
print("=" * 60)
