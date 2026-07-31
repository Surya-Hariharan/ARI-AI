# System Architecture Overview

ARI is a polyglot, distributed voice & AI orchestration platform designed for modularity, low-latency execution, and high availability.

## Core Microservices

1. **API Gateway (`backend/gateway`)**: 
   - Written in **Go (Fiber)**.
   - Handles HTTP REST endpoints, real-time WebSockets, JWT session validation, OTP authentication, and audio stream ingestion.
   
2. **Agent Service (`backend/agent`)**: 
   - Written in **Python (FastAPI)**.
   - Acts as the cognitive reasoning engine handling intent detection, RAG context retrieval, LLM orchestration, and multi-step plan generation.

3. **Execution Worker (`backend/execution`)**: 
   - Written in **Go**.
   - Processes asynchronous execution tasks, background retry queues, timeout management, and system integrations.

4. **Frontend UI (`frontend`)**: 
   - Built with **React 18, Vite & TypeScript**.
   - Features responsive visual design, real-time WebGL ambient background rendering, and interactive telemetry dashboards.

## Component Communication Flow

```text
[ Client / Frontend ]
        │
        ▼ (HTTP / WebSocket)
  ┌───────────┐           (Redis Pub/Sub)          ┌───────────────┐
  │  Gateway  │ <────────────────────────────────> │ Agent Service │
  └─────┬─────┘                                    └───────┬───────┘
        │                                                  │
        └───────────────► [ Execution Worker ] ◄───────────┘
```
