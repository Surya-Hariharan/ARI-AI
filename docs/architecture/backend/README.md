# ARI Production Backend Architecture — Blueprint

**Status:** Design specification. Written 2026-08-01 against commit `84944a6`.
**Audience:** Senior/staff engineers implementing ARI's backend for production.
**Scope:** Complete target architecture — services, APIs, events, auth, email, data, security, observability, delivery — plus a gap audit of the code as it exists today.

---

## How to read this document set

| File | Covers |
|---|---|
| `README.md` (this file) | Executive summary, current-state snapshot, readiness scores, critical fix list |
| [`01-system-architecture.md`](01-system-architecture.md) | §1 Service topology, §2 API/protocol decisions, §3 API-vs-webhook analysis, service communication |
| [`02-authn-authz.md`](02-authn-authz.md) | §4 Authentication, §5 Authorization/RBAC |
| [`03-email-notifications.md`](03-email-notifications.md) | §6 Resend email infrastructure, §7 Notification architecture |
| [`04-events-data-queues.md`](04-events-data-queues.md) | §8 Event catalog, §9 Database design, §10 Caching, §11 Queues |
| [`05-security-observability-delivery.md`](05-security-observability-delivery.md) | §12 Security, §13 Observability, §14 CI/CD & deployment |
| [`06-diagrams.md`](06-diagrams.md) | §15 All 15 architecture diagrams (Mermaid) |
| [`07-readiness-audit.md`](07-readiness-audit.md) | §16 Full production-readiness audit, scores, prioritized remediation |
| [`roadmap/`](roadmap/) | **Implementation roadmap** — phases, dependency graph, migration plans, sprint plan, trackers, go-live checklist |

Existing docs in [`docs/architecture/`](../) (`production_architecture_plan.md`, `production_readiness_scorecard.md`, `self_hosted_stack_plan.md`) remain the source of truth for *stack choice rationale*. This set supersedes them on *backend design detail*.

---

## Executive summary

ARI today is a four-process system: a Go/Fiber gateway, a Python/FastAPI voice agent, a Go execution worker, and a React dashboard, over hosted Supabase Postgres and Redis. The domain decomposition is sound — the boundary between "reason about speech" (Python, GPU-bound, slow) and "serve requests / run tasks" (Go, latency-bound) is the right seam and should be preserved.

What is not production-grade is everything *between* those services: identity, authorization, delivery guarantees, and the trust model.

Three structural decisions drive the entire redesign:

**1. Authentication must move from "JWT is the session" to "session is the truth, JWT is a cache."**
Today `AuthRequired()` ([`auth_middleware.go:30`](../../../backend/gateway/auth_middleware.go#L30)) validates a 30-day HS256 token and nothing else. It never consults `user_sessions`. Consequence: `POST /api/user/session/revoke` and the session wipe inside forgot-password are both **no-ops** — the attacker's token keeps working for 30 days. The target is short-lived access tokens (10 min) + rotating, hashed, revocable refresh tokens, with a Redis-backed deny-list for the access-token window.

**2. Every cross-service and cross-user boundary needs an authorization decision, and today there are none.**
The agent service on port 8000 accepts unauthenticated requests for voiceprint enrollment, verification, `/execute`, RAG ingest, and TTS — and docker-compose publishes it to the host. Separately, `handleUpdateGoal`/`handleDeleteGoal` ([`user_handlers.go:264`](../../../backend/gateway/user_handlers.go#L264)) accept an object ID with no ownership predicate, so any logged-in user can mutate any other user's goals. The Row-Level Security in `007_rls_policies.sql` is decorative: it keys on `auth.uid()` (Supabase GoTrue), while the app authenticates with its own JWT over a privileged `DATABASE_URL` connection — no RLS policy ever evaluates in ARI's favor.

**3. Nothing that matters is durable.**
Emails are fired from bare `go func()` goroutines with no retry and no persistence. OTPs live in a per-process `sync.Map` that is neither replicated nor swept. Execution tasks go into Redis via `RPush`/`BLPop` — at-most-once, no ack, no visibility timeout, no DLQ; a worker crash silently drops the task. And the execution worker's own status write can never succeed, because `INSERT INTO execution_logs (id, task_id, device_id, status, metadata, created_at)` names three columns that do not exist in [`002_schema.sql`](../../../supabase/migrations/002_schema.sql) — so `/execution/status/:task_id` returns 404 for every task ever submitted.

The target replaces all three with one pattern: **write to Postgres in the same transaction as the business change (transactional outbox), then relay to NATS JetStream, then let idempotent consumers do the side effect with retry + DLQ.**

---

## The one bug to fix before anything else

[`backend/gateway/auth.go:handleForgotPassword`](../../../backend/gateway/auth.go#L360) is a full, unauthenticated account-takeover primitive:

```go
return c.JSON(fiber.Map{
    "status":       "sent",
    "new_password": newPassword, // Also return it so frontend can show copy button
})
```

An anonymous `POST /api/auth/forgot-password {"email":"victim@gmail.com"}` **rotates the victim's password to a value the attacker is handed in the response body**, and deletes their sessions. No token, no email round-trip, no proof of mailbox control. Rate limited only at 20/min/IP.

Secondary defects in the same handler: the new password is emailed in plaintext, and the reset is a *forced* rotation, so even without reading the response an attacker can lock any user out of their account at will.

This must be replaced by the standard single-use, hashed, expiring reset-token flow described in [§4.9](02-authn-authz.md#49-password-reset). It is item #1 on the remediation list.

---

## Current state, precisely

```
Client (React SPA, token in localStorage)
   │  HTTPS, Bearer JWT
   ▼
Gateway  :8080  Go/Fiber   ──HTTP──▶  Agent  :8000  Python/FastAPI  (NO AUTH)
   │  RPush "execution_tasks"                    ▲
   ▼                                             │ HTTP /execute (NO AUTH)
Redis  :6379  ────BLPop────▶  Execution :9090  Go┘
   │
   ▼
Supabase Postgres (pgxpool, MaxConns 15/instance)
```

| Concern | Today | Target |
|---|---|---|
| Access token | HS256, 30d, no `jti`/`aud`/`iss`, no revocation | HS256→EdDSA, 10 min, `jti`+`aud`+`iss`, Redis deny-list |
| Refresh token | none | opaque 256-bit, SHA-256 at rest, rotating, reuse-detection |
| Session store | `user_sessions.token` stores the **raw JWT** | `session_id` + `token_hash`, never the token |
| OTP store | in-process `sync.Map`, never swept | Redis, hashed, TTL, attempt counter, per-identity lock |
| MFA | none | TOTP + recovery codes (§4.14) |
| OAuth | env vars exist, zero implementation | Google/GitHub/Apple via PKCE (§4.7) |
| Authorization | none beyond "is logged in" | RBAC + ownership predicates + OpenFGA path (§5) |
| Service-to-service | plaintext HTTP, unauthenticated | mTLS (mesh) + SPIFFE/short-lived service JWT (§4.20) |
| Rate limiting | Fiber in-memory store (per-replica) | Redis sliding window + edge WAF (§12.9) |
| Queue | Redis `RPush`/`BLPop`, at-most-once | River (Postgres) + NATS JetStream, at-least-once + DLQ (§11) |
| Email | fire-and-forget goroutine, no retry | outbox → queue → Resend, idempotent, suppression list (§6) |
| Email webhooks | none | Svix-signed Resend webhook ingest (§6.4) |
| Events | none | 34-event catalog over NATS JetStream (§8) |
| Observability | `log.Printf`, no metrics, no traces | OTel → Prometheus/Loki/Tempo/Grafana (§13) |
| CI/CD | **no `.github/` at all**, no tests | GitHub Actions → GHCR → Argo CD, canary (§14) |
| Deployment artifact | dev `docker-compose.yml` with `air` + bind mounts | distroless images, Helm/Kustomize, K8s (§14) |

---

## Production readiness scores

Scored against the 15-dimension rubric in [`07-readiness-audit.md`](07-readiness-audit.md). "Production-grade" = 85%+.

| Subsystem | Score | One-line verdict |
|---|---:|---|
| Edge & network (WAF/DDoS/TLS/CDN) | **10%** | No edge tier exists; services bind straight to host ports |
| API Gateway | **45%** | Good bones — requestid, helmet, limiter, graceful shutdown — but wildcard CORS, per-replica limiter, unauthenticated routes |
| Authentication | **25%** | Argon2id and constant-time compare are right; everything around them is not |
| Authorization | **10%** | No RBAC, broken object-level auth, non-functional RLS |
| Email infrastructure | **40%** | Real Resend integration with sane fallbacks; no durability, no webhooks, no suppression |
| Notifications | **5%** | Does not exist beyond transactional email |
| Event-driven architecture | **5%** | No bus, no events, no outbox |
| Queue & workers | **20%** | Worker loop and graceful drain are correct; the queue underneath loses messages |
| Database | **40%** | Clean modular migrations; schema/code drift, no outbox, no partitioning, no PITR plan |
| Caching | **25%** | Redis present as a queue only; no cache-aside, no distributed locks |
| Voice/AI pipeline | **55%** | Genuinely the strongest subsystem; unauthenticated and unmetered |
| Security posture | **20%** | One critical ATO, multiple high findings, no secrets management |
| Observability | **20%** | Health/ready/live probes exist and are correct; nothing else |
| CI/CD & deployment | **10%** | No pipeline, no tests, no prod images, no IaC |
| Backup & DR | **15%** | Inherits Supabase backups; untested, no RTO/RPO, no runbook |
| **Overall** | **~26%** | Advanced prototype. Not deployable to untrusted users as-is. |

---

## Critical path to production

Full ordering with effort estimates in [§16.4](07-readiness-audit.md#164-prioritized-remediation-plan). The headline sequence:

**P0 — stop the bleeding (days)**
1. Remove `new_password` from the forgot-password response; replace with a hashed, single-use reset token.
2. Add `AuthRequired()` + ownership checks to `/execution/status/:task_id`, `/execution/stream`, `handleUpdateGoal`, `handleDeleteGoal`.
3. Put a shared secret (then mTLS) in front of the agent service; unpublish ports 8000/9090 from the host.
4. Pin CORS to known origins.
5. Fix the `execution_logs` insert/schema mismatch.

**P1 — make identity real (2–3 weeks)**
6. Access/refresh token split with rotation, hashing, reuse detection, and a working revocation path.
7. Move OTP + rate limiting to Redis with attempt caps and per-identity locks.
8. Transactional outbox + durable email worker with retry/DLQ.
9. Resend webhook ingest + suppression list.

**P2 — make it operable (3–4 weeks)**
10. OpenTelemetry across all three services; Prometheus/Loki/Tempo/Grafana; SLOs and alerts.
11. GitHub Actions CI with tests, `govulncheck`, `pip-audit`, image scanning, SBOM.
12. Production container images + Helm charts + Argo CD; migrations as a pre-sync job.

**P3 — make it scale (ongoing)**
13. NATS JetStream event bus; split the voice agent into realtime vs. batch tiers.
14. Read replicas, partitioning of `voice_events`/`interaction_logs`, ClickHouse for telemetry.
15. RBAC → OpenFGA, org/team tier, billing hooks.

---

## Design principles applied throughout

1. **Self-hosted first.** Every component defaults to open-source and vendor-portable, per the standing project principle. Where a managed service is used (Resend, Supabase today), the integration sits behind an interface with a documented self-hosted substitute (Postal/Listmonk, CloudNativePG).
2. **Synchronous only for user-blocking reads.** If the user is not waiting on it, it goes through the outbox.
3. **Every write path is idempotent.** Every consumer takes an idempotency key; every external call carries one.
4. **Latency budgets are contracts.** The voice path has a 1,200 ms P95 wake-to-first-audio budget; every component in it gets an explicit slice ([§2.2](01-system-architecture.md#22-latency-budget)).
5. **Zero trust between services.** No service trusts a caller because of network position.
6. **Biometric data is special-category data.** Voiceprints get envelope encryption, dedicated key rotation, explicit consent, and a deletion path — legally, not just morally, required.
