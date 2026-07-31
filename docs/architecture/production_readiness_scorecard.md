# ARI Production Readiness: Scorecard vs. Current Repo

Status: audit + **cheap/safe tier implemented on 2026-08-01** (see "Implemented" section at the
bottom). Companion to `self_hosted_stack_plan.md` and `production_architecture_plan.md`.

This grades the current repo (`backend/gateway` Go/Fiber, `backend/agent` Python
FastAPI, `backend/execution` Go, DB in `supabase/migrations/`) against the 30-point
checklist and scorecard the user provided on 2026-08-01.

## 30-point checklist

| # | Principle | Status | Evidence |
|---|---|---|---|
| 1 | Service isolation | PARTIAL | 3 independently-buildable services (gateway/agent/execution) exist, but no independent deploy/scale config beyond `docker-compose.yml`; no per-service health-based orchestration |
| 2 | Database isolation | NO | All tables (users, agent_memory, voice_sessions, execution_logs, etc.) share one `public` schema in `supabase/migrations/002_schema.sql` — no schema/DB-per-service separation |
| 3 | API isolation (single gateway entry point) | YES | Flutter/frontend talks only to `backend/gateway`; agent/execution aren't directly exposed to clients |
| 4 | Authentication boundary | PARTIAL | JWT validated via `auth_middleware.go`; not yet verified whether `agent`/`execution` re-validate identity or trust the gateway implicitly |
| 5 | Authorization (RBAC) | NO | No role/permission checks found beyond "is this JWT valid" |
| 6 | Least privilege (service/API keys, DB roles) | NO | No `CREATE ROLE`/`GRANT` in migrations; all services share one DB connection string via one `.env` |
| 7 | Secrets management | NO | `.env` files only, no Vault/cloud secrets manager |
| 8 | Rate limiting | NO | No `limiter`/rate-limit middleware anywhere in the gateway |
| 9 | Input validation | PARTIAL | Some validation exists (`isValidName`, email domain allowlist in `auth.go`); not audited across every route |
| 10 | Output validation (no leaking internals) | NOT AUDITED | Needs a pass over error-response handling |
| 11 | Circuit breakers | NO | No `gobreaker`/`pybreaker` or equivalent pattern anywhere |
| 12 | Retry policy (backoff + jitter, capped) | PARTIAL | Gateway DB calls have `ExecuteWithRetry` (fixed backoff, no jitter); agent has a fixed 3-attempt retry for one external API call; no retry on outbound AI-provider calls |
| 13 | Timeouts | PARTIAL | Gateway has explicit `context`/`http.Client` timeouts (12s/30s); agent has per-call timeouts on some external requests; `backend/execution` has none found |
| 14 | Idempotency | NO | No idempotency-key handling on signup or any create endpoint |
| 15 | Queue isolation for heavy tasks | NO | No message queue exists yet (ties to the "no Celery/broker" gap in `production_architecture_plan.md`) |
| 16 | Event-driven design | NO | No event bus; same gap as above |
| 17 | Observability (trace/request/user/session IDs) | NO | No correlation-ID propagation anywhere |
| 18 | Structured logging | NO | Logging is plain `log.Println`/`print`-style, not structured, and not confirmed to scrub secrets |
| 19 | Monitoring (CPU/mem/queue/error rate) | NO | No Prometheus or any metrics endpoint |
| 20 | Health checks (`/health`, `/ready`, `/live`) | PARTIAL | `/health` exists in gateway and agent; none in `execution`; no `/ready` or `/live` distinction anywhere |
| 21 | Caching strategy (defined TTL/invalidation) | NOT AUDITED | Redis is used as a store/cache in places, but no documented policy for what's cached or for how long |
| 22 | Security headers (HSTS, CSP, etc.) | NO | No `helmet` middleware or manual security headers on the gateway |
| 23 | Encryption (TLS 1.3, Argon2id, key rotation) | NO | Plain HTTP (external termination assumed, not yet built); bcrypt not Argon2id; static single JWT secret, no key rotation |
| 24 | Audit logs (login, password change, deletion, role change) | NO | No dedicated audit-log table — only generic `execution_logs`/`interaction_logs` |
| 25 | Service discovery | NO | Hardcoded service URLs (`AGENT_URL=http://agent:8000` etc. in `docker-compose.yml`) — fine for Compose, won't survive a move to k8s unchanged |
| 26 | Independent scalability | NOT YET APPLICABLE | Single-replica Compose setup; no per-service scaling config exists to grade |
| 27 | Graceful shutdown | PARTIAL | Agent has lifespan shutdown handling; gateway and execution have no `SIGTERM`/`SIGINT` trap — Fiber's `app.Listen()` runs with no signal handling |
| 28 | API versioning | NO | Routes are `/api/auth`, `/api/user` — no `/v1` prefix or version negotiation |
| 29 | Dependency management (no circular deps) | PARTIAL | Only 3 services with a simple gateway→agent/execution shape today — no circular dependency observed, but not formally enforced |
| 30 | Testing (unit/integration/contract/e2e/load/security/chaos) | NO | Zero `*_test.go` in gateway or execution, zero `*.test.ts` in frontend; agent has some Python test-shaped files worth a closer manual look, but no integration/contract/e2e/load/chaos testing exists |

## Production Readiness Scorecard (as the user's checklist frames it)

| Category | Question | Current answer |
|---|---|---|
| Isolation | Can a service fail without taking down others? | Partially — processes are separate, but no circuit breakers/timeouts everywhere, so a slow `agent` call can still hang `gateway` requests |
| Ownership | Does it own its own data/logic? | No — one shared Postgres schema, one shared connection string |
| Security | Are authn/authz enforced? | Authentication yes (JWT); authorization/RBAC no |
| Validation | Is every input validated? | Partial — some routes validate, not systematically audited |
| Observability | Can every request be traced across services? | No — no correlation IDs, no tracing |
| Reliability | Retries/timeouts/circuit breakers implemented? | Partial timeouts, weak retries, no circuit breakers |
| Scalability | Can it scale independently? | Not yet meaningful — single-replica Compose, no per-service scaling |
| Resilience | Does it degrade gracefully if a dependency fails? | Largely untested/unimplemented |
| Maintainability | Independently deployable without breaking others? | Structurally yes (3 separate services/images), operationally unverified (no CI, no tests) |
| Performance | Caching/async/efficient comms used well? | Redis exists but caching policy undocumented; no async job queue yet |

**Honest summary: ARI's backend is functional and has some good bones (JWT auth, service separation, some timeouts/retries) but is not yet production-hardened by this checklist's bar.** The biggest, cheapest wins are gateway middleware (rate limiting, security headers, request IDs, graceful shutdown) and closing the DB-isolation/secrets gaps; the biggest, most expensive gaps (observability stack, full test pyramid, DB-per-service, event bus) are real projects, not quick patches.

## Suggested punch list, ordered by effort vs. impact

**Cheap, additive, low-risk (hours, not days) — safe to do without further design decisions:**
- Rate limiting middleware on the gateway (`gofiber/fiber/v2/middleware/limiter`)
- Security headers middleware (`gofiber/fiber/v2/middleware/helmet` or manual headers)
- Request-ID / correlation-ID middleware, propagated into logs
- Graceful shutdown (`SIGTERM`/`SIGINT` handling) for gateway and execution
- `/health` endpoint for `execution`; `/ready` and `/live` for all three
- Swap bcrypt → Argon2id (already flagged in `self_hosted_stack_plan.md`)

**Medium effort, needs a small design decision each:**
- Real exponential backoff + jitter + max-attempts for retries (replace fixed-delay loops)
- Idempotency keys on signup and any future job-creation endpoints
- Dedicated audit-log table (login, password change, deletion, role change) + write path
- JWT `kid`/key-rotation support
- RBAC — define roles/permissions model before enforcing it everywhere

**Larger, needs explicit planning before starting (don't start ad hoc):**
- DB isolation (schema-per-domain or DB-per-service) — real migration work, touches every query
- DB roles / least-privilege connection strings per service
- Circuit breakers around agent↔AI-provider and gateway↔agent calls
- Full observability stack (structured logging, correlation-ID propagation, OpenTelemetry, Prometheus) — sequenced in `production_architecture_plan.md` as "before gRPC/event bus"
- Test pyramid (unit/integration/contract/e2e/load/security/chaos) across all 3 services — currently ~zero automated tests outside the agent's Python files

## Implemented (2026-08-01): cheap/safe tier

- **Rate limiting** — global `limiter` middleware on the gateway (300 req/min/IP), plus a stricter
  `limiter` (20 req/min/IP) on `/api/auth` specifically to slow down credential-stuffing/OTP brute-force.
  (`backend/gateway/main.go`)
- **Security headers** — Fiber's `helmet` middleware added to the gateway. (`backend/gateway/main.go`)
- **Request-ID / correlation ID** — `requestid` middleware on the gateway, echoed via `X-Request-Id`.
  Full propagation into every log line across services is deferred to the observability-stack work below.
  (`backend/gateway/main.go`)
- **Graceful shutdown** — gateway and execution now trap `SIGINT`/`SIGTERM`, stop accepting new
  work, let in-flight work finish, then close DB/Redis connections. Agent already had this via FastAPI's
  lifespan + uvicorn's default signal handling. (`backend/gateway/main.go`, `backend/execution/main.go`)
- **Health endpoints** — `/live` and `/ready` added to all three services (`/ready` checks DB/Redis
  reachability where applicable). Execution didn't have any HTTP server before, so it now runs a small
  stdlib server on `EXECUTION_HEALTH_PORT` (default 9090) alongside its Redis-consumer loop.
  (`backend/gateway/main.go`, `backend/execution/health.go`, `backend/agent/main.py`)
- **Argon2id** — `HashPassword` now hashes with Argon2id (`golang.org/x/crypto/argon2`, already a
  transitive dependency, no new module needed). `CheckPassword` still verifies old bcrypt hashes
  (prefix `$2`) so existing users aren't locked out; new/changed passwords always get Argon2id.
  (`backend/gateway/auth_helpers.go`)
- **`docker-compose.yml`** — healthchecks added for gateway/agent/execution against `/ready`; execution
  now publishes port 9090 for its health server.
- **Bonus fix (unrelated, discovered along the way)**: `backend/agent/Dockerfile` referenced a
  nonexistent `agent_python/` directory and a `requirements.txt` that actually lives one level up —
  `docker-compose build agent` was completely broken before this pass. Fixed by pointing the agent's
  build context at `./backend` and copying `agent/` and `requirements.txt` from there, matching the
  pattern already used by the gateway/execution Dockerfiles.

Verified with `go build ./...` and `go vet ./...` (both clean) for gateway and execution, and
`python -m py_compile` for the agent's `main.py`. Docker wasn't running in this environment, so the
compose/Dockerfile changes are reviewed but not exercised end-to-end yet — run
`docker compose up --build` once to confirm the new healthchecks actually pass before relying on them.

## Non-goals of this doc

Audit/reference only for the sections above it. The "Implemented" section reflects real code changes
made in this repo on 2026-08-01 (see git history for `backend/gateway`, `backend/execution`,
`backend/agent/main.py`, `backend/agent/Dockerfile`, and `docker-compose.yml`).
