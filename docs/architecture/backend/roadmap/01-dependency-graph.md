# Dependency Graph & Parallelization

---

## 1. Top-level phase dependencies

```mermaid
flowchart TD
    P0["Phase 0 · Security Lockdown<br/>8 ed"]
    P1["Phase 1 · Foundation<br/>CI, tests, migrations, config, logs<br/>18 ed"]
    P2["Phase 2 · Identity Rebuild<br/>30 ed"]
    P3["Phase 3 · Authorization<br/>22 ed"]
    P4["Phase 4 · Durability<br/>outbox, queue, email<br/>34 ed"]
    P5["Phase 5 · Observability + Deploy<br/>30 ed"]
    P6["Phase 6 · Events + Notifications<br/>32 ed"]
    P7["Phase 7 · Scale<br/>60 ed+"]
    GO(["GO-LIVE GATE"])

    P0 --> P1
    P1 --> P2
    P1 --> P4
    P2 --> P3
    P3 --> P5
    P4 --> P5
    P5 --> GO
    GO --> P6
    P6 --> P7
    P4 -.-> P6
```

### Why each edge exists

| Edge | Reason it cannot be reversed |
|---|---|
| `P0 → P1` | Not strictly technical — it is a policy edge. Every day spent on tooling while `handleForgotPassword` is live is a day of accepted account-takeover risk. P0 is small enough (8 ed) that it does not need the tooling P1 provides. |
| `P1 → P2` | Phase 2 rewrites authentication. With zero tests today, a rewrite without a harness trades a *known* vulnerability for an *unknown* one. P1 also delivers `golang-migrate`; Phase 2 adds five tables and cannot do that safely with the current `run_migrations.go → node run_migrations.js` shim, which has no versioning, no down migrations, and no advisory lock. |
| `P1 → P4` | Same tooling argument. The outbox and queue work is heavily schema-driven. |
| `P2 → P3` | Authorization needs a `Principal` to authorize. Today `c.Locals("userID")` carries a bare string with no roles, scopes, or `amr`. The repository layer's signature (`Delete(ctx, p auth.Principal, id)`) is meaningless until Phase 2 defines `Principal`. Building authz first would mean building it twice. |
| `P3 → P5` | Do not put an under-authorized system on the internet with a public ingress. Phase 5 is the phase that makes ARI genuinely reachable at scale; the access-control model must be settled first. |
| `P4 → P5` | Canary deployments require an SLO to evaluate, and an SLO on a system that silently drops tasks and emails measures the wrong thing. Also: rolling deploys kill workers mid-task, which is *safe* only after River's lease-and-retry lands — with today's `BLPop`, every rollout loses in-flight work. |
| `P5 → GO-LIVE` | You cannot operate what you cannot observe or roll back. |
| `P4 ⇢ P6` (soft) | NATS consumers need the outbox to have something correct to relay. Soft edge: NATS installation and stream config can start during Phase 5. |
| `P6 → P7` | Notifications and the event catalog are prerequisites for the analytics pipeline and the org tier. |

---

## 2. Task-level dependency graph

```mermaid
flowchart LR
    subgraph p0["Phase 0"]
        T01["T0.1 password reset<br/>remove new_password"]
        T02["T0.2 goal ownership"]
        T03["T0.3 auth on execution routes"]
        T04["T0.4 agent service token"]
        T05["T0.5 CORS allowlist"]
        T06["T0.6 execution_logs fix"]
        T07["T0.7 log redaction"]
        T08["T0.8 rotate git-history secrets"]
    end

    subgraph p1["Phase 1"]
        T11["T1.1 golang-migrate"]
        T12["T1.2 pin deps"]
        T13["T1.3 CI pipeline"]
        T14["T1.4 test harness<br/>testcontainers"]
        T15["T1.5 config package"]
        T16["T1.6 structured logging"]
        T17["T1.7 auth test suite"]
    end

    subgraph p2["Phase 2"]
        T21["T2.1 schema: sessions,<br/>refresh_tokens, credentials"]
        T22["T2.2 token service<br/>access+refresh"]
        T23["T2.3 dual-verify middleware"]
        T24["T2.4 Redis OTP"]
        T25["T2.5 reset tokens"]
        T26["T2.6 deny-list + logout"]
        T27["T2.7 frontend cutover"]
        T28["T2.8 legacy sunset"]
    end

    subgraph p3["Phase 3"]
        T31["T3.1 Principal type"]
        T32["T3.2 repository layer"]
        T33["T3.3 RBAC tables"]
        T34["T3.4 permission middleware"]
        T35["T3.5 RLS decision"]
        T36["T3.6 least-privilege DB role"]
        T37["T3.7 audit_log"]
    end

    subgraph p4["Phase 4"]
        T41["T4.1 outbox + relay"]
        T42["T4.2 River install"]
        T43["T4.3 execution_tasks/steps"]
        T44["T4.4 queue dual-write"]
        T45["T4.5 worker cutover"]
        T46["T4.6 email service"]
        T47["T4.7 webhook gateway"]
        T48["T4.8 suppression list"]
    end

    T01 --> T11
    T06 --> T11
    T11 --> T21
    T12 --> T13
    T13 --> T14
    T14 --> T17
    T15 --> T16
    T21 --> T22 --> T23 --> T27 --> T28
    T24 --> T25
    T22 --> T26
    T22 --> T31 --> T32 --> T34
    T33 --> T34
    T32 --> T35 --> T36
    T31 --> T37
    T11 --> T41
    T41 --> T46
    T42 --> T43 --> T44 --> T45
    T46 --> T48
    T47 --> T48
    T17 --> T22
```

### Critical path

```
T0.1 → T1.1 → T1.13/T1.14 → T1.17 → T2.1 → T2.2 → T2.3 → T2.7 → T2.8
     → T3.1 → T3.2 → T3.4 → T4.1 → T4.6 → P5 deploy → GO-LIVE
```

Anything not on this chain is float and should be scheduled to keep the critical-path engineer unblocked. The two longest-pole items are **T2.2 (token service, 8 ed)** and **T3.2 (repository layer, 9 ed)** — start their design reviews one sprint early.

---

## 3. Parallel work streams

Three streams that share almost no files and can run concurrently from Sprint 2 onward:

```mermaid
flowchart TB
    subgraph A["Stream A — Identity & Access (Eng A)"]
        A1["P0 security fixes"] --> A2["Sessions/refresh schema"]
        A2 --> A3["Token service"] --> A4["OTP + reset"]
        A4 --> A5["Repository layer"] --> A6["RBAC + middleware"]
        A6 --> A7["Audit log"]
    end
    subgraph B["Stream B — Platform & Data (Eng B)"]
        B1["golang-migrate + pin deps"] --> B2["CI pipeline"]
        B2 --> B3["Test harness"] --> B4["Outbox + relay"]
        B4 --> B5["River + worker rewrite"] --> B6["OTel + dashboards"]
        B6 --> B7["K8s + Argo + canary"]
    end
    subgraph C["Stream C — Services & Client (Eng C)"]
        C1["CORS + agent token"] --> C2["Config + structured logging"]
        C2 --> C3["Email service + templates"] --> C4["Webhook gateway"]
        C4 --> C5["Frontend auth cutover"] --> C6["API v1 versioning"]
    end
    A3 -.blocks.-> C5
    B1 -.blocks.-> A2
    B3 -.blocks.-> A3
    B4 -.blocks.-> C3
```

**Synchronization points** — the only four places the streams must meet:

| Sync | When | What must be agreed |
|---|---|---|
| **SP1** | End of Sprint 2 | Migration tooling and naming convention; everyone writes migrations the same way from here |
| **SP2** | Sprint 4 | The `Principal` struct and `auth.Context` shape — A, B, and C all consume it |
| **SP3** | Sprint 6 | Auth cutover: backend must accept both token types before the frontend switches, and the frontend must be switched before legacy sunset |
| **SP4** | Sprint 11 | Event envelope and outbox row shape — email, notifications, and audit all consume it |

### What must NOT be parallelized

| Do not overlap | Why |
|---|---|
| Token service (T2.2) and repository layer (T3.2) | Both change the request-context shape. Concurrent edits to middleware produce merge conflicts in the highest-risk file in the codebase. |
| Queue cutover (T4.5) and worker feature work | The cutover needs a stable worker to compare old vs. new behaviour against. |
| Schema expand and code that reads the new columns | Separate PRs, separate deploys — this is the entire point of expand/contract. |
| RLS decision (T3.5) and DB role change (T3.6) | T3.6 removes `BYPASSRLS`; if T3.5 chose "keep RLS" and the GUC plumbing is not finished, every query starts failing. |
| Two migrations touching the same table | `golang-migrate` serializes, but a failed second migration on a partially-migrated table is the hardest rollback there is. |

---

## 4. Cross-cutting prerequisite chains

**Chain 1 — Nothing can be verified without a test harness.**
`pin deps → reproducible build → testcontainers Postgres+Redis → integration tests → confidence to rewrite auth`
Breaking this chain is what makes an "urgent" auth fix take three weeks of firefighting instead of three days.

**Chain 2 — Nothing can be rolled back without versioned migrations.**
`golang-migrate → down migrations tested in CI → expand/contract discipline → zero-downtime schema change`
The `execution_logs` defect (code references three columns the schema lacks) is the direct product of this chain's absence.

**Chain 3 — Nothing can be authorized without an authenticated principal.**
`Principal type → repository signatures → ownership predicates → RBAC → admin surface`

**Chain 4 — Nothing is durable without the outbox.**
`outbox table → relay → River jobs enqueued in-transaction → email/notification consumers → event bus`

**Chain 5 — Nothing can be deployed safely without observability.**
`structured logs → metrics → traces → SLOs → canary analysis → automated rollback`

---

## 5. Fastest-path variant (if timeline is the binding constraint)

If the goal is "smallest thing safely exposable to real users," this subset is the honest minimum. It reaches ~78% readiness rather than 85%, and knowingly defers the rest.

| Include | Defer |
|---|---|
| All of Phase 0 | Notifications (P6) |
| Phase 1 (all — non-negotiable) | MFA/OAuth (P6) |
| Phase 2 (all) | NATS event bus (P6) — outbox alone is enough at low volume |
| Phase 3 tasks T3.1, T3.2, T3.5, T3.6 | RBAC roles table (T3.3/T3.4) — single `user` role is fine pre-orgs |
| Phase 4 tasks T4.1–T4.6 | Agent split (P6), File/Search services (P7) |
| Phase 5 (all — non-negotiable) | Partitioning, replicas, ClickHouse (P7) |

**≈118 ed → 24 weeks solo / 11 weeks with three engineers.** Phases 1 and 5 appear in the "non-negotiable" column deliberately: they are the two phases most often cut under schedule pressure, and they are the two that make everything after them recoverable.
