# ARI Backend Implementation Roadmap

**Companion to** [`docs/architecture/backend/`](../) — that document set is the **final architecture** and is not revisited here. This set answers only: *in what order do we build it, and how do we get there without breaking anything?*

Written 2026-08-01 against commit `84944a6`.

---

## Files

| File | Contents |
|---|---|
| `README.md` (this file) | Assumptions, phase map, effort model, milestone timeline, sprint plan, team breakdown |
| [`01-dependency-graph.md`](01-dependency-graph.md) | Dependency graph, why each edge exists, parallelizable work streams |
| [`02-phase-0-p0-security.md`](02-phase-0-p0-security.md) | The P0 security lockdown, task by task |
| [`03-phases-1-7.md`](03-phases-1-7.md) | Phases 1–7 with the full per-phase template |
| [`04-database-migration-plan.md`](04-database-migration-plan.md) | Every migration: SQL, backfill, rollback, downtime risk, order |
| [`05-auth-authz-migration.md`](05-auth-authz-migration.md) | Auth cutover with legacy-token compatibility; authorization rollout |
| [`06-api-migration.md`](06-api-migration.md) | Endpoint-by-endpoint disposition, examples, limits, errors |
| [`07-subsystem-migrations.md`](07-subsystem-migrations.md) | Queue, event bus, email, notifications, agent/AI, infrastructure |
| [`08-cicd-testing-monitoring.md`](08-cicd-testing-monitoring.md) | CI/CD, testing, and observability rollouts |
| [`09-trackers-and-go-live.md`](09-trackers-and-go-live.md) | Readiness tracker, risk register, rollback plan, go-live checklist |

---

## Stated assumptions

These change the plan materially, so they are stated up front rather than buried. If any is wrong, the affected sections are flagged inline.

**A1 · There is no live production deployment today.** Evidence: no `.github/`, no production images, no Kubernetes manifests, no IaC, and the only deployment description is a development `docker-compose.yml` that bind-mounts source and runs `air`/`uvicorn --reload`. The plan is nonetheless written to be **zero-downtime and backward-compatible throughout**, because (a) you asked for that, and (b) it is the discipline you want in place *before* the first real user, not after.

> Steps that exist purely to protect existing users and data are tagged **`[SKIP-IF-GREENFIELD]`**. If ARI truly has no live users, deleting those steps removes roughly 9 engineer-days from the critical path and turns three expand/contract migrations into single-step migrations. **Confirm this before Sprint 1 — it is the single highest-leverage scheduling decision in the plan.**

**A2 · Hosted Supabase Postgres remains the database through Phase 6.** Self-hosting Postgres is Phase 7 work. Nothing before then may add a Supabase-proprietary dependency on the write path.

**A3 · Kubernetes is the Phase 5 target.** Until then, everything runs on Docker Compose with a hardened production compose file. Phases 0–4 deliberately deliver value without requiring a cluster to exist.

**A4 · Team size is 2–3 engineers.** Effort is quoted in **engineer-days (ed)**; calendar timelines are given for both a 1-engineer and a 3-engineer team so the plan is usable either way.

**A5 · Go 1.22 and unpinned Python dependencies today.** `backend/requirements.txt` has no version pins on `torch`, `fastapi`, `transformers`, or anything else, so two builds a week apart can produce different systems. Pinning is a Phase 1 prerequisite, not a nice-to-have — you cannot debug a regression you cannot reproduce.

---

## Phase map

```
Phase 0  SECURITY LOCKDOWN          8 ed    ← nothing else starts until this lands
Phase 1  FOUNDATION                18 ed    ← makes every later change safe to make
Phase 2  IDENTITY REBUILD          30 ed
Phase 3  AUTHORIZATION             22 ed
Phase 4  DURABILITY                34 ed
Phase 5  OBSERVABILITY + DEPLOY    30 ed
Phase 6  EVENTS + NOTIFICATIONS    32 ed
Phase 7  SCALE + COMPLETENESS      60 ed+   ← ongoing, not a gate
                                  ─────
                          core:   174 ed to "production-ready"
```

| Phase | Objective | Readiness after |
|---|---|---:|
| **0** | Close every immediately exploitable hole | 26% → 38% |
| **1** | CI, tests, migration tooling, config, structured logs, pinned deps | 38% → 46% |
| **2** | Real identity: access/refresh split, revocation, durable OTP, token reset | 46% → 58% |
| **3** | Real authorization: repository layer, RBAC, ownership, RLS resolution | 58% → 66% |
| **4** | Nothing is lost: outbox, River queue, durable email, webhook ingest | 66% → 76% |
| **5** | We can see and ship it: OTel, dashboards, alerts, K8s, canary deploys | 76% → 85% |
| **6** | Event bus, notifications, agent split, MFA/OAuth | 85% → 91% |
| **7** | Partitioning, replicas, ClickHouse, org tier, self-hosting | 91% → 95%+ |

**Go-live gate is the end of Phase 5.** Phases 6–7 are improvements to a system already serving users.

---

## Why this order

The ordering is driven by three constraints, in priority order:

**1 · Exploitable beats important.** Phase 0 contains work that is individually small and architecturally uninteresting, but every day it is not done is a day an anonymous HTTP request can take over any account. Nothing outranks that.

**2 · You cannot safely rewrite what you cannot test.** Phase 1 comes before the auth rewrite because Phase 2 rewrites the most dangerous code in the system, and there are currently **zero tests in the repository**. Rewriting authentication without a test suite is how you replace a known vulnerability with an unknown one. Phase 1 also delivers `golang-migrate` — without versioned, reversible migrations, every subsequent phase's schema change is a manual, unrepeatable, unrollbackable event. (The `execution_logs` mismatch is exactly what that gap produces.)

**3 · Correctness before observability before scale.** Instrumenting code you are about to rewrite wastes the instrumentation; scaling a system that loses messages just loses them faster. So: fix identity (2) → fix authorization (3) → stop losing data (4) → then measure it (5) → then scale it (7).

The one deliberate exception is that Phase 1 includes *structured logging* (not full OTel). Logs are needed to debug Phase 2–4 work; traces and dashboards can wait until the shape of the services has settled in Phase 5.

---

## Effort model and milestone timeline

Engineer-days include implementation, tests, review, and documentation. They do **not** include incident response or scope discovered mid-flight — apply a 25% buffer for planning purposes.

| Milestone | Gate criteria | Cumulative ed | Solo (calendar) | 3 engineers |
|---|---|---:|---|---|
| **M0 — Not exploitable** | All Phase 0 tasks verified; pen-test of the 5 findings fails to reproduce | 8 | Week 2 | Week 1 |
| **M1 — Safe to change** | CI green on every PR; 60%+ coverage on auth paths; migrations versioned and reversible | 26 | Week 6 | Week 2 |
| **M2 — Real identity** | Refresh rotation live; revocation verified; legacy tokens expired | 56 | Week 12 | Week 5 |
| **M3 — Real authorization** | Every handler behind the repository layer; authz test matrix green | 78 | Week 16 | Week 7 |
| **M4 — Nothing is lost** | Zero message loss under chaos test; DLQ wired; email delivery ≥99% | 112 | Week 23 | Week 10 |
| **M5 — Production go-live** | SLOs defined and met for 7 days in staging; canary + rollback proven; DR restore drill passed | 142 | Week 29 | Week 13 |
| **M6 — Complete** | Notifications, MFA, OAuth, event bus, agent split | 174 | Week 35 | Week 16 |

Solo-track reality check: 35 weeks is eight months. If the timeline matters more than the scope, the honest lever is to cut Phase 6 and the Phase 7 items entirely and go live at M5 — that is a coherent product, and it is 29 weeks solo / 13 weeks with three engineers.

---

## Sprint-by-sprint plan (2-week sprints, 3 engineers)

| Sprint | Focus | Key deliverables | Exit criteria |
|---|---|---|---|
| **S1** | Phase 0 | All 10 P0 tasks; emergency prod-compose hardening | Findings S-1/2/3/6/10 + R-1 unreproducible |
| **S2** | Phase 1a | CI pipeline; `golang-migrate`; pinned deps; test harness with testcontainers | PR cannot merge red; migration up/down/up in CI |
| **S3** | Phase 1b | Config package; structured logging + redaction; `/metrics` skeleton; first 60 tests | Coverage ≥60% on `gateway/auth*` |
| **S4** | Phase 2a | Migration 002–004; sessions + refresh tables; token service; dual-verify middleware | New tokens issued; legacy tokens still accepted |
| **S5** | Phase 2b | Redis OTP; token-based password reset; logout/logout-all; deny-list | Revocation verified end-to-end |
| **S6** | Phase 2c | Frontend cutover to cookie refresh + in-memory access token; legacy token sunset | `localStorage` token removed; auth e2e green |
| **S7** | Phase 3a | Repository layer for goals/prefs/integrations; ownership predicates | Authz matrix green; BOLA tests fail closed |
| **S8** | Phase 3b | RBAC tables + permission middleware; RLS decision executed; least-privilege DB role | App connects as non-superuser |
| **S9** | Phase 4a | Outbox table + relay; River install; execution task/step tables | Outbox relays under chaos test |
| **S10** | Phase 4b | Queue cutover with dual-write; worker rollout | Zero loss in kill-9 test |
| **S11** | Phase 4c | Email service, templates, DLQ, suppression; webhook gateway | Bounce → suppression verified |
| **S12** | Phase 5a | OTel across services; Prometheus/Loki/Tempo/Grafana; alerts | Trace spans gateway→agent→worker |
| **S13** | Phase 5b | Production images; Helm; Argo CD; canary + rollback drill | Rollback proven <5 min |
| **S14** | Phase 5c | Load test; DR restore drill; runbooks; **go-live** | M5 gate passed |
| **S15+** | Phase 6/7 | NATS, notifications, MFA, OAuth, agent split | — |

---

## Team task breakdown

With three engineers, the natural split by ownership (not by ticket):

| Role | Owns | Phases | Never blocked by |
|---|---|---|---|
| **Eng A — Security/Identity** | Phase 0, Phase 2, Phase 3, secrets, threat model | 0,2,3 | Infra work |
| **Eng B — Platform/Data** | Phase 1 (CI, migrations), Phase 4 (outbox, queue), Phase 5 (K8s, deploy) | 1,4,5 | Auth internals |
| **Eng C — Services/Frontend** | Email, notifications, agent hardening, frontend cutover, API versioning | 0(partial),4,6 | DB migrations |

Solo track: follow the phases strictly in order; do not start a phase before its predecessor's exit criteria are met, because the whole point of the ordering is that later work assumes earlier guarantees.

Shared, non-negotiable rules for all streams:
1. No PR merges without a test that would have caught the bug it fixes.
2. Any change to `backend/gateway/auth*.go` requires a second reviewer.
3. Schema changes and the code that uses them ship in **separate PRs**, expand phase first.
4. Every phase updates [`09-trackers-and-go-live.md`](09-trackers-and-go-live.md) — the tracker is the source of truth for status, not memory.

---

## Progress tracker (architecture implementation)

Status values: `Not Started` · `In Progress` · `Blocked` · `Complete`

| Blueprint § | Component | Status | Phase | Notes |
|---|---|---|---|---|
| §1.2.1 | API Gateway hardening | Not Started | 0,1 | CORS, rate limit, route auth |
| §1.2.2 | Identity Service | Not Started | 2 | Extracted from gateway in Phase 6 |
| §1.2.3 | Voice Agent auth | Not Started | 0,6 | Token in P0, mTLS in Phase 6 |
| §1.2.4 | Execution Worker rewrite | Not Started | 4 | River + steps |
| §1.2.5 | Email Service | Not Started | 4 | |
| §1.2.6 | Notification Service | Not Started | 6 | |
| §1.2.7 | Webhook Gateway | Not Started | 4 | |
| §1.2.8 | Audit Service | Not Started | 3 | Table in Phase 3, service in Phase 6 |
| §1.2.9 | File Service | Not Started | 7 | |
| §1.2.10 | Search Service | Not Started | 7 | |
| §4 | Authentication | Not Started | 2 | |
| §5 | Authorization | Not Started | 3 | |
| §6 | Resend pipeline | Not Started | 4 | |
| §7 | Notifications | Not Started | 6 | |
| §8 | Event bus + outbox | Not Started | 4,6 | Outbox P4, NATS P6 |
| §9 | Database | Not Started | 1,2,3,4,7 | Spread across phases |
| §10 | Caching | Not Started | 2,4 | |
| §11 | Queues | Not Started | 4 | |
| §12 | Security | Not Started | 0,2,3,5 | |
| §13 | Observability | Not Started | 1,5 | |
| §14 | CI/CD + deploy | Not Started | 1,5 | |
