# ARI Production Architecture: Target vs. Current

Status: **planning only — no code changed by this doc.** Companion to
`docs/architecture/self_hosted_stack_plan.md` (which covers the BaaS/vendor layer —
auth, DB hosting, Firebase cleanup). This doc covers service topology, inter-service
communication, the voice pipeline, and observability.

## Target topology

```
Flutter App
     │
 REST / WebSocket / gRPC
     │
 API Gateway (JWT validation, rate limiting, routing, logging,
              request IDs, API versioning, CORS, compression)
     │
 Auth │ AI Core │ Voice │ Memory │ Analytics
     │
 Event Bus / Message Broker
     │
 Notification │ Search Index │ Logging │ Workers
```

Target communication stack:

| Connection | Technology |
|---|---|
| Mobile → Backend | REST + WebSockets |
| AI Streaming | WebSockets |
| Voice Streaming | WebSockets |
| Service → Service | gRPC |
| Background Jobs | Message broker + workers |
| Event Distribution | Event bus |
| Caching | Redis |
| Database | PostgreSQL + pgvector |
| File Storage | MinIO (self-hosted) |
| Search | Hybrid BM25 + pgvector |

Target voice pipeline:

```
Microphone → RNNoise/DeepFilterNet → Silero VAD → OpenWakeWord
  → pyannote.audio (diarization) → SpeechBrain (speaker verification)
  → Whisper → AI Core → Kokoro TTS → Speaker
```

## What's actually in the repo today

| Area | Current reality | Gap vs. target |
|---|---|---|
| Gateway | Single Go/Fiber service (`backend/gateway/main.go`) handling REST (`/api/auth`, `/api/user`) + one WebSocket route (`/execution/stream`, via `gofiber/websocket/v2`) | No gRPC anywhere in the repo (only third-party `.proto` files inside a Python venv, not repo code). No rate limiting, no request-ID/correlation-ID middleware. No API versioning (`/v1/` etc.) — CORS is present |
| Service → service comms | Everything currently talks over what the gateway calls directly (REST) or shares Redis as a store | No gRPC, no event bus (no Kafka/RabbitMQ/NATS), no Redis Streams/pub-sub — Redis is used purely as cache/store today |
| Background jobs | `backend/execution` (Go service) — separate from gateway, purpose not fully mapped in this pass | No Celery/asynq/message-broker-backed worker pool. Same open question flagged in the companion doc: does `execution` become the worker tier, or something else? |
| Voice pipeline | `dsp_engine.py` (noisereduce) → `wake_engine.py` (webrtcvad + pvporcupine/Porcupine) → `siv_service.py` (SpeechBrain, verification only) → `asr_engine.py` (faster-whisper) → `tts_engine.py` (edge-tts, piper-tts) | Every stage differs from the target: noisereduce vs. RNNoise/DeepFilterNet; webrtcvad vs. Silero VAD; Porcupine vs. OpenWakeWord; no pyannote diarization stage exists (SpeechBrain does verification, not multi-speaker diarization); TTS is edge-tts/piper, not Kokoro. Functionally in the same shape (denoise → VAD → wake → speaker-ID → ASR → TTS), just different libraries at each stage |
| Search | FAISS + ChromaDB for vector search (`rag_engine.py`) | No pgvector (no vector extension in any `supabase/migrations/*.sql`), no BM25/Elasticsearch/Meilisearch/Typesense — so no hybrid search yet |
| Object storage | None | MinIO not introduced (same finding as the companion doc) |
| Secrets | `.env` files only | No Vault or cloud secrets manager |
| Observability | None found | No OpenTelemetry, no Prometheus metrics endpoint, no structured logging, no correlation IDs — nothing to attach a trace to yet |
| "Repository Analysis" feature (upload repo → AST parse → dependency graph → embeddings → knowledge graph) | **Does not exist in the repo at all** — no AST parser, dependency graph, or knowledge-graph code, and "repository" only appears as a doc heading | This isn't a gap in an existing feature, it's new scope. Worth confirming: is this an actual planned ARI feature (e.g. "point ARI at a codebase and ask questions about it"), or general best-practice framing that doesn't apply yet? |

## Reconciliation notes

- The **shape** of the target architecture (gateway → domain services → event bus → workers) is a natural evolution of what exists, not a contradiction of it — today it's just a monolith-per-service (gateway, agent, execution) talking directly instead of through gRPC/an event bus. Introducing gRPC and an event bus is additive, not a rewrite, but it's real new infrastructure (a broker to run and operate) — worth sequencing behind whatever's actually causing pain (e.g. don't add Kafka before there are two services that need decoupling).
- The **voice pipeline swap** (RNNoise/DeepFilterNet, Silero VAD, OpenWakeWord, pyannote, Kokoro) is a set of model/library replacements for stages that already work end-to-end today. Each swap should be justified individually (e.g. "Porcupine has a per-wakeword licensing cost, OpenWakeWord doesn't" or "pyannote adds multi-speaker handling Porcupine+SpeechBrain don't do today") rather than adopted wholesale, since the current pipeline is functional.
- **gRPC vs. REST/WebSocket internally**: with only three backend services today (gateway, agent, execution), the case for gRPC is about future scale, not a current bottleneck. Reasonable to defer until a second real internal caller exists.
- **Repository Analysis** is flagged above as new scope — recommend confirming intent before it's treated as part of the roadmap.

## Suggested sequencing (once the above is confirmed)

1. Add request-ID/correlation-ID middleware + basic rate limiting to the gateway — cheap, immediately useful, no new infra.
2. Add pgvector to the self-hosted Postgres migration (once that migration itself happens, per the companion doc) and evaluate FAISS/Chroma → pgvector consolidation.
3. Decide `backend/execution`'s role before introducing a message broker — don't stand up Kafka/RabbitMQ speculatively.
4. Observability (structured logging + correlation IDs + Prometheus) before gRPC/event bus — you'll want it to debug the more complex topology once it exists.
5. Voice pipeline library swaps evaluated one at a time against the current implementation, not as a batch replacement.
6. gRPC and event bus introduced only when there's a concrete second/third service that needs decoupled, low-latency communication — not preemptively.

## Non-goals of this doc

Planning/reference only. No gateway, agent, execution, or migration code was changed while writing it.
