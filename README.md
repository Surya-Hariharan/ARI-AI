# ARI — Adaptive Runtime Intelligence

> A controlled execution environment with a voice interface.

ARI is an Android-first AI assistant backend built on the **Gate → Decide → Act → Record** architecture. It treats voice as untrusted input, adapts to OEM constraints, and uses Groq for intelligent device health recommendations — without ever giving AI direct device control.

## Architecture

```
Android Device → ARI Gate → Decision Engine → Action Layer → Audit Log
                    │              │
                    │         OEM Intelligence
                    │              │
                    └── Groq Recommendation Engine (analysis only)
```

### Core Principles
- **Groq never controls the device** — it only explains and recommends
- **Default = deny** — the system earns trust through restraint
- **Every failure is visible** — immutable audit logging
- **Android constraints are respected** — not fought

## Backend Stack

| Component | Technology |
|-----------|------------|
| API Framework | FastAPI |
| Database | PostgreSQL (async via asyncpg) |
| Cache / Rate Limiting | Redis |
| AI Intelligence | Groq (llama-3.3-70b) |
| Logging | structlog (structured JSON) |
| Auth | JWT + Capability-based permissions |

## Project Structure

```
app/
├── api/
│   ├── routes.py                 # Gate → Decide → Act → Record endpoint
│   ├── intelligence_routes.py    # Groq-powered device analysis
│   └── dependencies.py           # Auth + context injection
├── core/
│   ├── security.py               # JWT + capabilities
│   ├── middleware.py              # Request gate (ID, logging)
│   ├── rate_limit.py             # L2/L3 rate limiting + replay protection
│   ├── rate_limit_middleware.py  # L1 API rate limiting
│   ├── audit.py                  # Immutable audit logging
│   ├── redis.py                  # Async Redis client
│   ├── database.py               # Async SQLAlchemy setup
│   └── logger.py                 # Structured logging
├── domain/
│   ├── models.py                 # Strict Pydantic models
│   ├── logic.py                  # Pure decision engine
│   ├── oem_rules.py              # OEM-specific constraints
│   └── normalizer.py             # Data firewall for Groq
├── services/
│   ├── executor.py               # Action execution (IoT, TTS, etc.)
│   └── groq_client.py            # Constrained Groq integration
├── config.py                     # Environment configuration
├── main.py                       # FastAPI app entry point
└── models.py                     # SQLAlchemy ORM models

frontend/
├── src/
│   └── api/
│       └── client.ts             # Typed API client
└── ...
```

## Security Model

### Triple-Layer Rate Limiting
1. **L1 (API)** — 60 req/min per device (Redis sliding window)
2. **L2 (Intent)** — Per-action cooldown (prevents toggle spam)
3. **L3 (Voice)** — Single active session per device (prevents voice storms)

### Replay Protection
Every request can include `X-Nonce` + `X-Timestamp` headers. The backend validates freshness and uniqueness via Redis.

### Capability Tiers
| Tier | Actions | Auth |
|------|---------|------|
| Safe | Flashlight, battery status | Voice allowed |
| Sensitive | Wi-Fi, Bluetooth toggle | Voice + confirmation |
| Restricted | Security settings | Manual only |

## Quick Start

### Backend
```bash
# 1. Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env  # Edit with your values

# 4. Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Verify
```bash
# Health check
curl http://localhost:8000/health

# Intelligence endpoint (requires GROQ_API_KEY in .env)
curl -X POST http://localhost:8000/api/v1/intelligence/analyze \
  -H "Content-Type: application/json" \
  -d '{"telemetry":{"battery":{"level":34,"charging":false,"health":"GOOD","screen_on_time_hours":5.2},"display":{"refresh_rate":"120Hz","adaptive":false,"brightness_avg":"HIGH","dark_mode":false}}}'
```

## License

MIT — see [LICENSE](LICENSE)
