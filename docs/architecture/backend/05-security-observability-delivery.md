# §12–§14 Security, Observability, CI/CD & Deployment

---

# §12 Security Architecture

## 12.0 Defense in depth

```
L1 Edge        Cloudflare: DDoS · WAF · bot mgmt · TLS 1.3 · geo rules
L2 Network     Private VPC · no public IPs on services · NetworkPolicy default-deny
L3 Transport   mTLS everywhere internal · TLS 1.3 external · HSTS preload
L4 Identity    Short-lived tokens · MFA · device binding · SPIFFE service identity
L5 Authorization  RBAC · ownership predicates · deny-by-default · repository enforcement
L6 Application Input validation · output encoding · parameterized SQL · CSRF · CSP
L7 Data        Encryption at rest · envelope encryption for biometrics · field-level for PII
L8 Audit       Append-only, hash-chained, immutable
L9 Detection   Anomaly detection · security metrics · alerting · IR runbooks
```

## 12.1 Transport security

TLS 1.3 (1.2 minimum with only AEAD suites), certificates from Let's Encrypt via cert-manager with 30-day auto-renewal. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — Fiber's `helmet` middleware is already enabled, which is a good start, but its defaults must be reviewed and the `max-age` set explicitly. HTTP redirects to HTTPS at the edge only; origin listeners accept HTTPS only. Certificate Transparency monitoring alerts on any certificate issued for ARI domains outside the expected pipeline.

## 12.2 Security headers and CSP

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}';
  style-src 'self' 'nonce-{random}'; img-src 'self' data: https://cdn.ari.example;
  connect-src 'self' https://api.ari.example wss://api.ari.example;
  media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; object-src 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: microphone=(self), camera=(), geolocation=(self), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Per-request nonces, not `'unsafe-inline'` — an allowlist with `unsafe-inline` provides approximately no XSS protection. Note `microphone=(self)`: ARI genuinely needs it, which makes a strict `Permissions-Policy` more important than usual, since an injected iframe or script gaining microphone access in a voice product is the worst-case outcome.

## 12.3 CORS

```go
cors.New(cors.Config{
    AllowOrigins:     strings.Join(cfg.AllowedOrigins, ","),  // explicit list, no "*"
    AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    AllowHeaders:     "Authorization,Content-Type,X-Request-Id,Idempotency-Key,X-Device-ID",
    ExposeHeaders:    "X-Request-Id,Retry-After,RateLimit-Remaining",
    AllowCredentials: true,
    MaxAge:           600,
})
```

The current `AllowOrigins: "*"` ([`main.go:53`](../../../backend/gateway/main.go#L53)) means any website can invoke the API from a victim's browser. With bearer tokens in `localStorage` the browser will not attach credentials automatically, so this is not directly CSRF — but it removes a defensive layer, and it becomes immediately exploitable the moment the refresh-token cookie of §4.6 is introduced, because `AllowCredentials: true` with a wildcard origin is rejected by browsers and the temptation is to reflect the `Origin` header instead (which is equivalent to no CORS at all). Fix it before the cookie migration, not after.

## 12.4 CSRF

Bearer tokens in headers are inherently CSRF-resistant. Once refresh tokens move to cookies (§4.6): `SameSite=Strict` on `__Host-` prefixed cookies, the refresh endpoint accepts `POST` only, and `Origin`/`Sec-Fetch-Site` are validated. Add double-submit tokens only if a cross-site flow becomes necessary.

## 12.5 Injection

**SQL.** Every query in the repo uses pgx parameterized placeholders — genuinely correct today and worth protecting with a lint rule (`ban` on `fmt.Sprintf` inside `Exec`/`Query` calls) so it stays that way. The dynamic-filter code that will arrive with search is where this usually breaks: build with a query builder, never string concatenation, and allowlist sortable/filterable column names.

**Command injection.** The agent's `tools_service.action_router` is the chokepoint. No `shell=True`, no string-built commands; argument arrays only; every tool's parameters validated against a schema before execution.

**SSRF.** Any feature that fetches a user-supplied URL (RAG document ingest, integrations, webhooks-out) must: allowlist schemes to `https`, resolve DNS and reject RFC1918 / loopback / link-local / `169.254.169.254` / IPv6 ULA **after** resolution (checking the hostname before resolution is defeated by DNS rebinding), disable redirects or re-validate each hop, set a 5 s timeout and a response size cap, and egress through a dedicated proxy with its own allowlist.

**XSS.** The SPA uses React's default escaping; ban `dangerouslySetInnerHTML` by lint. Server-rendered email templates must move from `fmt.Sprintf` to `html/template` with contextual escaping (§6.7). API responses are always `application/json` with `nosniff`.

**Prompt injection** is ARI's distinctive injection class. A voice command or an ingested RAG document can contain instructions aimed at the planner. Mitigations: system prompts are never assembled from user content by concatenation; retrieved RAG content is delimited and explicitly marked untrusted; plan output is validated against a tool allowlist (the model never names an arbitrary endpoint); every step is authorized against the user's own permissions at execution time; destructive actions require a confirmation turn. Treat the LLM as a confused deputy by default.

## 12.6 Data protection

| Data | At rest | In transit | Notes |
|---|---|---|---|
| Passwords | Argon2id (m=64MiB,t=3,p=2) | TLS | Never logged, never emailed — the current reset flow violates both |
| Voiceprints | AES-256-GCM envelope, per-user DEK, KMS KEK | mTLS | Special-category; audited on every access; §9.7 |
| Transcripts / speech content | Postgres TDE + column encryption for content | TLS | 180-day retention; frequently the most sensitive non-biometric data |
| Session/refresh tokens | SHA-256 hash only | TLS | Currently stored in plaintext |
| Email addresses | `pgp_sym_encrypt` + hash index | TLS | Hash used for joins and suppression |
| API keys | SHA-256 + 8-char prefix | TLS | Shown once |
| Backups | Encrypted, separate key, Object Lock | TLS | Restore drills quarterly |

## 12.7 Webhook security

Covered in §6.4. The five rules that generalize to any provider: verify the signature against the **raw** body before parsing; enforce a timestamp window to block replay; dedupe on the provider's event ID; return 2xx only after durable persistence; do all business logic asynchronously. Rotate webhook secrets with dual-secret acceptance during the overlap.

## 12.8 API key and secret management

See §4.16 and §4.18. Add to CI: `gitleaks` on every push and on the full history, GitHub push protection with a custom `ari_live_` pattern, and an automatic revoke-and-notify on any detected leak. The previously-committed Supabase credentials remain valid in git history and in every clone until they are **rotated** — deletion from the working tree is not remediation.

## 12.9 Rate limiting and DDoS

Redis sliding-window counters (not Fiber's in-memory store, which is per-replica and resets every deploy — with 5 replicas today's "300/min" is really 1,500/min and drops to 300 during a rollout).

| Class | Limit | Key |
|---|---|---|
| `strict` (login, register, reset, OTP, enrollment) | 5–20/min | account + IP |
| `normal` (authenticated CRUD) | 300/min | user |
| `voice` (command submission) | 60/min | user |
| `stream` (WS/SSE connections) | 5 concurrent | user |
| `webhook` | 10,000/min | provider |
| `anonymous` | 60/min | IP + ASN |
| Global per-user cost budget | e.g. 1,000 "units"/hour | user |

Return `429` with `Retry-After` and `RateLimit-*` headers (RFC 9331) so clients can back off intelligently rather than hammering. Layer with edge protections: Cloudflare volumetric absorption, bot scoring, managed challenges on auth routes, and geo rules if the user base is regional.

**ARI-specific abuse vectors** that generic rate limits miss: audio bytes/minute per user (a client streaming continuous audio is cheap to send and expensive to process on GPU); LLM tokens/day per user (direct cost); concurrent voice sessions per user; wake-detection requests per device. Meter these explicitly or one client can consume a GPU node.

## 12.10 OWASP Top 10 status

| Risk | Current | Target |
|---|---|---|
| A01 Broken Access Control | **Failing** — `handleUpdateGoal`/`handleDeleteGoal` have no ownership check; `/execution/status` and `/execution/stream` are unauthenticated; RLS is non-functional | §5.4 repository enforcement, deny-by-default routing |
| A02 Cryptographic Failures | **Failing** — plaintext session tokens in the DB, plaintext passwords emailed, symmetric JWT secret shared across services | Hashed tokens, EdDSA, envelope encryption |
| A03 Injection | **Mostly passing** — parameterized SQL throughout; template `Sprintf` and prompt injection are the gaps | `html/template`, tool allowlists, SSRF guards |
| A04 Insecure Design | **Failing** — the forgot-password design is the vulnerability, not its implementation | §4.9 |
| A05 Security Misconfiguration | **Failing** — wildcard CORS, agent published to the host with no auth, dev compose as the deployment artifact | §12.3, mTLS, production manifests |
| A06 Vulnerable Components | **Unknown** — no scanning of any kind | `govulncheck`, `pip-audit`, Dependabot, Trivy |
| A07 Auth Failures | **Failing** — 30-day tokens, no revocation, no MFA, in-memory OTP with no attempt cap | §4 |
| A08 Integrity Failures | **Failing** — no SBOM, no image signing, no pinned digests | Cosign, SLSA provenance |
| A09 Logging Failures | **Failing** — `log.Printf` only, no audit log, no security alerting; OTPs printable to logs | §13 |
| A10 SSRF | **Unverified** — RAG ingest fetches URLs | §12.5 |

## 12.11 Supply chain

Pin dependencies by digest; commit lockfiles; Dependabot with grouped weekly PRs and immediate security patches; `govulncheck` (Go) and `pip-audit` (Python) as blocking CI gates; Trivy on every image; SBOM (CycloneDX) generated per build and attached to the release; Cosign keyless signing with an admission policy that refuses unsigned images; distroless base images running as a non-root user with a read-only root filesystem.

The Python side deserves particular attention — the agent pulls Whisper, SpeechBrain, transformers, and their transitive graph, which is a large attack surface with a history of pickle-deserialization issues. Model weights should be fetched from a pinned, checksummed internal mirror at build time, not from Hugging Face at pod start: it removes both the security exposure and a hard runtime dependency on a third party's availability.

## 12.12 Zero trust

No implicit trust from network position. Every request authenticated and authorized at every hop; service identity via SPIFFE, not IP; `NetworkPolicy` default-deny with explicit allows; no long-lived credentials (mesh certs rotate hourly, DB credentials are dynamic); continuous verification — a session revoked at time T stops working within the access-token TTL, not at expiry.

The clearest current violation: the agent service trusts anything that can reach port 8000. The clearest fix, in order — remove host port publication, add a service token, add `NetworkPolicy`, add mTLS.

## 12.13 Incident response

Severity ladder (SEV1 data breach / total outage → SEV4 minor). Runbooks required before launch for: credential compromise (rotate keys, revoke all sessions, force password reset, notify), token-signing-key compromise (rotate `kid`, invalidate all tokens), database compromise (assess, rotate, notify within 72 h per GDPR Art. 33), **voiceprint exposure** (biometric breach — highest severity, likely regulatory notification, and irreversible for affected users since a voiceprint cannot be reissued), and DDoS (edge rules, scale, degrade gracefully).

Break-glass access: separate credentials in a sealed store, requiring two-person approval, time-boxed, and fully audited with an automatic post-incident review.

---

# §13 Observability

## 13.0 Instrumentation standard

OpenTelemetry across all three services — one SDK, one wire format, swappable backends (self-hosted-first: nothing here requires a vendor).

```
Services ──OTLP──▶ OTel Collector ──┬──▶ Prometheus / Mimir   (metrics)
                                    ├──▶ Loki                 (logs)
                                    ├──▶ Tempo                (traces)
                                    └──▶ ClickHouse           (analytics events)
                                            ▼
                                        Grafana  +  Alertmanager
```

## 13.1 Structured logging

JSON to stdout, collected by the platform. Replace every `log.Printf` (Go) and bare `logging` call (Python) with a structured logger (`slog` / `structlog`) carrying a mandatory field set:

```json
{"ts":"2026-08-01T10:00:00.123Z","level":"info","service":"gateway","version":"1.4.2",
 "trace_id":"4bf92f...","span_id":"00f067...","request_id":"req_01J...",
 "user_id":"usr_01J...","route":"POST /v1/auth/login","status":200,"duration_ms":45,
 "msg":"login succeeded"}
```

Levels: `error` = needs human attention (paired with an alert or it is noise); `warn` = degraded but handled; `info` = state changes; `debug` = off in production, enabled per-request via a sampling header.

**Never logged:** passwords, tokens, refresh tokens, **OTP codes**, API keys, voiceprints, raw audio, full email bodies, or complete request bodies on auth routes. This is a live issue — [`auth_helpers.go:206`](../../../backend/gateway/auth_helpers.go#L206) prints the full email body, including the OTP, whenever no delivery backend is configured, and `auth.go:152` logs the pending-signup email and expiry at info level. Enforce with a redaction middleware in the logger plus a CI grep for known-sensitive identifiers.

Retention: 30 days hot in Loki, 1 year in object storage. Sampling: 100% of errors and warnings, 100% of auth events, 1% of successful high-volume requests.

## 13.2 Distributed tracing

A trace must span the entire request: SPA → gateway → identity/agent → queue → worker → external call. Context propagates over HTTP (`traceparent`), gRPC metadata, **job payloads**, and **event envelopes** — the last two are what most systems miss, and their absence is why "why did this user get two emails?" becomes unanswerable.

The gateway already generates a request ID via `requestid.New()` and never forwards it downstream. Propagating it (and adopting `traceparent`) is the single cheapest observability improvement available.

Sampling: 100% of errors, 100% of auth and payment flows, 100% of requests exceeding the latency SLO, 1–5% baseline, with tail-based sampling in the Collector so slow and failed traces are retained after the fact.

Voice-specific spans, matching the §2.2 budget: `wake.detect`, `dsp.process`, `siv.verify`, `asr.transcribe`, `intent.classify`, `plan.generate`, `tts.synthesize` — each with model version and confidence as attributes. This turns "it feels slow sometimes" into "P95 SIV latency regressed after model version X".

## 13.3 Metrics

**RED** for services (Rate, Errors, Duration), **USE** for resources (Utilization, Saturation, Errors).

| Category | Metrics |
|---|---|
| HTTP | `http_requests_total{route,method,status}`, `http_request_duration_seconds` (histogram), `http_in_flight` |
| gRPC | `rpc_client/server_duration`, per-code counters |
| Auth | `auth_login_total{result}`, `auth_lockouts_total`, `auth_token_refresh_total{result}`, `auth_refresh_reuse_detected_total`, `auth_mfa_verify_total{result}` |
| Voice | `voice_wake_detections_total{result}`, `voice_stage_duration_seconds{stage,model_version}`, `voice_speaker_score` (histogram), `voice_asr_confidence`, `voice_sessions_active` |
| Queue | `queue_depth{queue}`, `queue_oldest_job_age_seconds{queue}`, `job_duration_seconds{type,result}`, `job_retries_total`, `dlq_size{queue}` |
| Events | `events_published_total`, `events_consumed_total{consumer,result}`, `consumer_lag{consumer}` |
| Email | `email_sent_total{template,result}`, `email_bounce_rate`, `email_complaint_rate`, `email_queue_age_seconds` |
| DB | `db_connections{state}`, `db_query_duration_seconds`, `db_replication_lag_seconds`, `db_deadlocks_total` |
| Cache | `cache_hits/misses_total{key_class}`, `cache_evictions_total` |
| Business | `users_registered_total`, `voice_commands_total{intent,result}`, `task_success_rate`, `llm_tokens_total{model}`, `llm_cost_usd_total` |

Cardinality discipline: never label a metric with a user ID, session ID, or raw path. Route templates only (`/v1/goals/:id`, never `/v1/goals/abc-123`) — unbounded label cardinality is the most common way a metrics system is taken down.

## 13.4 Health checks

The three-probe split is already implemented correctly in both the gateway and the execution worker, and should be preserved:

| Probe | Semantics | Failure action |
|---|---|---|
| `/livez` | Process responsive | Restart the pod |
| `/readyz` | Dependencies reachable | Remove from the load balancer, do **not** restart |
| `/startupz` | Initial load complete (model loading — 30–120 s for the agent) | Delay other probes |

Two corrections: the gateway's `/ready` returns 503 when `DB == nil`, but `InitDB` returns `nil` (not an error) when `DATABASE_URL` is unset, so a misconfigured deploy fails readiness rather than failing fast at startup — better to refuse to start in production. Conversely, the execution worker's `/ready` reports ready when `DB == nil`, meaning a worker with no database passes readiness and silently drops every status write. Readiness must also be *shallow*: check a cached dependency status refreshed every few seconds, not a live `Ping` per probe, or the probe itself becomes load. And readiness must never cascade — if the agent marks itself unready because Redis is slow, and the gateway marks itself unready because the agent is unready, a minor blip becomes a total outage.

## 13.5 SLIs, SLOs, and error budgets

| Service | SLI | SLO | Error budget (30 d) |
|---|---|---|---|
| API Gateway | Availability (non-5xx / total) | 99.9% | 43 min |
| API Gateway | Latency P95 | < 200 ms | — |
| Auth | Login success latency P95 | < 500 ms | — |
| Auth | Availability | 99.95% | 21 min |
| Voice | Wake→first audio P95 | < 1,200 ms | — |
| Voice | Command success rate | > 98% | — |
| Email | Delivered within 60 s | > 99% | — |
| Execution | Task completion within SLA | > 99% | — |
| Data | Durability | 99.999999% | — |

Error-budget policy: >50% consumed → freeze risky changes; >100% → feature freeze until reliability work restores it. SLOs without a policy attached are decoration.

## 13.6 Alerting

Alert on **symptoms**, not causes — page on "login success rate dropped", not "CPU is high". Every page must be actionable, have a runbook, and be tuned to a false-positive rate under 5%; anything that does not meet that bar becomes a ticket, not a page.

| Alert | Condition | Severity |
|---|---|---|
| API error rate | 5xx > 1% for 5 min | page |
| Latency SLO burn | P95 > 2× target for 10 min | page |
| Auth failure spike | login failures > 5× baseline | page (attack) |
| **Refresh-token reuse** | any occurrence | page (token theft) |
| DLQ non-empty | any queue | page |
| Queue oldest-job age | > 5 min | page |
| Email bounce rate | > 5% | page |
| DB replication lag | > 30 s | page |
| Consumer lag | > 1,000 or > 60 s | page |
| Certificate expiry | < 14 days | ticket |
| Disk usage | > 80% | ticket |
| Dependency vulnerability | critical CVE | ticket (24 h SLA) |

Route by severity: page → PagerDuty/Grafana OnCall; ticket → Jira; info → Slack. Deduplicate and group in Alertmanager so a single failure does not produce forty pages.

## 13.7 Dashboards

Service overview (RED per service, dependency health, deploy markers overlaid on every graph — the fastest way to answer "did the deploy cause this"), voice pipeline (stage latency waterfall against the budget, wake accuracy, ASR/SIV distributions, active sessions, GPU utilization), auth security (login outcomes, lockouts, MFA adoption, geographic anomalies, reuse detections), queues and events (depth, age, throughput, DLQ, lag), business (DAU, commands/user, task success, LLM cost/user, retention), and infrastructure (nodes, pods, DB, Redis, NATS).

---

# §14 CI/CD & Deployment

## 14.0 Current state

There is no `.github/` directory, no pipeline, no test suite anywhere in the repository, and no production build artifact. The only deployment description is a development `docker-compose.yml` that bind-mounts source directories and runs `air` (Go hot reload) and `uvicorn --reload`. This is a perfectly good dev loop and completely unsuitable as a deployment target: source is mounted rather than baked, reloaders watch the filesystem, no image is versioned, no resource limits exist, and every service publishes its port to the host — including the unauthenticated agent on 8000.

## 14.1 Pipeline

```
PR opened
 ├─ lint            golangci-lint · ruff · eslint · sqlfluff
 ├─ typecheck       go vet · mypy · tsc
 ├─ unit tests      go test -race -cover · pytest · vitest        [gate: 70% coverage]
 ├─ integration     testcontainers: Postgres + Redis + NATS
 ├─ migrations      apply up, then down, then up again — on a scratch DB
 ├─ contract tests  JSON Schema validation for shared/schemas + event envelopes
 ├─ security        gitleaks · govulncheck · pip-audit · npm audit · semgrep
 ├─ build           multi-stage distroless images, SBOM, Cosign signature
 ├─ image scan      Trivy                                          [gate: no critical]
 └─ preview env     ephemeral namespace + smoke tests

merge to main
 ├─ build & push to GHCR with immutable digest tags
 ├─ deploy to staging (auto)
 ├─ e2e (Playwright) + load test (k6) against staging
 └─ promote to production (manual approval)

production
 ├─ pre-sync Job: database migrations (expand phase only)
 ├─ canary 5% → 25% → 50% → 100%, automated analysis between steps
 ├─ automatic rollback on SLO breach
 └─ post-deploy smoke tests + deploy marker into Grafana
```

Gates that block a merge: any failing test, coverage below threshold, any critical CVE, any leaked secret, any migration that fails to roll back.

`-race` on Go tests is worth calling out specifically — the current code has concurrent access patterns (the `sync.Map`, goroutine-spawned email sends) that a race detector would exercise.

## 14.2 Containers

Multi-stage builds; distroless or Alpine runtime; non-root user; read-only root filesystem; no shell in the final image; `HEALTHCHECK` defined; explicit resource requests and limits (the Python agent needs generous memory limits for model weights and a GPU resource request); pinned base image digests, not floating tags.

```dockerfile
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download                      # cached layer
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /gateway
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/gateway"]
```

The agent image is the harder one: bake model weights into a layer (or a pre-populated PVC) rather than downloading at start. Cold start with a download is minutes long, makes autoscaling useless, and makes Hugging Face's uptime a component of yours.

## 14.3 Kubernetes

Three environments (dev / staging / prod) as separate clusters or at minimum separate namespaces with strict `NetworkPolicy`, `ResourceQuota`, and `PodSecurityPolicy`/Pod Security Admission at `restricted`.

Per workload: `PodDisruptionBudget` (`minAvailable: 50%`), `topologySpreadConstraints` across AZs, anti-affinity so replicas never share a node, `terminationGracePeriodSeconds` long enough to drain (30 s gateway, 120 s workers — the execution worker's "finish the current task then exit" logic needs the longer window), and a `preStop` sleep so the pod leaves the LB's endpoint list before the process stops accepting.

Node pools: general (gateway, identity, workers), GPU (voice-realtime), memory-optimized (voice-batch, embeddings), spot instances for interruptible batch work only.

## 14.4 Deployment strategies

| Component | Strategy | Why |
|---|---|---|
| Stateless APIs | **Canary** via Argo Rollouts | Automated analysis on error rate and latency between steps; automatic rollback |
| Voice realtime | **Blue-green** | Sticky sessions and long-lived connections make gradual replacement disruptive; drain the old color |
| Workers | **Rolling**, `maxUnavailable: 0` | Jobs must drain; never lose in-flight work |
| Database | **Expand/contract**, never in-place breaking | Old and new code must both work against the intermediate schema |
| Frontend | Atomic CDN swap with instant rollback | |

Canary analysis: error rate < 1%, P95 latency within 20% of baseline, no increase in 5xx or 401/403. Failing any check triggers automatic rollback — a rollback that requires a human is a rollback that happens twenty minutes late.

## 14.5 Migrations in the pipeline

Expand/contract, always, with each phase in a **separate deploy**:

```
1. Expand   add a nullable column / new table          (old code unaffected)
2. Backfill batched, throttled, resumable job          (never a single UPDATE on a large table)
3. Dual-write  new code writes both, reads old
4. Switch   read from new
5. Contract drop the old column                        (only after a full rollback window)
```

Rules: migrations run as a pre-sync Job with an advisory lock, never from app startup; every migration is tested for rollback in CI; no `ALTER TABLE` that rewrites a large table during business hours; add constraints as `NOT VALID` then `VALIDATE CONSTRAINT` separately, which takes a far weaker lock. The `execution_logs` mismatch (§9.1 #1) is precisely the class of bug that a migration-versus-code contract test in CI catches on the PR that introduces it.

## 14.6 Infrastructure as code

Terraform for cloud resources (VPC, clusters, managed Postgres, object storage, DNS) with remote state, state locking, and `plan` posted to the PR. Helm or Kustomize for Kubernetes manifests, GitOps-delivered by Argo CD with auto-sync in dev/staging and manual approval in production. Secrets never in git: External Secrets Operator pulls from Vault into Kubernetes Secrets, or SOPS-encrypted values with age keys. Drift detection alerts on any manual change to production.

## 14.7 Autoscaling

| Workload | Metric | Min | Max |
|---|---|---|---|
| Gateway | CPU 70% + RPS | 3 | 50 |
| Identity | CPU 60% (Argon2id is CPU-heavy) | 3 | 20 |
| Voice realtime | Active sessions per pod | 2 | 20 (GPU-bound) |
| Voice batch | Queue depth | 0 | 10 |
| Workers | Oldest-job age (KEDA) | 2 | 30 |
| Webhook GW | RPS | 2 | 10 |

Cluster autoscaler with over-provisioning pods (low-priority placeholders) so a real scale-up does not wait on node provisioning. Vertical Pod Autoscaler in recommendation mode to right-size requests.

## 14.8 Rollback

| Failure | Rollback |
|---|---|
| Bad deploy | Argo Rollouts abort → previous ReplicaSet, < 2 min |
| Bad migration | Down migration if safe; otherwise PITR restore |
| Bad config | GitOps revert |
| Bad feature | Feature-flag kill switch, seconds — the fastest available lever, which is why risky changes ship behind flags |
| Data corruption | PITR to before the incident |

Every deploy is reversible within 5 minutes or it does not ship. Feature flags decouple deploy from release, so "roll back" usually means flipping a flag rather than redeploying.

## 14.9 Disaster recovery

| Scenario | RTO | RPO | Mechanism |
|---|---|---|---|
| Pod failure | seconds | 0 | K8s reschedule |
| Node failure | < 2 min | 0 | Reschedule + spread constraints |
| AZ failure | < 5 min | 0 | Multi-AZ, sync replica promotion |
| Region failure | < 4 h | < 5 min | Cross-region backups + IaC rebuild |
| Data corruption | < 1 h | < 5 min | PITR |
| Ransomware / malicious deletion | < 8 h | < 24 h | Immutable, Object-Locked, separate-account backups |

Quarterly game days: restore from backup and measure, kill a random pod, fail over the database, revoke a credential. **A DR plan that has never been executed is a document, not a capability** — and this is currently ARI's single largest untested assumption.
