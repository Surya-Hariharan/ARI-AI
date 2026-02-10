"""
ARI Control Plane — Reliability & Hardening Verification Suite.
Tests Failure-First requirements: Replay, Tampering, Time Safety, Liveness.
"""
import sys
import time
import json
import asyncio
import uuid
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, ".")

from app.core.redis import get_redis
from app.core.signing import create_signed_envelope, verify_envelope, sign_payload
from app.agent.dispatcher import dispatch_instruction
from app.agent.registry import register_agent, heartbeat, get_agent, AGENT_TTL_SECONDS
from app.agent.models import AgentRegistration, AgentHeartbeat, AgentStatus, Capability

# Color codes
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

PASS_COUNT = 0
FAIL_COUNT = 0

def check(name, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"{GREEN}  PASS  {name}{RESET}")
    else:
        FAIL_COUNT += 1
        print(f"{RED}  FAIL  {name} — {detail}{RESET}")

async def setup_redis():
    r = await get_redis()
    await r.flushdb() # Clean slate for testing reliability
    return r

async def test_replay_protection():
    print("\n--- Test 1: Strict Idempotency & Replay Protection ---")
    
    # 1. Register agent
    reg = AgentRegistration(
        agent_id="replay-agent",
        capabilities=[Capability.IOT_CONTROL],
        platform="Test",
        version="1.0"
    )
    record = await register_agent(reg)
    
    # 2. Dispatch valid instruction
    envelope = await dispatch_instruction(
        agent_id="replay-agent",
        action_type="IOT_CONTROL",
        target="light",
        params={"state": "on"}
    )
    check("Dispatch valid instruction", envelope is not None)
    
    if envelope:
        # 3. Try to replay (dispatch same envelope/ID again)
        # We manually try to push the same instruction ID to the dispatcher logic
        # Since dispatcher creates new IDs internally, we mock the replay check by interacting with Redis directly
        # or by trying to use the dispatcher to send an instruction with a FORCED ID if possible.
        # But dispatcher generates IDs. So we test the IDEMPOTENCY KEY existence.
        
        r = await get_redis()
        key = f"ari:instruction_id:{envelope['instruction_id']}"
        exists = await r.exists(key)
        check("Idempotency key exists in Redis", exists)
        
        # Simulate replay by trying to set the key again (nx=True should fail)
        is_new = await r.set(key, "replay_attempt", nx=True, ex=60)
        check("Replay attempt rejected by Redis NX", not is_new)

async def test_time_safety():
    print("\n--- Test 2: Time Safety & Clock Skew ---")
    
    agent_id = "time-agent"
    key = "secret-key"
    
    # 1. expired instruction
    expired = create_signed_envelope(agent_id, "TEST", "t", {}, ttl_seconds=-10, signing_key=key)
    valid = verify_envelope(expired, signing_key=key)
    check("Expired instruction rejected", not valid)
    
    # 2. future timestamp (clock skew > 5s)
    future = create_signed_envelope(agent_id, "TEST", "t", {}, ttl_seconds=60, signing_key=key)
    # Manually tamper issued_at to be in future
    future["issued_at"] = time.time() + 100
    # Re-sign needed? Yes, because signature covers payload.
    # But verify_envelope checks time BEFORE signature for some checks? 
    # Actually logic verifies expiry first. But future check verifies issued_at. 
    # We must resign to test the *logic* of the time check, otherwise it might fail on signature first.
    # Let's resign.
    payload = {k: v for k, v in future.items() if k != "signature"}
    future["signature"] = sign_payload(payload, key=key)
    
    valid = verify_envelope(future, signing_key=key)
    check("Future timestamp (>5s skew) rejected", not valid)

async def test_tampering():
    print("\n--- Test 3: Payload Tampering ---")
    agent_id = "tamper-agent"
    key = "secret-key"
    
    envelope = create_signed_envelope(agent_id, "TEST", "t", {"val": 1}, ttl_seconds=60, signing_key=key)
    
    # Modify params without resigning
    envelope["action"]["params"]["val"] = 999
    
    valid = verify_envelope(envelope, signing_key=key)
    check("Tampered payload rejected", not valid)
    
async def test_liveness_detection():
    print("\n--- Test 4: Liveness & Unresponsiveness ---")
    
    # 1. Register
    reg = AgentRegistration(
        agent_id="ghost-agent",
        capabilities=[Capability.TTS],
        platform="Test",
        version="1.0"
    )
    record = await register_agent(reg)
    check("Agent starts REGISTERED", record.status == AgentStatus.REGISTERED)
    
    # 2. Heartbeat
    hb = AgentHeartbeat(agent_id="ghost-agent", status=AgentStatus.HEALTHY, uptime_seconds=10)
    record = await heartbeat(hb)
    check("Heartbeat updates status", record.status == AgentStatus.HEALTHY)
    
    # 3. Simulate time jump (modify last_heartbeat in Redis to be old)
    r = await get_redis()
    key = f"ari:agent:ghost-agent"
    
    # Fetch, modify, save
    raw = await r.get(key)
    data = json.loads(raw)
    data["last_heartbeat"] = time.time() - (AGENT_TTL_SECONDS + 10) # 5m 10s ago
    await r.set(key, json.dumps(data))
    
    # 4. Check status via get_agent (should provoke auto-unresponsive)
    agent = await get_agent("ghost-agent")
    check("Agent becomes UNRESPONSIVE after timeout", agent.status == AgentStatus.UNRESPONSIVE)
    
    # 5. Revive
    record = await heartbeat(hb)
    check("New heartbeat revives agent", record.status == AgentStatus.HEALTHY)

async def main():
    print("=" * 60)
    print("RELIABILITY VERIFICATION SUITE")
    print("=" * 60)
    
    try:
        await setup_redis()
        await test_replay_protection()
        await test_time_safety()
        await test_tampering()
        await test_liveness_detection()
    except Exception as e:
        print(f"\n{RED}CRITICAL TEST SUITE FAILURE: {e}{RESET}")
        import traceback
        traceback.print_exc()
        
    print("\n" + "=" * 60)
    print(f"RESULTS: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    print("=" * 60)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
