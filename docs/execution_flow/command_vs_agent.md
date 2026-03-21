# Command vs Agent Execution Flow

This document details the difference between a direct command and a planned agent execution.

## Direct Command
Used for immediate binary actions (e.g. "Turn off the lights").
1. IntentRouter classifies as Direct Action.
2. Gateway routes directly to Go Execution Workers.
3. Rapid processing < 200ms round trip.

## Agent Execution
Used for multi-step reasoning (e.g. "Research flights to Tokyo and summarize in a doc").
1. IntentRouter classifies as Agent Task.
2. Agent Service generates a multi-step `AgentPlan`.
3. Worker picks up individual steps, reports back intermediate states to the overlay UI via Gateway WS.
