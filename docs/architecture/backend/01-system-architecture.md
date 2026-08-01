# §1–§3 System Architecture, API Design, and API-vs-Webhook

---

# §1 Overall Backend Architecture

## 1.0 Topology

```
                          ┌─────────────────────────────────────────┐
  Browser / Mobile /      │  Cloudflare: DNS · TLS · WAF · DDoS ·    │
  Edge device (mic)  ───▶ │  Bot mgmt · CDN (SPA + audio assets)     │
                          └──────────────────┬──────────────────────┘
                                             │
                          ┌──────────────────▼──────────────────────┐
                          │  Ingress / L7 LB  (Envoy Gateway)       │
                          │  mTLS termination · retries · outlier    │
                          │  detection · per-route timeouts          │
                          └──────────────────┬──────────────────────┘
                                             │
   ┌────────────────────────────┬────────────┴──────────┬───────────────────────┐
   ▼                            ▼                       ▼                       ▼
┌────────────┐   ┌────────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│ API GW     │   │ Voice Realtime Edge    │  │ Webhook Gateway  │  │ Admin Service      │
│ (Go/Fiber) │   │ (WS/WebRTC, Go)        │  │ (Go, isolated)   │  │ (internal only)    │
└─────┬──────┘   └───────────┬────────────┘  └────────┬─────────┘  └─────────┬──────────┘
      │ gRPC / mTLS          │ gRPC stream            │ enqueue              │
┌─────┴──────────────────────┴────────────────────────┴──────────────────────┴──────────┐
│                        Internal service mesh (mTLS, SPIFFE identities)                 │
└─┬────────┬────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬───────┘
  ▼        ▼        ▼         ▼         ▼         ▼         ▼         ▼         ▼
Identity  User    Org      Voice     Execution  Notif.   Email    File     Search
Service   Svc     Svc      Agent     Worker     Svc      Svc      Svc      Svc
                           (Py/GPU)  (Go)                                  (pgvector+
                                                                            Meilisearch)
  │        │        │         │         │         │         │         │         │
  └────────┴────────┴─────────┴────┬────┴─────────┴─────────┴─────────┴─────────┘
                                   │
   ┌───────────────┬───────────────┼───────────────┬────────────────┬──────────────┐
   ▼               ▼               ▼               ▼                ▼              ▼
 Postgres       Redis          NATS JetStream   MinIO/R2      ClickHouse      Vault/
 (primary +     (cache, RL,    (event bus +     (object       (analytics)     External
  2 replicas)    locks, OTP)    work queues)     storage)                      Secrets Op.
```

Anything not listed as "Phase 1" below is designed here but deliberately not built yet — see the phase column in §1.2.

## 1.1 Why each component exists

| Component | Exists because | Phase | Alternative considered → why rejected |
|---|---|---|---|
| **CDN + WAF (Cloudflare)** | The SPA is static; serving it from origin wastes origin capacity. ARI's auth endpoints are credential-stuffing targets, and an always-listening voice product is a natural DDoS target (cheap to send audio, expensive to process). Managed rules stop OWASP-class payloads before they reach Go. | 1 | Self-hosted Coraza/ModSecurity on Envoy — keep as the portable substitute; Cloudflare wins on volumetric L3/4 absorption, which cannot be self-hosted meaningfully. |
| **Ingress / L7 LB (Envoy Gateway)** | One place for TLS, per-route timeouts, retry budgets, circuit breaking, and canary traffic splitting. The gateway process should not be doing load balancing. | 1 | ingress-nginx — fine, but Envoy's outlier detection and native gRPC/xDS matter once the agent is split into realtime/batch tiers. |
| **API Gateway (Go/Fiber)** — *exists* | Single front door for the SPA: token verification, rate limiting, request-ID minting, request shaping, and fan-out to internal services. Keeps auth logic out of every downstream service. | 1 | GraphQL federation gateway — rejected: ARI's client is one first-party SPA with a small, stable surface; federation buys nothing and costs a schema registry. |
| **Voice Realtime Edge** | Wake-to-response is a *streaming* problem (§2.2). Terminating audio WebSockets/WebRTC inside the general API gateway couples slow, sticky, long-lived, memory-heavy connections to short REST requests and makes both scale badly. Split them. | 2 | Keep WS in the gateway (today's `/execution/stream`) — rejected: different scaling shape, different failure domain. |
| **Identity Service** | Auth is the highest-blast-radius code in the system and currently lives in the same binary as everything else. Extracting it lets it be reviewed, rate-limited, audited, and deployed independently, and creates one owner for `users`/`sessions`/`credentials`. | 1 | Keycloak / Ory Kratos (self-hosted, principle-compliant) — genuinely viable and reduces the auth surface you own. Rejected for Phase 1 only because ARI needs voiceprint-bound sessions and device trust, which need custom logic anyway. **Revisit at org/SSO time.** |
| **User Service** | Owns profile, preferences, goals, integrations — the CRUD tier. Separated from Identity so a profile bug can never touch credentials. | 1 | Fold into Identity — rejected: violates blast-radius separation. |
| **Organization Service** | Multi-tenant grouping: orgs, teams, membership, invitations, seat counts. | 4 (design only) | — Not built until ARI has a second tenant type. Documented in §5 so the `user_id`-everywhere schema doesn't have to be retrofitted painfully. |
| **Voice Agent Service (Python)** — *exists* | Wake detection, DSP, speaker verification, ASR, intent, planning, RAG, TTS. Python because the entire model ecosystem is Python; separate because it is GPU-bound, slow to start, and memory-heavy — the opposite scaling profile of the gateway. | 1 | Rewrite in Go — rejected: would mean reimplementing Whisper/SpeechBrain/openWakeWord bindings. |
| **Execution Worker (Go)** — *exists* | Runs multi-step plans against tools and devices. Separate so a hung integration can't consume gateway request capacity. | 1 | In-process goroutines in the gateway — rejected: no isolation, no independent scaling, no restart safety. |
| **Notification Service** | One channel-agnostic dispatcher for email/push/in-app/SMS so preferences, quiet hours, digests, and delivery status are implemented once rather than per-feature. | 2 | Per-feature notification code — rejected: guarantees drift and duplicate sends. |
| **Email Service** | Owns Resend adapter, templates, suppression list, and webhook-driven state. A dependency wrapper so provider swap is a one-file change (self-hosted-first). | 1 | Call Resend inline from handlers (today) — rejected: no retry, no suppression, no idempotency. |
| **Webhook Gateway** | Inbound third-party callbacks are unauthenticated internet traffic that must be verified, deduplicated, and enqueued *before* any business logic runs. Isolated process so a webhook flood can't starve user traffic. | 1 | Handle in API gateway — rejected: different threat model, different rate-limit policy, different scaling trigger. |
| **File Service** | Audio clips, enrollment samples, TTS artifacts, exports, model weights. Presigned direct-to-storage upload keeps large bodies out of the app tier. | 2 | Store audio in Postgres `bytea` — rejected: bloats WAL, breaks replication throughput, no CDN path. |
| **Search Service** | Two distinct needs: semantic retrieval for RAG (pgvector, colocated with the data) and keyword search over interaction history (Meilisearch). | 2 | Elasticsearch — rejected: operational weight is unjustified at ARI's scale; Meilisearch is self-hosted and single-binary. |
| **Payment Service** | Not needed yet. When it is: Stripe with webhook-driven state, never trusting client-reported success. Entitlements are derived from subscription events into a `entitlements` table the AuthZ layer reads. | 5 (design only) | — |
| **Admin Service** | Support and ops actions (impersonation, force-logout, quota grants) must be a separate, SSO-gated, fully audited surface — never flags on user endpoints. | 3 | Admin routes inside the API gateway guarded by a role — rejected: one middleware bug exposes god-mode on the public surface. |
| **Analytics Service** | Voice telemetry is high-volume append-only time series (`voice_events`, latency traces). Putting it in the OLTP primary is what kills the primary. | 3 | Keep in Postgres partitions — acceptable through ~10M events; ClickHouse beyond. |
| **Audit Service** | Compliance and forensics need an append-only, tamper-evident record that no service can update or delete. Distinct from application logs (which are lossy by design). | 2 | Reuse `interaction_logs` — rejected: mutable, user-scoped, RLS-governed, wrong retention. |
| **Event Bus (NATS JetStream)** | Decouples producers from consumers so adding "index this for search" doesn't require editing the signup handler. Provides at-least-once delivery, replay, and consumer lag as a first-class metric. | 2 | Kafka/Redpanda — rejected for Phase 2: operationally heavier than ARI needs. NATS JetStream is a single Go binary, clusters trivially, and supports both pub/sub and work queues. Revisit if event volume exceeds ~50k/s or you need long-horizon replay/compaction. |
| **Queue (River, Postgres-backed)** | Jobs must be enqueued **in the same transaction** as the data change that justifies them. That is only possible in the database. Solves the current at-most-once Redis loss. | 1 | Asynq (Redis) — faster, but enqueue is not transactional with Postgres, reintroducing dual-write. Use Asynq only for cheap, loss-tolerant, high-rate jobs. |
| **Scheduler** | Two kinds: infra-level periodic jobs (K8s `CronJob`) and user-scoped future work (`scheduled_jobs` table polled by a leader-elected worker). | 2 | In-process `time.Ticker` — rejected: fires N times with N replicas. |
| **Cache (Redis)** — *exists* | Sessions, deny-lists, rate-limit counters, OTP, permission decisions, distributed locks, TTS phrase cache. | 1 | Dragonfly as a drop-in if a single Redis becomes the bottleneck. |
| **Database (Postgres)** — *exists* | Relational, transactional, with `pgvector` for RAG and `pgcrypto` for envelope encryption — one engine covering OLTP + vector. | 1 | Mongo/Dynamo — rejected: ARI's data is highly relational and needs multi-row transactions for the outbox. |
| **Object Storage (MinIO / R2)** | Blobs belong in blob storage. S3-compatible so MinIO (self-hosted) and R2 are interchangeable. | 2 | — |

## 1.2 Service specifications

Each service below follows the same template: purpose · responsibilities · inputs · outputs · APIs · events · data ownership · security · failure handling · retries · rate limits · monitoring · scaling.

---

### 1.2.1 API Gateway (Go/Fiber) — *exists, `backend/gateway/`*

**Purpose.** The only internet-reachable entry point for the SPA and mobile clients.

**Responsibilities.** Terminate client requests; verify access tokens and populate a request principal; enforce Redis-backed rate limits; mint/propagate `X-Request-Id` and W3C `traceparent`; validate request schemas; route to internal services over mTLS gRPC; shape responses; never contain business logic.

**Inputs.** HTTPS/JSON from browsers and devices; `Authorization: Bearer <access_token>`; `X-Device-ID`; multipart audio for enrollment.

**Outputs.** JSON responses; gRPC calls to Identity/User/Voice/Execution; job enqueues (via the owning service, not directly).

**APIs.** Public REST surface — see §2.4 for the full endpoint table.

**Events.** Produces none directly. It is not a source of truth; producing events from the gateway would mean events not tied to a committed transaction.

**Data.** *Owns nothing.* Today it writes `interaction_logs` and `user_sessions` directly ([`main.go:150`](../../../backend/gateway/main.go#L150), [`auth.go:238`](../../../backend/gateway/auth.go#L238)); both writes move to their owning services.

**Security.** Wildcard CORS (`AllowOrigins: "*"`, [`main.go:53`](../../../backend/gateway/main.go#L53)) → replace with an explicit allowlist from `ALLOWED_ORIGINS`. `helmet` is already enabled — good; add an explicit CSP and HSTS max-age. All routes deny-by-default: authentication is applied at the router group level, not per-handler, so a new route cannot be accidentally public. (Today `/execution/status/:task_id` and `/execution/stream` are public precisely because of per-handler opt-in.)

**Failure handling.** Per-dependency circuit breakers (`sony/gobreaker`): open after 5 consecutive failures or 50% error rate over 20 requests, half-open probe at 30 s. Downstream unavailable → `503` with `Retry-After`; never a naked 500. Deadline propagation: client timeout budget minus 100 ms is passed downstream as a gRPC deadline so a slow agent cannot pile up gateway goroutines. The current 12 s hardcoded agent timeout ([`main.go:124`](../../../backend/gateway/main.go#L124)) becomes a per-route budget.

**Retries.** Only for idempotent GETs and only at the ingress layer: 2 attempts, 50 ms base exponential backoff with full jitter, retry budget capped at 10% of request volume (prevents retry storms turning a brownout into an outage). Never retry non-idempotent POSTs without an `Idempotency-Key`.

**Rate limiting.** Redis sliding window, keyed by `(route class, principal ?? IP+ASN)`. Classes in §12.9. Today's `limiter.New` uses Fiber's default in-memory store — with N replicas the effective limit is N×300/min and resets on every deploy.

**Monitoring.** RED metrics per route; `http_request_duration_seconds` histogram; 401/403/429 rates as security signals; circuit-breaker state gauge; in-flight request gauge.

**Scaling.** Stateless → HPA on CPU (70%) and P95 latency. Start 3 replicas across 3 AZs. Connection pool sizing: `MaxConns 15` per replica × replicas must stay under the Supabase pooler ceiling — at 20 replicas that is 300 connections and will exhaust it. Gateway should hold ≤5 direct DB connections once writes move to owning services.

---

### 1.2.2 Identity Service (Go) — *new, extracted from `backend/gateway/auth*.go`*

**Purpose.** Sole authority for who a principal is.

**Responsibilities.** Registration + email verification, login, MFA, OAuth, magic links, password reset, session lifecycle, refresh-token rotation and reuse detection, device registration and trust, account lockout, credential hashing, JWT signing and JWKS publication.

**Inputs.** Credentials, OTP codes, OAuth authorization codes, refresh tokens, device fingerprints.

**Outputs.** Access tokens (JWT), refresh tokens (opaque), session records, and events.

**APIs.** `POST /v1/auth/register`, `/verify-email`, `/login`, `/mfa/verify`, `/token/refresh`, `/logout`, `/logout-all`, `/password/forgot`, `/password/reset`, `/oauth/{provider}/start|callback`, `/magic-link/request|consume`, `/sessions`, `DELETE /sessions/{id}`, `/devices`. Internal gRPC: `VerifyToken`, `GetPrincipal`, `RevokeSessions`.

**Events produced.** `UserRegistered`, `UserVerified`, `UserLoggedIn`, `LoginFailed`, `PasswordChanged`, `PasswordResetRequested`, `MfaEnabled`, `SessionRevoked`, `RefreshTokenReuseDetected`, `AccountLocked`, `DeviceRegistered`. All via transactional outbox.

**Data owned.** `users`, `user_credentials`, `sessions`, `refresh_tokens`, `oauth_identities`, `mfa_factors`, `recovery_codes`, `email_verification_tokens`, `password_reset_tokens`, `devices`, `login_attempts`. No other service writes these.

**Security.** Argon2id at m=64MiB, t=3, p=2 — already correct in [`auth_helpers.go:37`](../../../backend/gateway/auth_helpers.go#L37) and worth preserving verbatim. Constant-time comparison for every secret (already done for password hashes; **must be extended to OTP**, which currently uses `!=` at [`auth.go:186`](../../../backend/gateway/auth.go#L186)). Uniform response timing and uniform error text on login and reset to prevent enumeration — note the current asymmetry: forgot-password correctly refuses to confirm existence, while signup returns `409 "An account with this email already exists"`, which enumerates.

**Failure handling.** Database unavailable → fail closed (503), never fall back to a permissive path. Email provider down → the verification record is still committed; the send retries from the outbox, and the user can request a resend.

**Retries.** No automatic retry on credential verification (each attempt increments the lockout counter). Outbound email/webhook effects retry from the queue.

**Rate limits.** `/login` 5/min/account + 20/min/IP; `/register` 3/hour/IP; `/verify-email` 5 attempts per OTP then invalidate; `/password/forgot` 3/hour/account, 10/hour/IP; `/token/refresh` 60/min/session.

**Monitoring.** Login success/failure ratio, lockouts/min, refresh-reuse detections (paging alert — indicates token theft), token verification P99, OTP delivery→verify funnel.

**Scaling.** Stateless, 3+ replicas. Argon2id at 64 MiB is intentionally CPU- and memory-expensive: budget ~1 vCPU per 10 concurrent logins and rate-limit accordingly, or a login flood becomes a self-inflicted DoS. Consider a dedicated node pool.

---

### 1.2.3 Voice Agent Service (Python/FastAPI) — *exists, `backend/agent/`*

**Purpose.** All speech and reasoning: wake → DSP → speaker verification → ASR → intent → plan → RAG → TTS.

**Responsibilities.** Own the 44 endpoints currently in [`main.py`](../../../backend/agent/main.py); maintain per-session runtime state in `VoiceArchitectureRuntime`; hold model weights in memory.

**Split (Phase 3).** Two deployments from one codebase:
- `voice-realtime` — wake, DSP, SIV, ASR, TTS. Latency-critical, GPU, sticky sessions, HPA on queue depth and GPU utilization, `maxUnavailable: 0` during rollout.
- `voice-batch` — planner, RAG ingest, embeddings, model-update jobs. Throughput-critical, tolerates queueing, scales to zero.

They fail independently: batch being down must never break wake-word response.

**Inputs.** PCM audio frames, base64 audio, transcripts, plan requests.
**Outputs.** Transcripts, embeddings, intents, plans, synthesized audio, telemetry events.

**APIs.** Internal-only gRPC + HTTP. **Today this service has no authentication of any kind** and docker-compose publishes `8000:8000`. Every endpoint — `/voice/enroll`, `/voice/verify`, `/voice/voiceprint/delete`, `/execute`, `/voice/rag/add_document` — is callable by anyone who can route to it. Minimum viable fix: mTLS from the mesh + a service JWT with an `aud: agent` claim; remove the host port publication.

**Events produced.** `VoiceSessionStarted/Ended`, `WakeWordDetected`, `SpeakerVerified/Rejected`, `TranscriptionCompleted`, `IntentClassified`, `PlanGenerated`, `LowConfidenceDetected`, `TtsSynthesized`.

**Data.** Owns `voice_sessions`, `voice_turns`, `voice_events`, `user_voice_profiles`, `low_confidence_events`, `model_update_jobs`. Voiceprints are special-category biometric data — see §9.7 and §12.6.

**Failure handling.** Every model stage has a declared degradation path: wake engine fails → fall back through openWakeWord → Porcupine → on-device heuristic (already implemented); ASR fails → return `low_confidence` and prompt for repeat, never a 500 into the user's ear; local Ollama unreachable → cloud LLM fallback if configured, else the trigger-command fast path; TTS fails → return text for client-side speech synthesis.

**Retries.** No retries inside the realtime path — a retry costs more than the budget allows. Batch jobs retry 3× with exponential backoff.

**Rate limits.** Per-user concurrent voice sessions (default 3); audio bytes/minute quota; LLM tokens/day quota. Without these, one client streaming audio can consume an entire GPU.

**Monitoring.** Per-stage latency histograms (already partly built via `latency_tracker.py`), wake false-accept/false-reject rates, SIV score distribution, ASR confidence distribution, model load time, GPU memory, and *model version* as a label on every metric.

**Scaling.** GPU node pool, HPA on custom metric `voice_queue_depth`. Model weights via an init container or PVC, never downloaded at pod start (start-up time dominates and HF Hub becomes a hard dependency of your availability).

---

### 1.2.4 Execution Worker (Go) — *exists, `backend/execution/`*

**Purpose.** Execute the multi-step plans the agent produces.

**Responsibilities.** Consume execution jobs; run steps in order; call tools/integrations; record per-step results; emit progress events; enforce per-step timeouts and overall task deadline.

**Current defects.**
1. **At-most-once delivery.** `BLPop` removes the task from Redis before it is processed; a crash loses it permanently, with no DLQ and no way to detect the loss.
2. **Status is never persisted.** `logExecution` inserts into `execution_logs (id, task_id, device_id, status, metadata, created_at)` — but the table defined in `002_schema.sql` has only `(id, task_id, status, output, timestamp)`. `device_id`, `metadata`, and `created_at` do not exist. Every insert fails, `ExecuteWithRetry` burns 3 attempts over 6 s, and `/execution/status/:task_id` therefore 404s for every task.
3. **No step-level idempotency.** A retried task re-runs completed steps, so "send a message" can send twice.
4. **`break` on first step failure** with no compensation — a half-applied plan leaves the world inconsistent with no record of which steps landed.

**Target.** River jobs on Postgres with `task_id` as the unique key; per-step records in `execution_steps` with `status` and `idempotency_key`; resume from the first non-completed step; compensating actions for reversible steps; poison-message detection → DLQ after 5 attempts; `ExecutionTaskFailed` event with the failing step index.

**Retries.** Exponential backoff 1s → 2s → 4s → 8s → 16s with full jitter, max 5 attempts, then DLQ. Non-retryable classes (validation error, permission denied, 4xx from a tool) fail immediately — retrying them is pure waste.

**Rate limits.** Per-user concurrent tasks (5), per-integration outbound rate (respect each third party's published limit), global worker concurrency cap.

**Monitoring.** Queue depth, oldest-job age (the single best saturation signal), job duration by intent, failure rate by step action, DLQ size (any non-zero value alerts).

**Scaling.** HPA on oldest-job age. Workers are stateless; concurrency per worker is bounded by the DB connection pool.

---

### 1.2.5 Email Service · 1.2.6 Notification Service · 1.2.7 Webhook Gateway

Fully specified in [`03-email-notifications.md`](03-email-notifications.md) (§6, §7) — they are the subject of dedicated sections rather than summarized twice.

---

### 1.2.8 Audit Service

**Purpose.** Append-only, tamper-evident record of security- and compliance-relevant actions.

**Responsibilities.** Consume audit events from NATS; write to a partitioned `audit_log` table with no `UPDATE`/`DELETE` grant for any application role; hash-chain each row (`prev_hash`, `row_hash`) so tampering is detectable; archive partitions older than 90 days to object storage with Object Lock; serve a read API to Admin.

**What is audited.** Every authentication outcome, every authorization denial, every privilege change, every access to biometric data, every admin action, every data export or deletion, every secret rotation.

**Retention.** 7 years for auth/authz and biometric access; 1 year for the rest. Never contains passwords, tokens, OTPs, or raw voiceprints — only stable identifiers and decisions.

**Scaling.** Write-only, batched inserts (100 rows or 1 s), monthly partitions.

---

### 1.2.9 File Service

**Purpose.** Blob lifecycle for audio, exports, and model artifacts.

**Flow.** Client requests `POST /v1/files/upload-url` → service validates declared MIME/size against policy, creates a `files` row in `pending` state, returns a presigned PUT valid 15 min → client uploads directly to MinIO/R2 (never through the app tier) → storage event or client callback → `FileUploaded` event → async pipeline validates *actual* content type by magic bytes (never trust the declared type), scans with ClamAV, transcodes audio, then marks `ready`.

**Security.** Presigned URLs are scoped to one key, one method, short expiry. Bucket policy denies public read; downloads go through short-lived presigned GETs. Enrollment audio is deleted after the embedding is extracted (default 24 h) — retaining raw biometric audio is a liability with no product benefit. SSRF guard: any URL-fetching feature resolves DNS first and rejects RFC1918/link-local/metadata addresses.

---

### 1.2.10 Search Service

**Two engines, two jobs.** `pgvector` in the primary for RAG retrieval — colocated with the source rows so there is no sync lag on the path that answers a user's question. Meilisearch for keyword search over interaction history — updated asynchronously from `SearchIndexRequested` events, where a few seconds of staleness is invisible.

**Failure handling.** Meilisearch down → keyword search degrades to a Postgres `tsvector` query, slower but correct. pgvector unavailable is a hard failure for RAG; the agent falls back to no-context answering and labels the response as such.

---

### 1.2.11 Analytics Service · 1.2.12 Admin Service

**Analytics.** Consumes the telemetry event stream into ClickHouse; serves aggregates to the dashboard (`SystemOverview.tsx`, `ControlDashboard.tsx`). Never queried by user-facing request paths synchronously — dashboards read pre-aggregated rollups. Business metrics: DAU, wake accuracy, task success rate, P95 wake-to-response, LLM cost per user.

**Admin.** Separate deployment, private ingress (VPN/Tailscale + SSO + mandatory MFA). Every action requires a ticket reference and writes an audit row. Impersonation issues a distinctly-scoped token (`act` claim naming the admin), is time-boxed to 30 min, is visible to the impersonated user in their session list, and can never be used to read biometric material.

---

# §2 API Design

## 2.1 Protocol decision matrix

| Capability | Protocol | Why | Latency target | Security | Scaling note |
|---|---|---|---|---|---|
| SPA ↔ backend CRUD (profile, goals, prefs, sessions, integrations) | **REST/JSON over HTTP/2** | Cacheable, debuggable, universally supported; the surface is small and stable | P95 < 150 ms | Bearer access token; deny-by-default routing | Stateless; horizontal |
| Service ↔ service (gateway→identity, gateway→agent, worker→agent) | **gRPC over mTLS** | Typed contracts, code-gen, HTTP/2 multiplexing, native deadlines and cancellation propagation; ~1.5–2× faster than JSON at these payload sizes | P95 < 50 ms | mTLS + SPIFFE identity + `aud`-scoped service JWT | Connection pooling; client-side LB via xDS |
| Live audio ingest (wake → response) | **WebSocket** (WebRTC for mobile) | Bidirectional, low-overhead framing; audio must stream, not buffer. WebRTC adds jitter buffering, adaptive bitrate, and NAT traversal for real devices | First-audio P95 < 1,200 ms | Token in the `Sec-WebSocket-Protocol` header (never in the query string — query strings land in access logs); per-connection quotas; 30 s idle timeout | Sticky sessions; separate deployment; connection-count-based HPA |
| Task progress → dashboard | **SSE** | One-way server→client. Half the complexity of WS, auto-reconnect with `Last-Event-ID` is built into browsers, works through every proxy | First event < 500 ms | Same-origin + bearer; per-user connection cap | Long-lived connections; one goroutine + one Redis subscription per client |
| Agent internal reasoning steps (plan → execute) | **Message queue (River/Postgres)** | The user is not blocking on it; must survive restarts; must be retryable | Enqueue < 20 ms; execution seconds–minutes | Job payloads carry principal + scopes, re-authorized at execution | Worker pool; scale on oldest-job age |
| Cross-service state propagation (user verified → provision profile) | **Event bus (NATS JetStream)** | Producer must not know consumers; new consumers must be addable without touching producers | Publish < 10 ms; end-to-end < 1 s | Per-subject NATS accounts; signed envelopes | Consumer groups; partition by `user_id` |
| Inbound third-party callbacks (Resend, OAuth, Stripe) | **Webhook** | The provider owns the timing; polling would be both slower and more expensive | Ack < 200 ms (verify + enqueue only) | HMAC/Svix signature verification, replay window, IP allowlist | Isolated deployment |
| Periodic maintenance (token cleanup, digests, reindex, backup verify) | **Cron** | Time-triggered, not event-triggered | N/A | Runs as a least-privilege service account | K8s `CronJob` with `concurrencyPolicy: Forbid` |
| Aggregations for dashboards | **Materialized views + rollup jobs** | Recomputing per request does not survive contact with real data volume | Read < 100 ms | Read-only replica | Refresh on schedule |
| Admin bulk queries | **REST + async export** | Long queries must not hold an HTTP connection | Job accepted < 200 ms | Admin SSO + audit | — |

**Explicitly rejected: GraphQL.** ARI has one first-party client, a small stable schema, and a latency-critical binary-audio path GraphQL does not serve. It would add a schema registry, N+1 risk, query-cost analysis, and persisted-query infrastructure to solve a problem (client-driven field selection across many clients) ARI does not have. Revisit if third-party clients or a public API appear.

## 2.2 Latency budget

The wake-to-first-audio budget is the system's defining constraint. Every component gets an explicit slice; anything without a slice does not belong on this path.

| Stage | Budget (P95) | Where |
|---|---:|---|
| Wake detection (on-device / edge) | 120 ms | `wake_engine_enhanced.py` |
| Audio frame transport to edge | 40 ms | WS/WebRTC |
| DSP (noise + echo suppression) | 60 ms | `dsp_engine.py` |
| Speaker verification | 150 ms | `siv_service.py` |
| ASR (streaming, partial-first) | 350 ms | `asr_engine.py` |
| Intent classification | 80 ms | `intent_engine.py` (pattern-first, LLM only on low confidence) |
| Plan/response generation | 300 ms | `planner_engine.py` / Ollama |
| TTS first chunk | 100 ms | `tts_engine.py` — stream chunks, never wait for full synthesis |
| **Total to first audible byte** | **1,200 ms** | |

Rules that fall out of this budget: intent classification must try patterns before the LLM (already the design); TTS must stream; frequently-used phrases are pre-synthesized into the Redis phrase cache; **no synchronous database write is permitted on this path** — all telemetry goes through the outbox.

## 2.3 API conventions

- **Versioning.** URL-prefixed `/v1/`. Breaking changes ship a new prefix; old versions get a 6-month deprecation window announced via a `Sunset` header.
- **Idempotency.** Every non-GET public endpoint accepts `Idempotency-Key`. The key + request-body hash + response are stored for 24 h; a replay with the same key returns the stored response, and a replay with a different body returns `422`.
- **Pagination.** Cursor-based (opaque, base64 of `(sort_key, id)`), never `OFFSET` — offsets degrade linearly and shift under concurrent writes.
- **Errors.** RFC 9457 `application/problem+json` with a stable machine-readable `type`, plus the `X-Request-Id` for support correlation. Error bodies never leak internals — today several handlers return raw failure context.
- **Validation.** Reject unknown fields; enforce max body size per route (audio routes already do this via `_max_audio_payload_bytes`, which is the right pattern to generalize).
- **Time.** RFC 3339 UTC everywhere. Durations in explicit units in the field name (`timeout_ms`).

## 2.4 Public endpoint surface

Legend: **A** = requires access token · **P** = public · **S** = service-to-service only · **RL** = rate-limit class (§12.9)

| Method | Path | Auth | RL | Notes |
|---|---|---|---|---|
| POST | `/v1/auth/register` | P | strict | Sends verification; response never reveals existence |
| POST | `/v1/auth/verify-email` | P | strict | 5 attempts, then token invalidated |
| POST | `/v1/auth/login` | P | strict | Returns access + refresh, or `mfa_required` |
| POST | `/v1/auth/mfa/verify` | P (mfa token) | strict | |
| POST | `/v1/auth/token/refresh` | P (refresh) | normal | Rotates; reuse ⇒ revoke family |
| POST | `/v1/auth/logout` | A | normal | Revokes this session |
| POST | `/v1/auth/logout-all` | A | strict | Revokes all sessions + all refresh families |
| POST | `/v1/auth/password/forgot` | P | strict | Always `202`; body reveals nothing |
| POST | `/v1/auth/password/reset` | P (reset token) | strict | Single-use; revokes all sessions |
| POST | `/v1/auth/password/change` | A + reauth | strict | Requires current password |
| GET | `/v1/auth/oauth/{provider}/start` | P | normal | PKCE + state |
| GET | `/v1/auth/oauth/{provider}/callback` | P | normal | |
| POST | `/v1/auth/magic-link/request` \| `/consume` | P | strict | Single-use, 10 min |
| GET/DELETE | `/v1/sessions` \| `/v1/sessions/{id}` | A | normal | Device management |
| GET/PATCH | `/v1/me` | A | normal | Profile |
| GET/PUT | `/v1/me/preferences` | A | normal | |
| GET/POST/PATCH/DELETE | `/v1/me/goals[/{id}]` | A + **owner** | normal | Ownership predicate in the WHERE clause, always |
| GET/POST | `/v1/me/integrations` | A | normal | |
| POST | `/v1/me/voice/enrollment` | A + reauth + consent | strict | Multipart; biometric consent recorded |
| DELETE | `/v1/me/voice/enrollment` | A | normal | Hard-deletes voiceprint + audio |
| POST | `/v1/me/export` \| `DELETE /v1/me` | A + reauth | strict | GDPR export / erasure, async |
| POST | `/v1/voice/commands` | A | voice | Enqueues; returns `task_id` + poll/stream URLs |
| GET | `/v1/voice/commands/{task_id}` | A + **owner** | normal | Currently unauthenticated |
| GET | `/v1/voice/commands/{task_id}/events` | A + **owner** | stream | SSE progress |
| WS | `/v1/voice/stream` | A | stream | Live audio |
| GET | `/v1/notifications` \| `POST /{id}/read` | A | normal | |
| GET/PUT | `/v1/notifications/preferences` | A | normal | |
| POST | `/v1/webhooks/resend` | P + **signature** | webhook | Verify → enqueue → `202`. Nothing else. |
| GET | `/healthz` \| `/readyz` \| `/livez` | P (cluster) | exempt | Already implemented correctly |
| GET | `/metrics` | S | exempt | Prometheus; must not be internet-reachable |

---

# §3 API vs Webhook vs Event vs Queue — per workflow

The decision rule used throughout: **synchronous if and only if the user cannot proceed without the result.** Everything else is queued. Anything a third party tells us is a webhook. Anything another service might want to know about is an event.

| # | Workflow | Pattern | Reasoning |
|---|---|---|---|
| 1 | **Registration** | API (sync) **+** event | The user must immediately learn whether the account was created. The email send, analytics, and default-preference provisioning are all consequences → `UserRegistered` via outbox. Never block the response on SMTP. |
| 2 | **Email verification** | API (sync) + event | Verifying is a user-blocking action. `UserVerified` then triggers welcome email + profile provisioning. Today the welcome email is a bare `go func()` — lost on restart. |
| 3 | **Password reset** | API (async ack) + queue + event | Return `202` unconditionally (no enumeration). The token email goes through the outbox. `PasswordChanged` fans out to session revocation and a security-alert email. |
| 4 | **Magic link** | API + queue | Request returns `202`; send is queued; consumption is a sync API that exchanges the single-use token for a session. |
| 5 | **OAuth login** | API (redirect) + sync callback | The OAuth dance is inherently synchronous and redirect-based. The provider's callback is *not* a webhook — it is a user-agent redirect and must be treated as untrusted input (validate `state`, verify PKCE, verify `id_token` signature against the provider JWKS). |
| 6 | **Login** | API (sync) | Blocking by definition. Emits `UserLoggedIn` for anomaly detection and device notifications. |
| 7 | **Token refresh** | API (sync) | Blocking. Must be atomic — rotation under `SELECT … FOR UPDATE` on the token family, or a race between two tabs revokes a legitimate session. |
| 8 | **Session revocation** | API (sync) + event | Sync DB write, then `SessionRevoked` so the gateway's deny-list is updated everywhere within the access-token TTL. |
| 9 | **Voice command (simple: "what time is it")** | API (sync) | Sub-second and side-effect-free. The `trigger_commands` fast path already handles these; forcing them through a queue would blow the latency budget. |
| 10 | **Voice command (multi-step plan)** | API (accept) + queue + SSE | Return `202 {task_id}` immediately; execute asynchronously; stream progress over SSE. Today the gateway does the plan call *synchronously* with a 12 s timeout and then queues — so the user waits on the LLM before even receiving a task ID. Planning should be the queue's first step. |
| 11 | **Live audio stream** | WebSocket | Continuous bidirectional binary; no other pattern fits. |
| 12 | **Voice enrollment** | API (sync accept) + queue | Upload and validate synchronously (the user must know the sample was usable); extract the embedding asynchronously; `VoiceProfileEnrolled` when done. |
| 13 | **Speaker verification** | Internal gRPC (sync) | On the critical path with a 150 ms budget. |
| 14 | **AI task completion** | Event + SSE | Worker emits `AiJobCompleted`; the notification service pushes it to the client's SSE stream and, if the client is gone, to push/email per preferences. |
| 15 | **File upload** | API (presigned) + storage webhook + queue | Bytes never traverse the app tier. Post-processing (magic-byte check, AV scan, transcode) is queued off the storage notification. |
| 16 | **Notification delivery** | Queue + event | Priority queues (§7.6); status transitions are events so history and retries are consistent. |
| 17 | **Email status updates** | **Webhook only** | Resend is the only party that knows if a message bounced. Polling would be O(messages) API calls. Verify signature → enqueue → `202` → process asynchronously (§6.4). |
| 18 | **Bounce/complaint handling** | Webhook → event → queue | `EmailBounced` (hard) adds to the suppression list immediately; `EmailComplained` suppresses *and* opts the user out of all non-transactional mail. Non-negotiable for domain reputation. |
| 19 | **Organization invitation** | API + queue + event | Create the invite synchronously (the inviter needs the link); email it via the queue; `InvitationAccepted` triggers membership provisioning. |
| 20 | **Audit logging** | Event (async, guaranteed) | Must never be in the request's critical path, and must never be lost → outbox with at-least-once delivery to an append-only sink. |
| 21 | **Analytics** | Event (async, lossy-tolerant) | Fire-and-forget to NATS; sampled at high volume. Losing 0.1% of analytics is fine; losing an audit row is not. Different guarantees, different pipelines. |
| 22 | **Search indexing** | Event + queue | `SearchIndexRequested` → worker upserts into Meilisearch. Eventual consistency is acceptable and invisible. |
| 23 | **Image/audio processing** | Queue | CPU-bound and slow; nobody waits synchronously. |
| 24 | **Large report / data export** | API (accept) + queue + notification | `202 {job_id}`, generate to object storage, email a presigned link on completion. |
| 25 | **Background model retraining** | Cron + queue | `model_update_jobs` already models this; scheduled, long-running, resumable. |
| 26 | **Third-party integrations (outbound)** | Queue | Third-party latency and rate limits must never be on the user's path; per-integration token buckets and circuit breakers. |
| 27 | **Third-party integrations (inbound)** | Webhook | Signature-verified, enqueued, deduplicated by provider event ID. |
| 28 | **Payment (future)** | API + webhook | Never trust a client's "payment succeeded". Subscription state is derived exclusively from Stripe webhooks into an `entitlements` table. |
| 29 | **Cache invalidation** | Event | Publish `EntityChanged`; each service invalidates its own keys. Never let one service reach into another's cache. |
| 30 | **Scheduled cleanup** (expired tokens, orphaned pending signups, old audio) | Cron | Note this is entirely missing today — `pendingSignups` grows without bound, and expired `otp_codes`/`user_sessions` rows are never deleted. |

---

# §14a Service communication rules

1. **No service reads another service's tables.** Cross-service data comes from an API or an event. Today the gateway writes `interaction_logs` and `user_sessions` directly and the execution worker writes `execution_logs` — both are ownership violations that will block independent deployment.
2. **Synchronous calls only downward.** Gateway → domain services → data. A domain service never synchronously calls back up or sideways; if it needs to, that's an event.
3. **Deadlines propagate.** Every gRPC call inherits the remaining request budget. No unbounded `context.Background()` on a request path — currently the norm in the gateway and execution worker.
4. **Every inter-service call is authenticated.** mTLS for channel identity, `aud`-scoped service JWT for authorization, plus the end-user principal forwarded as a signed assertion so downstream services can authorize the *user*, not just the caller.
5. **Correlation is mandatory.** `X-Request-Id` and W3C `traceparent` propagate through HTTP, gRPC, job payloads, and event envelopes. The gateway already mints a request ID and never forwards it — the single cheapest observability fix available.
