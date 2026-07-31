# Command vs. Agent Execution Flow

This document details the operational differences between direct low-latency command execution and multi-step reasoning agent workflows within the ARI system.

---

## 1. Direct Command Flow

Used for immediate, single-intent actions (e.g., *"Turn on silent mode"* or *"Toggle display brightness"*).

```text
[ User Request ] ──► Gateway ──► IntentRouter (Direct Action) ──► Execution Worker ──► Target Action (<200ms)
```

1. **Routing**: `IntentRouter` classifies the request as a Direct Action.
2. **Execution**: The Gateway directly dispatches the task payload to the Go Execution Worker via Redis Pub/Sub.
3. **Performance**: Rapid execution loop with sub-200ms round-trip latency.

---

## 2. Agent Reasoning Flow

Used for complex, multi-step tasks requiring contextual planning (e.g., *"Analyze device battery drain over the past week and generate optimizations"*).

```text
[ User Request ] ──► Gateway ──► Agent Service (FastAPI)
                                         │
                                         ▼ (Generate AgentPlan)
                                  Execution Worker
                                         │
                                         ▼ (Stream Progress via WS)
                                  Client UI Dashboard
```

1. **Routing**: `IntentRouter` identifies a complex requirement and routes to the Python Agent service.
2. **Planning**: Agent generates an `AgentPlan` JSON object containing ordered dependency steps.
3. **Execution & Feedback**: Worker processes individual steps sequentially and streams status updates back to the UI via WebSockets.
