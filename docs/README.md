# ARI System Documentation

Welcome to the **ARI (Autonomous Reasoning Interface)** system documentation index. Here you will find architectural overviews, API specifications, execution flows, and engineering guidelines.

---

## 📚 Table of Contents

### 1. Developer Guides & System Guidelines
- [Developer Guide](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/DEVELOPMENT.md) — Local development, hot-reloading setup, database migrations, and security flags.
- [Engineering Guidelines](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/guidelines.md) — Repository hygiene, backend quality rules, voice pipeline rules, and dependency standards.

### 2. Architecture & Design
- [System Overview](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/architecture/system_overview.md) — Distributed microservice component architecture (Gateway, Agent, Execution).
- [Mobile & Overlay Lifecycle](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/architecture/mobile_overlay_lifecycle.md) — Foreground service and floating visual overlay state transitions.

### 3. API & Capability Specs
- [Device Capability Model](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/api/device_capability_model.md) — Device registration and capability payload abstraction.

### 4. Execution Flow
- [Command vs. Agent Execution](file:///c:/Users/surya/OneDrive/Desktop/ARI/docs/execution_flow/command_vs_agent.md5) — Comparison between direct command execution (<200ms) and multi-step reasoning agent plans.

---

## 🏗️ Architecture at a Glance

```text
[ Client / Web UI ]
        │
        ▼ (HTTP / WebSocket)
┌────────────────────────────────────────────────────────┐
│  API Gateway (Go Fiber) — Port 8080                    │
│  • Authentication (JWT & OTP)                          │
│  • Rate limiting & request routing                      │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               ▼ (Redis Pub/Sub)         ▼ (HTTP)
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  AI Agent Core (FastAPI)     │  │  Execution Worker (Go)       │
│  • Intent Detection & RAG    │  │  • Asynchronous Job Runner   │
│  • Multi-step Reasoning      │  │  • System & API Integrations │
└──────────────────────────────┘  └──────────────────────────────┘
```
