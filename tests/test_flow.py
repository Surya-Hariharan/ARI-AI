from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
from app.main import app
from app.core.security import create_access_token
from app.domain.models import DecisionOutcome

client = TestClient(app)

# Mock AsyncSessionLocal
mock_session = AsyncMock()
mock_session.__aenter__.return_value = mock_session
mock_session.__aexit__.return_value = None

@patch("app.core.audit.AsyncSessionLocal", return_value=mock_session)
def test_full_flow_authorized(mock_db):
    # 1. Generate Token with capabilities
    token = create_access_token(data={"sub": "test_user", "caps": ["intent.turn_on_light"]})
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-ID": "unit_test_device"
    }
    
    # 2. Payload
    payload = {
        "type": "VOICE_COMMAND",
        "intent": "turn_on_light",
        "payload": {"target_device": "lamp_1"}
    }
    
    # 3. Request
    response = client.post("/api/v1/process", json=payload, headers=headers)
    
    # 4. Assertions
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == DecisionOutcome.ALLOW
    assert data["actions"][0]["action_type"] == "IOT_CONTROL"
    assert "X-Request-ID" in response.headers

@patch("app.core.audit.AsyncSessionLocal", return_value=mock_session)
def test_full_flow_denied(mock_db):
    # 1. Token WITHOUT capabilities
    token = create_access_token(data={"sub": "guest", "caps": []})
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "type": "VOICE_COMMAND",
        "intent": "turn_on_light",
        "payload": {}
    }
    
    response = client.post("/api/v1/process", json=payload, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == DecisionOutcome.DENY
    assert "Missing capability" in data["reason"]

def test_gate_authentication_fail():
    response = client.post("/api/v1/process", json={})
    assert response.status_code == 401
