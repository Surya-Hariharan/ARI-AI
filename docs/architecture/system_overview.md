# System Architecture Overview

ARI is a polyglot, distributed voice assistant platform designed for modularity and high performance.

## Core Components
1. **Gateway (Go)**: Handles real-time WebSockets, auth, rate limiting, and audio stream ingestion.
2. **Agent Service (Python)**: Handles LLM orchestration, intent detection, planning, and LangChain/Semantic-kernel workflows.
3. **Execution Workers (Go)**: Handles background jobs, retries, timeout management, and API integrations.
4. **Mobile Client (Kotlin/Android)**: Manages foreground OS integrations, wakeword listening, and floating UI overlays.

## Component Architecture
`Gateway` <-> `Agent Service` <-> `Execution Worker`
