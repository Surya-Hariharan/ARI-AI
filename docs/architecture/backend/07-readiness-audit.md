# §16 Production Readiness Audit

Audited against commit `84944a6`. Every finding below is a specific defect in the code as it exists, not a generic recommendation. Severity uses CVSS-style reasoning: **Critical** = exploitable now with severe impact; **High** = exploitable or causes data loss; **Medium** = degrades reliability or defense in depth; **Low** = hygiene.

---

## 16.1 Security gaps

### Critical

**S-1 · Unauthenticated account takeover via password reset.**
[`auth.go:handleForgotPassword`](../../../backend/gateway/auth.go#L360) rotates the target account's password on an anonymous request and returns the new password in the HTTP response body (`"new_password": newPassword`). An attacker who knows an email address obtains working credentials for that account with a single unauthenticated POST. Even ignoring the response body, the handler is an anonymous lock-out primitive: any user's password can be rotated at will.
*Fix:* §4.9 — token-based reset, always `202`, no state change until the token is presented.

**S-2 · Broken object-level authorization on goals.**
[`handleUpdateGoal`](../../../backend/gateway/user_handlers.go#L264) and [`handleDeleteGoal`](../../../backend/gateway/user_handlers.go#L281) execute `UPDATE user_goals SET status=$1 WHERE id=$2` and `DELETE FROM user_goals WHERE id=$1` with no `user_id` predicate. Any authenticated user can mutate or delete any other user's goals. OWASP API1:2023.
*Fix:* ownership predicate in the query plus a rows-affected check; systemically, §5.4's repository layer.

**S-3 · Voice Agent service is entirely unauthenticated and host-published.**
`backend/agent/main.py` defines 44 endpoints with no authentication, no authorization, and no CORS restriction, and `docker-compose.yml` publishes `8000:8000`. Reachable endpoints include `/voice/enroll` and `/voice/verify` (biometric enrollment and verification for arbitrary `user_id`), `/voice/voiceprint/delete`, `/execute` (arbitrary tool invocation), and `/voice/rag/add_document` (RAG poisoning → prompt injection into future answers).
*Fix:* remove host port publication, add a service-token middleware immediately, mTLS + user-assertion forwarding thereafter (§4.17).

### High

**S-4 · No token revocation.** `AuthRequired()` validates only the signature. `handleRevokeSession`, the session deletion in forgot-password, and any future logout are all no-ops for a 30-day token. §4.3.

**S-5 · Session tokens stored in plaintext.** `user_sessions.token TEXT UNIQUE` holds the live bearer JWT. Read access to the database — a SQL injection anywhere, a leaked backup, a misconfigured replica — yields working sessions for every user. §4.1.

**S-6 · Unauthenticated execution status and stream.** `/execution/status/:task_id` ([`main.go:180`](../../../backend/gateway/main.go#L180)) has no `AuthRequired()`; `/execution/stream` ([`main.go:196`](../../../backend/gateway/main.go#L196)) accepts any WebSocket connection. Task IDs are UUIDs, so enumeration is impractical, but any leaked ID is readable by anyone, and the WS endpoint is an unauthenticated resource-consumption vector.

**S-7 · Row-Level Security is non-functional.** All nine policies in `007_rls_policies.sql` key on `auth.uid()` (Supabase GoTrue). ARI mints its own JWTs and connects via `DATABASE_URL` as a privileged role, so `auth.uid()` is NULL and the app role bypasses RLS regardless. Seven further tables — `users`, `devices`, `user_sessions`, `otp_codes`, `agent_memory`, `execution_logs`, `user_integrations` — have no policies at all. The net effect is the appearance of defense in depth with none of the substance. §5.0.

**S-8 · OTP verification has no attempt limit and is not constant-time.** [`auth.go:186`](../../../backend/gateway/auth.go#L186) compares with `!=` and never counts failures per code. The only limit is 20 req/min/IP — and that limiter is per-replica and in-memory. §4.5.

**S-9 · Secrets in logs.** [`auth_helpers.go:206`](../../../backend/gateway/auth_helpers.go#L206) prints the full email body — including the OTP — whenever no delivery backend is configured or all backends fail. In production this writes account-takeover material into log aggregation. §13.1.

**S-10 · Wildcard CORS.** `AllowOrigins: "*"` with `Authorization` in `AllowHeaders`. Not directly exploitable with `localStorage` bearer tokens, but it removes a layer and becomes immediately dangerous when refresh cookies are introduced. §12.3.

**S-11 · Tokens in `localStorage`.** [`api/client.ts:80`](../../../frontend/src/api/client.ts#L80) and [`AuthContext.tsx:82`](../../../frontend/src/app/context/AuthContext.tsx#L82). A single XSS or compromised npm dependency exfiltrates a 30-day full-access credential. (They also use different keys — `ari_token` vs `ari_auth_token` — so the two client layers do not share auth state.) §4.6.

**S-12 · Encryption key passed as a SQL parameter.** `pgp_sym_encrypt(decode($1,'base64'), $2)` in [`voice_handlers.go:32`](../../../backend/gateway/voice_handlers.go#L32) puts `VOICE_EMBEDDING_KEY` into query parameters, where it can surface in `pg_stat_statements` and statement logs. Single global key, no version, so rotation is not possible without full re-encryption. Applied to biometric data. §9.7.

**S-13 · No MFA, no OAuth, no device trust.** Password + email OTP is the entire authentication surface. §4.7, §4.14.

**S-14 · No dependency, image, or secret scanning.** No `.github/` exists. Go, Python (Whisper/SpeechBrain/transformers — a large, historically pickle-sensitive graph), and npm dependencies are unscanned. §12.11.

### Medium

**S-15 · Signup enumerates accounts.** `409 "An account with this email already exists"` while forgot-password correctly does not enumerate. Inconsistent, and the 409 is the exploitable half.

**S-16 · Symmetric JWT secret shared by every service.** HS256 means any service that can verify can also mint. §4.1.

**S-17 · No `aud`/`iss` validation.** `ValidateJWT` checks the algorithm family (good — this blocks `alg: none` and RS→HS confusion) but not audience or issuer, so a token minted for any purpose is accepted everywhere.

**S-18 · Password policy below the modern floor.** 8-character minimum, no breach check. NIST SP 800-63B recommends ≥8 with breach screening; 12 plus screening is the practical target.

**S-19 · No audit log.** No record of authentication outcomes, privilege changes, or biometric access. Forensics after an incident would be impossible.

**S-20 · No SSRF protection** on RAG document ingest or integration URL fetching.

**S-21 · Email templates built with `fmt.Sprintf` into raw HTML.** Safe only while every interpolated value is a code or address. §6.7.

**S-22 · `GenerateOTP` is off by one.** `rand.Int(reader, big.NewInt(999999))` yields `[0, 999998]`; `999999` is unreachable. Negligible entropy impact, but it signals the range was not reasoned about.

**S-23 · Rotated-but-still-live credentials in git history.** Previously committed Supabase keys remain valid in history and in every clone until rotated. Removal from the working tree is not remediation.

---

## 16.2 Reliability, correctness, and performance gaps

### Critical

**R-1 · Execution status is never persisted.** `logExecution` inserts `(id, task_id, device_id, status, metadata, created_at)` into a table declared as `(id, task_id, status, output, timestamp)`. `device_id`, `metadata`, and `created_at` do not exist. Every insert fails; `ExecuteWithRetry` burns three attempts over ~6 s per call; `/execution/status/:task_id` returns 404 for every task ever submitted. Schema/code drift that no CI would have caught, because there is no CI.

**R-2 · Task queue loses messages.** `RPush`/`BLPop` is at-most-once. The message is removed from Redis before processing; a worker crash, an OOM kill, or a rolling deploy that outruns the drain window loses the task permanently, with no DLQ and no detection. §11.

**R-3 · Email delivery is not durable.** Three `go func(){ SendEmail(...) }()` call sites ([`auth.go:158`](../../../backend/gateway/auth.go#L158), `:262`, `:411`). No retry, no persistence, no DLQ. A restart between the DB commit and the send drops the OTP; the user sees "code sent" and waits forever. §6.

### High

**R-4 · OTP state is per-process and leaks.** `pendingSignups sync.Map` breaks entirely with more than one replica (signup and verify may land on different pods) and is never swept, so every abandoned signup retains an email, phone, name, and password hash for the process lifetime.

**R-5 · Rate limiting is per-replica and in-memory.** Effective limits are N× the configured value and reset on every deploy — exactly when an attacker would most like them to.

**R-6 · No idempotency anywhere.** A retried voice command re-runs the whole plan; a retried step re-sends a message; a double-clicked signup sends two OTPs, each invalidating the user's understanding of which is current.

**R-7 · Planning is synchronous on the request path.** `/voice/command` calls the agent's `/plan` with a 12 s timeout before returning a `task_id`. The user blocks on LLM inference to receive an acknowledgement. §3 workflow 10.

**R-8 · No compensation on partial plan failure.** The worker `break`s on the first failed step, leaving earlier side effects applied with no record of which landed.

**R-9 · Connection pool budget will exhaust.** `MaxConns: 15` per service instance directly against the Supabase pooler; ~20 replicas exhausts it. No PgBouncer. §9.9.

**R-10 · No cleanup jobs at all.** Expired `user_sessions`, `otp_codes`, pending signups, and old `voice_events` are never deleted. Tables grow monotonically; index bloat and vacuum pressure follow.

**R-11 · Missing foreign-key indexes.** Postgres does not index FK columns automatically. `devices.user_id`, `user_integrations.user_id`, `agent_memory.user_id`, `interaction_logs.user_id`, `user_goals.user_id`, `user_preferences.user_id` are all unindexed — every user-scoped query and every cascade delete does a sequential scan.

### Medium

**R-12 · `handleGetSessions` cannot work.** It scans `created_at` (`timestamptz`) into a Go `string`; pgx returns an error, so the handler always falls through to the hardcoded `{"browser":"Unknown","lastLogin":"Just now"}` response. The UI has been showing placeholder data.

**R-13 · Unbounded `context.Background()` on request paths** in the gateway and worker — no deadline propagation, so a slow downstream accumulates goroutines.

**R-14 · Errors silently ignored.** The `interaction_logs` insert in [`main.go:150`](../../../backend/gateway/main.go#L150) discards its error; several `DB.Exec` calls in `auth.go` do the same, including the session insert. A failed session write produces a token that `auto-signin` will later reject.

**R-15 · No optimistic locking.** Concurrent profile updates silently overwrite each other.

**R-16 · `/execution/stream` is a mock.** It echoes `{"status":"executing","task_id":"simulated"}` to any connection.

**R-17 · Health-check asymmetry.** The gateway's `/ready` fails when `DB == nil`, but `InitDB` returns `nil` for a missing `DATABASE_URL`, so a misconfigured deployment fails readiness instead of failing fast at startup. The worker's `/ready` reports ready when `DB == nil`, so a database-less worker passes readiness and silently drops every status write.

**R-18 · No structured logging, tracing, or metrics.** `requestid.New()` mints a correlation ID that is never propagated downstream.

**R-19 · No tests of any kind.** Zero test files in the repository.

**R-20 · `otp_codes` used as a state flag.** The forgot-password path inserts a sentinel row (`code='reset'`, `used=true`) that `handleLogin` then queries on every login to set `requires_password_update`. An extra query per login, and a table doing two unrelated jobs.

---

## 16.3 Systemic risk analysis

### Single points of failure

| Component | Current | Mitigation |
|---|---|---|
| Redis | Single instance; holds the task queue, so its loss loses in-flight work | Sentinel/Cluster; move transactional jobs to Postgres (§11) |
| Postgres | Single hosted primary; no verified restore | Replicas + PgBouncer + tested PITR |
| Voice Agent | Single deployment; batch work and realtime work share a failure domain | Split realtime/batch (§1.2.3) |
| Gateway | All entry paths in one process — REST, WS, auth, routing | Extract Identity, Realtime, Webhook tiers |
| JWT secret | One symmetric secret everywhere | Asymmetric keys, rotation |
| Resend | Single email provider with no failover | Circuit breaker → SMTP/Postal (§6.3) |

### Race conditions

1. **Signup/verify across replicas** — in-memory pending state (R-4).
2. **`handleVerifyOTP` insert-then-update fallback** — two concurrent verifications can both attempt the insert; the loser falls into an UPDATE path that overwrites, and the OTP is deleted only after. Needs `INSERT … ON CONFLICT` in one statement.
3. **Refresh rotation** (once introduced) — requires `FOR UPDATE`, or concurrent browser tabs trigger a false reuse alarm and log the user out.
4. **Integration toggle** — `handleToggleIntegration` does read-then-write without a transaction; concurrent toggles lose one.
5. **Task retry** — no step-level idempotency, so a retry re-executes completed steps.

### Consistency problems

Dual writes throughout: DB commit then Redis push (queue), DB commit then goroutine email, DB write then in-memory map delete. Each is a window in which the two stores disagree. The outbox pattern (§8.1) closes all of them with one mechanism.

### Availability concerns

No multi-AZ, no PDBs, no autoscaling, no circuit breakers, no graceful degradation, no load testing. The system's actual capacity is unknown — which means the first traffic spike is also the first capacity test.

---

## 16.4 Prioritized remediation plan

Effort: **S** ≤1 day · **M** 2–5 days · **L** 1–3 weeks · **XL** 1 month+.

### P0 — Do not run this for untrusted users until these are done

| # | Item | Effort | Addresses |
|---|---|---|---|
| 1 | Rewrite password reset: token-based, hashed, single-use, always `202`, no password in the response or email | M | S-1 |
| 2 | Ownership predicates on all goal endpoints + rows-affected check | S | S-2 |
| 3 | `AuthRequired()` on `/execution/status/:task_id`; delete `/execution/stream` or authenticate it | S | S-6 |
| 4 | Service token on the agent; remove `8000:8000` and `9090:9090` host publication | S | S-3 |
| 5 | Pin CORS to `ALLOWED_ORIGINS` | S | S-10 |
| 6 | Fix `execution_logs` schema/code mismatch, add a `task_id` index | S | R-1 |
| 7 | Gate the console-email fallback to `ENV != production`; redact OTPs from all logs | S | S-9 |
| 8 | Rotate every credential ever committed to git; add `gitleaks` to CI and pre-commit | S | S-23 |
| 9 | OTP: Redis-backed, hashed, 5-attempt cap, constant-time compare, fix the `999999` range | M | S-8, R-4 |
| 10 | Redis-backed rate limiting | M | R-5 |

### P1 — Identity and durability (2–4 weeks)

| # | Item | Effort | Addresses |
|---|---|---|---|
| 11 | Access/refresh split, 10-min access tokens, rotation + reuse detection, hashed at rest | L | S-4, S-5 |
| 12 | Working revocation: Redis deny-list, `sid`/`jti`/`aud`/`iss` claims, `logout` and `logout-all` | M | S-4, S-17 |
| 13 | Move the refresh token to an `HttpOnly` `__Host-` cookie; access token in memory only; unify the client key | M | S-11 |
| 14 | Transactional outbox + relay | L | R-3, R-6, consistency |
| 15 | Email Service: durable queue, retry classification, DLQ, suppression list, idempotency | L | R-3 |
| 16 | Resend webhook ingest with Svix verification, replay window, dedupe | M | S-19, deliverability |
| 17 | Replace the Redis list queue with River; step-level idempotency and resumption | L | R-2, R-6, R-8 |
| 18 | Repository layer with mandatory `Principal`; RBAC roles/permissions tables | L | S-2, S-7 |
| 19 | Resolve the RLS decision: drop the fake policies or implement option (B) properly | M | S-7 |
| 20 | Envelope encryption for voiceprints; drop `users.voice_embedding`; consent + audit on access | L | S-12 |
| 21 | Audit log: append-only, hash-chained, partitioned | M | S-19 |
| 22 | Missing FK indexes; cleanup cron jobs; `deleted_at`; optimistic locking | M | R-10, R-11, R-15 |
| 23 | Make planning asynchronous; return `task_id` immediately | M | R-7 |
| 24 | Fix R-12, R-13, R-14, R-17, R-20 | M | reliability |

### P2 — Operability (3–5 weeks)

| # | Item | Effort |
|---|---|---|
| 25 | OpenTelemetry in all three services; propagate `traceparent` through HTTP, gRPC, jobs, and events | L |
| 26 | Prometheus + Loki + Tempo + Grafana; dashboards per §13.7 | L |
| 27 | Structured logging with redaction | M |
| 28 | SLOs, error budgets, alert rules, runbooks | M |
| 29 | GitHub Actions: lint, test, `-race`, migration up/down/up, `govulncheck`, `pip-audit`, Trivy, SBOM, Cosign | L |
| 30 | Test suite to 70% on auth, authz, and the queue paths | XL |
| 31 | Production images (distroless, non-root, read-only rootfs, pinned digests, baked model weights) | M |
| 32 | Helm/Kustomize + Argo CD; migrations as a pre-sync Job; canary with automated analysis | L |
| 33 | PgBouncer; connection budget; read replicas | M |
| 34 | Backup verification job; documented RTO/RPO; first restore drill | M |

### P3 — Scale and completeness (ongoing)

| # | Item | Effort |
|---|---|---|
| 35 | MFA (TOTP + recovery codes), WebAuthn for admins | L |
| 36 | OAuth: Google, GitHub, Apple with PKCE | L |
| 37 | NATS JetStream + full event catalog | L |
| 38 | Notification Service: channels, preferences, digests, priority queues | XL |
| 39 | Split voice-realtime from voice-batch | L |
| 40 | File Service with presigned uploads, magic-byte validation, AV scan | L |
| 41 | Partitioning + ClickHouse for telemetry | L |
| 42 | Admin Service with SSO, MFA, audited impersonation | L |
| 43 | Search Service (Meilisearch + pgvector HNSW) | M |
| 44 | Organization/team tier | XL |
| 45 | Self-hosted migration: CloudNativePG, MinIO, Postal | XL |
| 46 | Load testing, capacity model, chaos/game days | L |

---

## 16.5 Scoring detail

| Subsystem | Score | What earned it | What is missing |
|---|---:|---|---|
| Edge & network | 10% | Nothing at this tier | WAF, DDoS, CDN, private networking, NetworkPolicy |
| API Gateway | 45% | `requestid`, `helmet`, a limiter, graceful shutdown with in-flight draining, correct three-probe health checks | Wildcard CORS, per-replica limiter, unauthenticated routes, no deadline propagation, no circuit breakers |
| Authentication | 25% | Argon2id with sound parameters, constant-time hash compare, bcrypt legacy dispatch, JWT algorithm-family check, fail-fast secret validation | No refresh tokens, no revocation, no MFA, no OAuth, in-memory OTP, plaintext session storage, S-1 |
| Authorization | 10% | Authentication middleware exists | No RBAC, broken object-level auth, non-functional RLS, no service-to-service authz |
| Email | 40% | Real Resend integration, sensible provider fallback chain with documented reasoning, well-built templates | No durability, no retries, no webhooks, no suppression, no idempotency, OTP-to-logs fallback |
| Notifications | 5% | Three hardcoded auth emails | Everything else |
| Events | 5% | `shared/schemas/` shows contract-first intent | No bus, no outbox, no catalog |
| Queue & workers | 20% | Correct graceful drain, health server alongside the consumer loop, DB retry helper | At-most-once transport, no DLQ, no idempotency, no compensation, broken status writes |
| Database | 40% | Clean modular migrations, thoughtful voice schema with CHECK constraints, `pgcrypto`, sensible composite indexes on voice tables | Schema/code drift, no outbox, no partitioning, missing FK indexes, no soft delete, no versioning, plaintext tokens, no verified backups |
| Caching | 25% | Redis deployed and reachable from all services | Used only as a queue; no cache-aside, no locks, no HA, no rate-limit backing |
| Voice/AI | 55% | The strongest subsystem: real hybrid LLM + openWakeWord, layered engine fallbacks, latency tracking, audio payload size limits, startup key validation, per-stage separation | No authentication, no quotas, no per-user metering, single deployment, no model-version observability |
| Security | 20% | Parameterized SQL throughout, Argon2id, `helmet`, encrypted voiceprints (weakly), fail-fast on missing secrets | One critical ATO, multiple high findings, no secrets manager, no scanning, no audit log, no zero trust |
| Observability | 20% | Correct `/health`, `/live`, `/ready` split in two services; latency tracker in the agent | No metrics, no traces, no structured logs, no alerting, no SLOs, correlation ID not propagated |
| CI/CD | 10% | Dockerfiles exist, compose healthchecks defined | No pipeline, no tests, no prod images, no IaC, no rollback story |
| Backup & DR | 15% | Inherits Supabase's managed backups | No verification, no RTO/RPO, no runbook, no drill, no cross-region copy |
| **Overall** | **26%** | | |

---

## 16.6 Honest summary

ARI is a well-structured prototype with genuinely good instincts in places that are usually neglected — the health-probe split, graceful shutdown with in-flight draining, Argon2id with correct parameters and constant-time comparison, parameterized SQL everywhere, audio payload bounds, fail-fast validation of required secrets, and layered engine fallbacks in the voice pipeline. Those are not accidents, and they should be preserved verbatim through the refactors above.

What is missing is not sophistication; it is the durability and trust plumbing that separates a system you demo from a system you operate. Three defects — the forgot-password takeover, the broken goal authorization, and the unauthenticated agent — mean the current build should not be exposed to untrusted users at all. Three more — the lost tasks, the lost emails, and the execution-log mismatch — mean that even in a trusted deployment the system silently fails to do what it tells users it has done.

The good news is that the remediation is mostly *additive* rather than a rewrite. The service boundaries are already in the right places. P0 is roughly a week of focused work and removes every immediately exploitable issue. P0 + P1 gets you to something defensible in a senior architecture review — call it 65–70% — and P2 gets you to genuinely operable. The path from there to "millions of users" is the boring, well-understood part: split the realtime tier, partition the hot tables, and add replicas.
