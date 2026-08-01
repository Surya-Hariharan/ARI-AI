# Phases 1–7

Each phase uses the same template: Objective · Why now · Features · Files · DB · API · Frontend · Breaking changes · Migration · Rollback · Security · Testing · Effort · Risks · Success criteria.

---

# Phase 1 — Foundation

**Objective:** make every subsequent change safe, reversible, and reproducible.
**Effort:** 18 ed · **Sprints:** S2–S3

### Why this phase comes now

Phase 2 rewrites authentication — the highest-risk code in the system — and today there are **zero tests**, **no CI**, **no versioned migrations**, and **no pinned Python dependencies**. Each of those turns a two-day change into a two-week incident. This phase is pure leverage: it produces no user-visible feature and makes every following phase roughly twice as fast and considerably safer. It is also the phase most likely to be skipped under pressure, which is why it is a hard gate.

The `execution_logs` defect fixed in T0.6 is the concrete argument: a CI job that applies migrations and runs one integration test would have caught it on the PR that introduced it, years of debugging time ago.

### Features

| ID | Feature | Effort |
|---|---|---:|
| T1.1 | `golang-migrate` replaces `run_migrations.go`/`.js`; baseline existing 001–009; down migrations for all new work | 2.0 |
| T1.2 | Pin all dependencies: `requirements.txt` → exact versions + hashes via `pip-compile`; Go already has `go.sum`; npm `package-lock` verified | 1.5 |
| T1.3 | GitHub Actions: lint, vet, build, test, migration up/down/up, `gitleaks`, `govulncheck`, `pip-audit`, Trivy | 3.0 |
| T1.4 | Test harness: `testcontainers-go` for Postgres+Redis, fixture factories, `pytest` fixtures for the agent | 3.0 |
| T1.5 | Typed config package: parse and validate all env vars at startup, fail closed in production, single source of truth | 2.0 |
| T1.6 | Structured logging (`log/slog` in Go, `structlog` in Python) with mandatory fields and a redaction filter | 2.5 |
| T1.7 | Auth test suite: 60+ tests over signup, OTP, login, reset, middleware — written against **current** behaviour, so Phase 2 has a regression baseline | 4.0 |

### Files affected

`.github/workflows/{ci,security}.yml` (new) · `backend/gateway/config/config.go` (new) · `backend/gateway/logging/` (new) · `backend/agent/config.py` (new) · `backend/agent/logging_setup.py` (new) · `migrations/` (new top-level, replacing `supabase/migrations` as the source of truth) · `backend/gateway/*_test.go` (new) · `backend/agent/tests/` (new) · `backend/requirements.in` + `requirements.txt` (regenerated) · `Makefile` (new)

### Database changes

`schema_migrations` table created by `golang-migrate`; existing migrations 001–009 registered as already-applied via `migrate force 9`. No data changes.

**Important:** move the canonical migration directory to `/migrations` and leave `supabase/migrations` in place with a README pointer for one release, so nobody runs both.

### API / Frontend changes

None. This phase is invisible to clients by design — that is what makes it safe to do first.

### Breaking changes

Developer workflow only: `make migrate` replaces `node run_migrations.js`; `make test` requires Docker running.

### Migration strategy

`golang-migrate` baselining is the only delicate step. Sequence: (1) copy 001–009 into `/migrations` with the required `NNNNNN_name.up.sql` naming; (2) write matching `.down.sql` for each — for the early ones this may legitimately be `-- irreversible baseline`; (3) run `migrate force 9` against dev, staging, and prod so the tool believes they are applied; (4) verify `schema_migrations` shows version 9, dirty=false; (5) all future changes go through the tool only.

### Rollback

Every task is independent and revertible. The riskiest is T1.2 — pinning may surface a transitive incompatibility in the ML stack (`torch`/`transformers`/`speechbrain` are tightly coupled). Mitigation: pin in a branch, run the agent's smoke tests, and pin to the versions currently resolved in a working environment rather than to latest.

### Security impact

Closes **S-14** (no dependency/image/secret scanning). Establishes the redaction filter that keeps **S-9** closed permanently rather than by one-off greps. `govulncheck` and `pip-audit` will almost certainly surface real CVEs in the unpinned ML stack on first run — budget 1 ed for triage.

### Testing requirements

The deliverable *is* testing. Targets: ≥60% line coverage on `backend/gateway/auth*.go`, 100% of the Phase 0 `[V]` checks converted into automated tests, and one end-to-end test that runs the full signup→OTP→login flow against containers.

### Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Pinning breaks the ML stack | High | Medium | Pin to currently-resolved versions; smoke test before merge |
| Baselining marks an unapplied migration as applied | Medium | High | Diff `information_schema` against expected schema before `force` |
| CI runtime balloons (torch is ~2 GB) | High | Low | Cache the pip/Docker layers; split the agent job; run ML tests nightly |
| Team treats tests as optional | Medium | High | Branch protection: CI required, no admin bypass |

### Success criteria

1. A PR with a failing test cannot merge.
2. `make migrate-up && make migrate-down && make migrate-up` succeeds in CI against a clean container.
3. `pip-compile` output is committed and `pip install -r requirements.txt` is byte-reproducible.
4. Every log line is JSON with `trace_id`, `service`, `version`.
5. Auth coverage ≥60%. **Readiness 38% → 46%.**

---

# Phase 2 — Identity Rebuild

**Objective:** replace "the JWT is the session" with "the session is the truth."
**Effort:** 30 ed · **Sprints:** S4–S6

### Why now

Phase 0 stopped the bleeding but left the structural defects: a 30-day token with no revocation, session rows stored as plaintext bearer tokens, OTP state in a per-process map, and no MFA path. Every one of those is a rewrite, and rewrites need Phase 1's harness. Authorization (Phase 3) cannot start until this phase defines `Principal`.

### Features

| ID | Feature | Effort |
|---|---|---:|
| T2.1 | Schema: `user_credentials`, `sessions`, `refresh_tokens`, `email_verification_tokens`, `login_attempts` | 3.0 |
| T2.2 | Token service: EdDSA access tokens (10 min) with `jti`/`sid`/`aud`/`iss`, opaque refresh tokens hashed at rest, rotation with reuse detection | 8.0 |
| T2.3 | Dual-verify middleware: accepts legacy HS256 30-day tokens **and** new tokens during the transition | 3.0 |
| T2.4 | OTP → Redis: hashed, TTL, 5-attempt cap, constant-time compare, atomic consume; delete `pendingSignups` | 3.0 |
| T2.5 | Email verification via stored tokens; signup writes a `pending_verification` user row | 2.5 |
| T2.6 | Redis deny-list; `POST /logout`, `/logout-all`; session list/revoke endpoints that actually work | 3.0 |
| T2.7 | Frontend: access token in memory, refresh in `HttpOnly` cookie, silent-refresh interceptor, unify the two localStorage keys | 4.0 |
| T2.8 | Legacy sunset: stop issuing HS256, expire the acceptance window, remove the dual path | 1.5 |
| T2.9 | Password policy: 12-char minimum + breached-password check (local k-anonymity list) | 2.0 |

### Files affected

`backend/gateway/auth.go`, `auth_helpers.go`, `auth_middleware.go` (all substantially rewritten) · new `backend/gateway/identity/{token,session,otp,password}.go` · `frontend/src/api/client.ts`, `frontend/src/app/context/AuthContext.tsx` · migrations 010–014

### Database changes

See [`04-database-migration-plan.md`](04-database-migration-plan.md) M010–M014. Expand-only: new tables added, `user_sessions` retained until T2.8, `users.password_hash` retained until Phase 3's contract step.

### API changes

New: `POST /api/auth/refresh`, `/logout`, `/logout-all`, `GET /api/user/sessions`, `DELETE /api/user/sessions/:id`.
Changed: `/login` and `/verify-otp` return `{access_token, expires_in}` plus a `Set-Cookie` refresh cookie; the legacy `token` field is retained through T2.8 so old clients keep working.
Deprecated: `/api/auth/auto-signin` — replaced by `/refresh` (it currently re-validates a JWT against `user_sessions`, which is the right instinct implemented in the wrong place).

### Frontend impact

Significant — this is the largest client change in the roadmap. The interceptor must queue concurrent 401s and issue **one** refresh, or ten parallel requests trigger ten rotations and the reuse detector logs the user out. Budget 4 ed and test the concurrency case explicitly.

### Breaking changes

Yes, staged: `[SKIP-IF-GREENFIELD]` the dual-verify window (T2.3) and the legacy sunset (T2.8) exist solely to avoid logging out existing users. Greenfield: implement the new scheme directly and delete 4.5 ed of work.

### Migration strategy

Five deploys, in order:
1. **Expand** — new tables, no code reads them.
2. **Dual-issue** — issue both legacy and new tokens; middleware accepts both. Monitor `auth_token_type{legacy|v2}`.
3. **Frontend cutover** — SPA uses the new flow. Legacy metric should fall toward zero.
4. **Sunset** — after 30 days (or max legacy token lifetime, whichever is longer), reject legacy tokens. Announce first.
5. **Contract** — drop `user_sessions`, remove the dual path, remove `users.password_hash` after backfilling `user_credentials`.

### Rollback

Per deploy: 1 is additive (no-op revert). 2 reverts to legacy-only. 3 reverts the SPA bundle — the backend still accepts both, which is exactly why step 2 precedes step 3. 4 is the only irreversible-ish one: re-enabling legacy acceptance is a config flag, kept for one release. 5 is guarded by a full backup.

### Security impact

Closes **S-4, S-5, S-8, S-11, S-16, S-17, S-18** and the remainder of **R-4**. This is the single largest security delta in the roadmap: after Phase 2, a stolen token is valid for 10 minutes instead of 30 days, logout works, and a database dump yields no usable sessions.

### Testing requirements

- Unit: token minting/validation, expiry, `aud`/`iss` rejection, algorithm confusion, rotation, reuse detection, OTP attempt cap, constant-time compare.
- Integration: full signup→verify→login→refresh→logout; concurrent refresh from two clients; revocation takes effect within the access TTL; legacy token accepted then rejected after sunset.
- Security: JWT `alg:none`, `alg` swap to HMAC-with-public-key, expired token, token from another audience, replayed refresh token.
- Load: 200 concurrent logins — Argon2id at 64 MiB is deliberately expensive; verify it does not exhaust memory and that the rate limiter engages before the pod does.

### Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Refresh race logs users out | High | High | `FOR UPDATE` on the family; client-side single-flight; explicit concurrency test |
| Argon2id memory pressure under login flood | Medium | High | Per-account rate limit before hashing; dedicated resource limits; load test |
| Frontend/backend skew during cutover | Medium | High | Dual-accept window; feature-flag the client flow |
| EdDSA key distribution before JWKS exists | Medium | Medium | Start with a shared public key in config; JWKS endpoint in Phase 6 |
| Users locked out by the sunset | Medium | High | Announce; metric-driven — do not sunset while legacy usage >1% |

### Success criteria

1. Access tokens expire in 10 minutes; refresh rotates on every use.
2. Presenting a used refresh token revokes the family and fires an alert.
3. `logout-all` invalidates access within 10 min and refresh immediately — verified end-to-end.
4. No token in `localStorage`; no plaintext token in the database.
5. Legacy token usage 0%. **Readiness 46% → 58%.**

---

# Phase 3 — Authorization

**Objective:** make it structurally impossible to write a query that ignores the principal.
**Effort:** 22 ed · **Sprints:** S7–S8

### Why now

Phase 2 produced a `Principal` with roles and scopes; this phase spends it. It comes before Phase 5's public ingress because access control must be settled before the system is genuinely reachable.

### Features

| ID | Feature | Effort |
|---|---|---:|
| T3.1 | `Principal` type + context plumbing (finalized at SP2) | 1.5 |
| T3.2 | Repository layer: every data access behind a repo whose methods **require** a `Principal`; ownership predicates enforced there | 9.0 |
| T3.3 | RBAC tables: `roles`, `role_permissions`, `user_roles`; seed `user`/`support`/`admin`/`super_admin` | 2.5 |
| T3.4 | `RequirePermission` middleware applied at router-group level, deny-by-default | 2.5 |
| T3.5 | RLS decision executed — recommend **option (A)**: drop the nine non-functional `auth.uid()` policies, document why | 1.5 |
| T3.6 | Least-privilege DB role: app connects as `ari_app` with explicit grants, no superuser, no `BYPASSRLS` | 2.0 |
| T3.7 | `audit_log` table + writer: auth outcomes, authz denials, privilege changes, biometric access | 3.0 |

### Files affected

`backend/gateway/repository/` (new — the bulk of the work) · all handlers in `user_handlers.go`, `voice_handlers.go`, `auth.go` rewired to repos · `backend/gateway/authz/` (new) · migrations 015–018

### Database changes

New: `roles`, `role_permissions`, `user_roles`, `audit_log` (monthly-partitioned). Dropped: the nine RLS policies from `007`. Changed: `users.role` backfilled into `user_roles` then dropped in the contract step.

### API changes

No route changes. Response changes: unauthorized access to another user's object returns **404, not 403** — deliberate, to avoid confirming existence. Document this in the API reference so clients do not treat 404 as "deleted."

### Frontend impact

Minimal. One consideration: the SPA must not interpret 404-from-authz as "resource was deleted, remove from local state" in a way that hides a genuine bug.

### Breaking changes

Behavioural only, and only for requests that were previously succeeding illegitimately.

### Migration strategy

The repository migration is the risky part because it touches every handler. Do it **one resource at a time**, each as its own PR: goals → preferences → integrations → profile → voice → sessions. Each PR moves handlers to the repo, adds the authz test matrix for that resource, and leaves the rest untouched. Never a big-bang refactor.

T3.6 (DB role change) is the one with production risk: run `EXPLAIN`-level smoke tests as `ari_app` in staging for a full sprint before switching production, because a missing `GRANT` surfaces as a runtime error on a code path nobody exercised.

### Rollback

Per-resource PRs revert independently. T3.6 rollback is a connection-string change back to the previous role — keep the old role until a full release has passed.

### Security impact

Closes **S-2** structurally (not just for goals), **S-7**, **S-19**, and establishes the enforcement point that all future features inherit. This is the phase that converts "we fixed the goal handlers" into "this class of bug cannot be written."

### Testing requirements

- **Authorization matrix** — the key deliverable: for every resource × every role × (own, other's, nonexistent), assert the expected status. Table-driven; ~150 cases; runs on every PR.
- Negative tests are the point: user B *must* get 404 for user A's object.
- Audit assertions: every denial writes exactly one audit row.
- A CI lint that fails if any `DB.Exec`/`DB.Query` appears outside `repository/`.

### Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Repository refactor introduces regressions | High | High | One resource per PR; Phase 1 tests as the safety net |
| Missing `GRANT` breaks prod at 3am | Medium | High | Full sprint on staging as `ari_app`; grant audit script |
| RLS drop misread as "we removed security" | Medium | Low | Document the reasoning in the migration file itself |
| Audit writes become a hot path | Low | Medium | Batched async writer; never block the request |

### Success criteria

1. No SQL outside `repository/` — enforced by CI.
2. Authz matrix green, including all negative cases.
3. App connects as a non-superuser; `SELECT rolsuper FROM pg_roles WHERE rolname='ari_app'` is false.
4. Every auth event and denial appears in `audit_log`.
5. **Readiness 58% → 66%.**

---

# Phase 4 — Durability

**Objective:** stop losing messages, tasks, and emails.
**Effort:** 34 ed · **Sprints:** S9–S11

### Why now

Phase 4 depends on Phase 1 (migrations) and benefits from Phases 2–3 (a real `Principal` to carry in job payloads and re-authorize at execution). It must precede Phase 5 because rolling deploys kill workers mid-task, which is only safe once River's lease-and-retry exists — with today's `BLPop`, every deploy loses in-flight work.

### Features

| ID | Feature | Effort |
|---|---|---:|
| T4.1 | `outbox_events` + relay (LISTEN/NOTIFY + 200 ms poll, `FOR UPDATE SKIP LOCKED`) | 4.0 |
| T4.2 | River install, schema, worker scaffolding | 2.5 |
| T4.3 | `execution_tasks` + `execution_steps` with per-step idempotency keys | 3.0 |
| T4.4 | Queue dual-write: publish to both Redis list and River; new worker consumes River, old consumes Redis | 3.5 |
| T4.5 | Worker cutover + old-path removal; step-level resume; compensation hooks; DLQ | 5.0 |
| T4.6 | Email Service: outbox-driven, retry classification, DLQ, idempotency keys, `email_messages` | 6.0 |
| T4.7 | Webhook Gateway: Svix verification, replay window, dedupe, `202`-then-async | 4.0 |
| T4.8 | Suppression list + bounce/complaint handling + reconciliation cron | 3.0 |
| T4.9 | Cleanup crons: expired tokens/sessions/OTPs, old audio, published outbox rows | 2.0 |
| T4.10 | Async planning: `/voice/command` returns `task_id` immediately; planning becomes the queue's first step | 1.0 |

### Files affected

`backend/gateway/outbox/` (new) · `backend/execution/` (substantially rewritten) · `backend/email/` (new service) · `backend/webhooks/` (new service) · `docker-compose*.yml` · migrations 019–024

### Database changes

New: `outbox_events`, `river_job` (tool-managed), `execution_tasks`, `execution_steps`, `email_messages`, `email_suppressions`, `webhook_events`. Contract: drop legacy `execution_logs.timestamp`.

### API changes

`POST /voice/command` now returns `202 {task_id, status_url, events_url}` without waiting on the LLM. New `GET /api/v1/tasks/:id/events` (SSE) replaces the deleted mock WebSocket. New `POST /api/webhooks/resend`.

### Frontend impact

Moderate: the command flow becomes accept-then-subscribe. The dashboard subscribes to SSE for progress. Users perceive this as *faster* (immediate acknowledgement) even though total completion time is unchanged.

### Breaking changes

`POST /voice/command` response semantics change from "queued after planning" to "accepted before planning". Version the endpoint (`/api/v1/voice/commands`) and keep the old path for one release.

### Migration strategy — queue

Detailed in [`07-subsystem-migrations.md`](07-subsystem-migrations.md). Summary: dual-write for one week with a reconciliation job asserting both paths produce identical task sets, then flip consumers, then drain and delete the Redis path.

### Rollback

The dual-write window is the rollback: at any point, disable River consumption and the Redis worker still drains. Email has an equivalent flag (`EMAIL_ASYNC=false`) that reverts to the direct-send path for one release.

### Security impact

Closes **R-2, R-3, R-6, R-10**; adds webhook signature verification (closing the gap that would exist as soon as webhooks are introduced). Job payloads carry the `Principal` and are **re-authorized at execution**, so a permission revoked between enqueue and execution takes effect.

### Testing requirements

- **Chaos:** `kill -9` a worker mid-task at 10 randomized points; assert zero task loss and no duplicated side effects.
- **Idempotency:** replay the same job 100×; assert exactly one side effect.
- **Outbox:** crash the relay mid-publish; assert at-least-once and no loss.
- **Webhook:** valid, invalid, replayed, and out-of-order signature/payload cases; assert `202` in <200 ms.
- **Email:** simulate 429/500/422 from Resend; assert retry, backoff, DLQ, and no retry on 422.
- **Load:** 10k jobs; measure oldest-job age and throughput.

### Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Dual-write causes duplicate execution | Medium | High | Idempotency key per task; reconciliation job; only one consumer active at a time |
| River adds DB load | Medium | Medium | Separate connection pool; monitor; PgBouncer |
| Email cutover drops OTPs | Low | Critical | Keep the direct-send fallback flag for one release; funnel metric alarm |
| Outbox relay lag | Medium | Medium | Alert on unpublished-row age >30 s; multiple relay replicas via `SKIP LOCKED` |

### Success criteria

1. Zero task loss across 10 chaos kills.
2. Zero email loss; ≥99% delivered within 60 s.
3. Hard bounce → suppression within 60 s, verified end-to-end.
4. DLQ wired, alerting, and replayable.
5. Redis list queue deleted. **Readiness 66% → 76%.**

---

# Phase 5 — Observability & Deployment

**Objective:** be able to see the system and ship to it safely. **This phase is the go-live gate.**
**Effort:** 30 ed · **Sprints:** S12–S14

### Why now

Instrumenting code you are about to rewrite is waste, so observability follows the rewrites. Deployment automation follows durability, because canary analysis needs meaningful SLOs and rolling restarts need drainable workers.

### Features

| ID | Feature | Effort |
|---|---|---:|
| T5.1 | OpenTelemetry SDK in gateway, agent, worker; propagate `traceparent` through HTTP, job payloads, and outbox rows | 5.0 |
| T5.2 | Prometheus + Loki + Tempo + Grafana; the six dashboards from §13.7 | 5.0 |
| T5.3 | Metrics per §13.3, with cardinality review | 3.0 |
| T5.4 | SLOs, error budgets, alert rules, runbook per alert | 3.0 |
| T5.5 | Production images: distroless, non-root, read-only rootfs, pinned digests, baked model weights | 4.0 |
| T5.6 | Helm charts + Argo CD; migrations as a pre-sync Job | 4.0 |
| T5.7 | Argo Rollouts canary with automated analysis and auto-rollback | 3.0 |
| T5.8 | Load test (k6) + capacity model | 2.0 |
| T5.9 | DR: backup verification job, documented RTO/RPO, first restore drill | 1.0 |

### Files affected

`deploy/helm/` (new) · `deploy/argocd/` (new) · `.github/workflows/deploy.yml` · all three services (OTel init) · `Dockerfile`s rewritten

### Database changes

None. Migrations move to a pre-sync Job — a deployment change, not a schema change.

### API / Frontend

`/metrics` on an internal port only. Frontend adds RUM trace headers (optional).

### Breaking changes

Deployment topology changes entirely. `[SKIP-IF-GREENFIELD]` — with no live deployment this is a green-field build rather than a migration.

### Migration strategy

Staging cluster first, running in parallel with compose for two weeks. Cut production over only after: canary rollback proven, restore drill passed, and 7 consecutive days of SLO data.

### Rollback

Argo CD revert to the previous Git SHA (<2 min). The compose environment stays runnable for one full release as the escape hatch.

### Security impact

Adds runtime security: non-root, read-only filesystems, NetworkPolicy, image signing, and admission control. Closes the deployment half of **S-5** (misconfiguration) and enables detection for everything else.

### Testing requirements

Deploy-and-rollback drill (must be <5 min); chaos: kill a pod, a node, and the database primary; load test to 10× expected peak; alert-firing test for every page-severity rule (an alert nobody has ever seen fire is not an alert).

### Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| K8s learning curve consumes the sprint | High | Medium | Managed control plane; start with one service; Helm from an upstream chart |
| Metric cardinality explosion | Medium | High | Review labels in PR; no user/session IDs as labels; cardinality alert |
| Model weights bloat images (GB) | High | Medium | Separate image or PVC; layer caching; never download at pod start |
| Canary analysis produces false rollbacks | Medium | Low | Start with manual promotion; automate after 10 clean deploys |

### Success criteria

1. One trace spans SPA → gateway → agent → queue → worker.
2. All six dashboards populated; every page-severity alert has a runbook and has been test-fired.
3. Canary + auto-rollback demonstrated on a deliberately broken build.
4. Restore drill passed with measured RTO/RPO.
5. 7 days of SLO data meeting targets in staging. **Readiness 76% → 85% — GO-LIVE.**

---

# Phase 6 — Events, Notifications, and Hardening

**Objective:** decouple services, add the notification surface, finish the auth feature set.
**Effort:** 32 ed · **Post-go-live**

### Features

| ID | Feature | Effort |
|---|---|---:|
| T6.1 | NATS JetStream cluster; streams and consumers per §8.3 | 4.0 |
| T6.2 | Outbox relay retargeted from direct calls to NATS; consumers migrated | 4.0 |
| T6.3 | Notification Service: channels, preferences, quiet hours, dedupe, priority queues, digests | 9.0 |
| T6.4 | MFA: TOTP + recovery codes + step-up | 5.0 |
| T6.5 | OAuth: Google, GitHub, Apple with PKCE | 5.0 |
| T6.6 | Agent hardening: mTLS, user-assertion forwarding, per-user quotas | 3.0 |
| T6.7 | Voice realtime/batch split | 2.0 |

### Notes on sequencing within the phase

NATS (T6.1/T6.2) is a *transport* swap under an outbox that already exists — the consumers written in Phase 4 keep their logic and change their subscription. That is why the outbox comes first: it makes the event bus a low-risk change rather than a rewrite.

Notifications (T6.3) must not disturb existing behaviour: the three current auth emails keep flowing through the Phase 4 email path, and the Notification Service is introduced *alongside* them, taking over one notification type at a time. Security emails are migrated **last**, because they are the ones that must never silently stop.

### Breaking changes / rollback

None user-visible. Each consumer migration is independently revertible by pointing the subscription back at the direct call.

### Success criteria

Consumer lag <60 s; notification preferences honoured; MFA adoption measurable; OAuth login working for all three providers; agent reachable only over mTLS. **Readiness 85% → 91%.**

---

# Phase 7 — Scale & Completeness

**Objective:** carry the architecture to millions of users. Ongoing, not a gate.
**Effort:** 60 ed+

| Workstream | Contents | Trigger |
|---|---|---|
| **Data scale** | Partition `voice_events`, `interaction_logs`, `audit_log`; read replicas; PgBouncer tuning | Any table >10M rows or replica lag concerns |
| **Analytics** | ClickHouse + rollups; move telemetry off OLTP | `voice_events` >50M rows |
| **Services** | File Service (presigned + AV scan), Search Service (Meilisearch + pgvector HNSW) | Product need |
| **Multi-tenancy** | Organization/team tier, org roles, invitations, seats | First B2B customer |
| **Billing** | Stripe + webhook-driven entitlements | Monetization |
| **Self-hosting** | CloudNativePG, MinIO, Postal — completing the self-hosted-first principle | Vendor cost or portability need |
| **Authorization** | OpenFGA once resource sharing exists | First "share with another user" feature |
| **Admin** | Admin Service with SSO, WebAuthn, audited impersonation | Support load |

Each item is independently schedulable and none blocks the others. Do them when the trigger fires, not before — the blueprint's value is that the seams already exist, so none of these requires re-architecture.
