# Trackers, Risk Register, Rollback Plan, and Go-Live

---

# 1. Production readiness tracker

Status: `☐ Not Started` · `◐ In Progress` · `⛔ Blocked` · `☑ Complete`

All items start `Not Started` — this reflects the audited state at commit `84944a6`. Update this file at every phase boundary; it is the source of truth for status.

## Security

| # | Item | Status | Phase |
|---|---|---|---|
| SEC-01 | Password reset uses hashed single-use tokens; no password in response or email | ☐ | 0 |
| SEC-02 | Ownership predicates on every user-scoped query | ☐ | 0/3 |
| SEC-03 | Agent service authenticated; host ports unpublished | ☐ | 0 |
| SEC-04 | No unauthenticated application endpoints | ☐ | 0 |
| SEC-05 | CORS restricted to an explicit allowlist | ☐ | 0 |
| SEC-06 | No secrets in logs (redaction filter enforced) | ☐ | 0/1 |
| SEC-07 | All git-history-exposed credentials rotated | ☐ | 0 |
| SEC-08 | `gitleaks`, `govulncheck`, `pip-audit`, Trivy blocking in CI | ☐ | 1 |
| SEC-09 | Security headers + CSP with nonces | ☐ | 5 |
| SEC-10 | Secrets in Vault via External Secrets Operator | ☐ | 5 |
| SEC-11 | Images signed (Cosign) + SBOM + admission policy | ☐ | 5 |
| SEC-12 | mTLS between all internal services | ☐ | 6 |
| SEC-13 | SSRF guards on all URL-fetching paths | ☐ | 4 |
| SEC-14 | Prompt-injection defenses (tool allowlist, delimited RAG, exec-time authz) | ☐ | 4 |
| SEC-15 | Voiceprint envelope encryption + consent + access audit | ☐ | 3 |
| SEC-16 | WAF + DDoS at the edge | ☐ | 5 |
| SEC-17 | Security test suite in CI | ☐ | 2 |
| SEC-18 | Threat model documented and reviewed | ☐ | 5 |

## Authentication

| # | Item | Status | Phase |
|---|---|---|---|
| AUTH-01 | Access tokens ≤10 min with `jti`/`sid`/`aud`/`iss` | ☐ | 2 |
| AUTH-02 | Refresh tokens: opaque, hashed, rotating, reuse-detecting | ☐ | 2 |
| AUTH-03 | Asymmetric signing (EdDSA) + key rotation | ☐ | 2 |
| AUTH-04 | Revocation works and is verified end-to-end | ☐ | 2 |
| AUTH-05 | OTP in Redis: hashed, TTL, attempt-capped, constant-time | ☐ | 2 |
| AUTH-06 | No token in `localStorage`; refresh in `HttpOnly` cookie | ☐ | 2 |
| AUTH-07 | Account lockout + progressive delay | ☐ | 2 |
| AUTH-08 | Password policy: 12 chars + breach check | ☐ | 2 |
| AUTH-09 | `logout` / `logout-all` implemented | ☐ | 2 |
| AUTH-10 | Session list + per-session revoke | ☐ | 2 |
| AUTH-11 | Legacy tokens sunset; `user_sessions` dropped | ☐ | 2 |
| AUTH-12 | MFA (TOTP + recovery codes) | ☐ | 6 |
| AUTH-13 | OAuth: Google, GitHub, Apple (PKCE) | ☐ | 6 |
| AUTH-14 | Device registration + trust + new-device alerts | ☐ | 6 |
| AUTH-15 | Step-up auth on sensitive actions | ☐ | 3 |
| AUTH-16 | Service-to-service authentication | ☐ | 0/6 |

## Authorization

| # | Item | Status | Phase |
|---|---|---|---|
| AZ-01 | `Principal` type carrying roles, scopes, `amr` | ☐ | 2 |
| AZ-02 | Repository layer; no SQL outside it (CI-enforced) | ☐ | 3 |
| AZ-03 | RBAC tables + seeded roles | ☐ | 3 |
| AZ-04 | Deny-by-default permission middleware at group level | ☐ | 3 |
| AZ-05 | 404-not-403 for invisible resources | ☐ | 3 |
| AZ-06 | RLS decision executed and documented | ☐ | 3 |
| AZ-07 | App connects as a non-superuser role | ☐ | 3 |
| AZ-08 | Authorization matrix test suite green | ☐ | 3 |
| AZ-09 | Audit log for all authz denials | ☐ | 3 |
| AZ-10 | Admin surface separated, SSO + WebAuthn | ☐ | 6 |

## Database

| # | Item | Status | Phase |
|---|---|---|---|
| DB-01 | `golang-migrate` with tested up/down | ☐ | 1 |
| DB-02 | Schema/code contract test in CI | ☐ | 1 |
| DB-03 | `execution_logs` mismatch fixed | ☐ | 0 |
| DB-04 | All FK columns indexed | ☐ | 2 |
| DB-05 | Outbox table + relay | ☐ | 4 |
| DB-06 | Optimistic locking on user-facing entities | ☐ | 3 |
| DB-07 | Soft delete + GDPR erasure fan-out | ☐ | 7 |
| DB-08 | PgBouncer + connection budget | ☐ | 5 |
| DB-09 | Read replicas | ☐ | 7 |
| DB-10 | Partitioning on high-growth tables | ☐ | 7 |
| DB-11 | Cleanup crons for expired rows | ☐ | 4 |
| DB-12 | Retention policies implemented | ☐ | 7 |

## Caching · Queue · Email · Notifications

| # | Item | Status | Phase |
|---|---|---|---|
| CACHE-01 | Redis HA (Sentinel/Cluster) | ☐ | 5 |
| CACHE-02 | Separate instances: cache LRU vs. locks `noeviction` | ☐ | 5 |
| CACHE-03 | Redis-backed rate limiting | ☐ | 0/1 |
| CACHE-04 | Cache-aside with jittered TTLs + stampede guard | ☐ | 4 |
| Q-01 | River replaces the Redis list | ☐ | 4 |
| Q-02 | Step-level idempotency + resume | ☐ | 4 |
| Q-03 | DLQ + replay endpoint + alerting | ☐ | 4 |
| Q-04 | KEDA scaling on oldest-job age | ☐ | 5 |
| Q-05 | Zero loss proven under chaos | ☐ | 4 |
| EM-01 | Outbox-driven email with retry classification | ☐ | 4 |
| EM-02 | Idempotency keys (internal + Resend header) | ☐ | 4 |
| EM-03 | Webhook ingest with Svix verification | ☐ | 4 |
| EM-04 | Suppression list enforced | ☐ | 4 |
| EM-05 | MJML templates, versioned, golden-tested | ☐ | 4 |
| EM-06 | SPF + DKIM + DMARC `p=reject` | ☐ | 4 |
| EM-07 | Separate transactional/marketing subdomains | ☐ | 6 |
| EM-08 | Bounce/complaint rate alerting | ☐ | 4 |
| NOT-01 | Notification service + preferences + quiet hours | ☐ | 6 |
| NOT-02 | Priority queues with isolated critical pool | ☐ | 6 |
| NOT-03 | Security notifications non-suppressible | ☐ | 6 |
| NOT-04 | SSE real-time delivery with replay | ☐ | 4 |

## Infrastructure · Monitoring · Testing · CI/CD

| # | Item | Status | Phase |
|---|---|---|---|
| INF-01 | Production images: distroless, non-root, read-only | ☐ | 5 |
| INF-02 | Kubernetes + Helm + Argo CD | ☐ | 5 |
| INF-03 | Ingress + TLS + cert-manager | ☐ | 5 |
| INF-04 | NetworkPolicy default-deny | ☐ | 5 |
| INF-05 | PDB + anti-affinity + multi-AZ | ☐ | 5 |
| INF-06 | Autoscaling (HPA + KEDA) | ☐ | 5 |
| INF-07 | NATS JetStream cluster | ☐ | 6 |
| INF-08 | Object storage | ☐ | 7 |
| INF-09 | IaC (Terraform) with remote state | ☐ | 5 |
| MON-01 | Structured logging + redaction | ☐ | 1 |
| MON-02 | Metrics with cardinality review | ☐ | 5 |
| MON-03 | Distributed tracing end to end | ☐ | 5 |
| MON-04 | Six dashboards with deploy markers | ☐ | 5 |
| MON-05 | SLOs + error budgets + policy | ☐ | 5 |
| MON-06 | Alerts with runbooks, each test-fired | ☐ | 5 |
| MON-07 | Health probes corrected | ☐ | 1 |
| MON-08 | Business + security metrics | ☐ | 6 |
| TEST-01 | Unit + integration harness | ☐ | 1 |
| TEST-02 | 70%+ overall, 80%+ on auth/authz | ☐ | 3 |
| TEST-03 | Security test suite | ☐ | 2 |
| TEST-04 | Chaos + idempotency tests | ☐ | 4 |
| TEST-05 | E2E (Playwright) | ☐ | 5 |
| TEST-06 | Load + soak + stress | ☐ | 5 |
| TEST-07 | Migration up/down/up + forward-compat | ☐ | 1 |
| CI-01 | CI on every PR; branch protection | ☐ | 1 |
| CI-02 | Security scanning blocking | ☐ | 1 |
| CI-03 | Build + sign + SBOM | ☐ | 5 |
| CI-04 | Canary + automated analysis + auto-rollback | ☐ | 5 |
| CI-05 | Rollback proven <5 min | ☐ | 5 |

## Operations · Backup · DR · Documentation

| # | Item | Status | Phase |
|---|---|---|---|
| OPS-01 | Runbooks for every page-severity alert | ☐ | 5 |
| OPS-02 | On-call rotation + escalation | ☐ | 5 |
| OPS-03 | Incident severity ladder + postmortem process | ☐ | 5 |
| OPS-04 | Break-glass access, two-person, audited | ☐ | 5 |
| OPS-05 | Capacity model from load-test data | ☐ | 5 |
| BAK-01 | Continuous WAL archiving + PITR | ☐ | 5 |
| BAK-02 | Automated daily restore verification | ☐ | 5 |
| BAK-03 | Cross-region, Object-Locked copies | ☐ | 5 |
| BAK-04 | Documented RTO/RPO per scenario | ☐ | 5 |
| DR-01 | Restore drill executed and timed | ☐ | 5 |
| DR-02 | Quarterly game days scheduled | ☐ | 5 |
| DOC-01 | OpenAPI published from code | ☐ | 5 |
| DOC-02 | ADRs for major decisions | ☐ | ongoing |
| DOC-03 | Onboarding runbook | ☐ | 5 |
| DOC-04 | Data-handling + privacy documentation (incl. biometrics) | ☐ | 3 |

---

# 2. Risk register

Score = Likelihood (1–5) × Impact (1–5). Owner is by role, not name.

| ID | Risk | L | I | Score | Mitigation | Trigger | Owner |
|---|---|---:|---:|---:|---|---|---|
| R-01 | Account takeover exploited before T0.1 ships | 3 | 5 | **15** | Ship T0.1 in the first PR of the first sprint; if a live deployment exists, take the endpoint offline *today* | Any anomaly in `forgot-password` traffic | Eng A |
| R-02 | Auth rewrite (Phase 2) introduces a worse bug than it fixes | 3 | 5 | **15** | Phase 1 test harness as a hard gate; dual-verify window; two-reviewer rule on `auth*.go`; security test suite | Auth error rate up post-deploy | Eng A |
| R-03 | Repository refactor regresses data access across 7 resources | 4 | 3 | **12** | One resource per PR; authz matrix per PR; CI lint banning SQL outside `repository/` | Any 5xx increase on `/api/user/*` | Eng A |
| R-04 | Queue cutover duplicates side effects (messages sent twice) | 3 | 4 | **12** | Step-level idempotency keys; only one consumer active; reconciliation job; 7-day zero-discrepancy gate | Duplicate-effect reports | Eng B |
| R-05 | Email cutover drops OTPs → nobody can sign up | 2 | 5 | **10** | Dry-run comparison stage; `EMAIL_ASYNC` flag; send→verify funnel alarm | Funnel drop >20% | Eng C |
| R-06 | M014 unique index fails on normalized-email duplicates | 4 | 2 | 8 | Run duplicate detection in staging first; resolve manually; never run unattended | Migration failure | Eng B |
| R-07 | `ari_app` missing a GRANT breaks an unexercised path in production | 3 | 4 | **12** | Full-sprint staging soak; `verify_grants.sql` in CI; keep the old role for a release | `permission denied` in logs | Eng A |
| R-08 | Dependency pinning breaks the ML stack | 4 | 2 | 8 | Pin to currently-resolved versions; smoke test before merge | Agent fails to start | Eng B |
| R-09 | K8s migration consumes the Phase 5 sprint | 4 | 3 | 12 | Managed control plane; migrate the worker first; keep compose runnable | Sprint 13 not on track by mid-sprint | Eng B |
| R-10 | Refresh-token race logs users out en masse | 3 | 4 | 12 | `FOR UPDATE` on the family; client single-flight; explicit concurrency test | Reuse-detection alert spike | Eng A |
| R-11 | Secret rotation (T0.8) logs out all users unexpectedly | 3 | 3 | 9 | Announce; bundle with T0.1; `[SKIP-IF-GREENFIELD]` | Support volume | Eng A |
| R-12 | Voiceprint key rotation corrupts biometric data | 2 | 5 | 10 | Test the re-encryption script on a copy; prefer delete-and-re-enroll | Verification failures | Eng A |
| R-13 | Scope creep — new features during Phases 0–5 | 4 | 3 | 12 | Feature freeze until M5 except security fixes; written exception process | Backlog growth | Tech Lead |
| R-14 | Solo/small team, extended timeline, momentum loss | 4 | 3 | 12 | Ship value each phase; use the fastest-path variant; do not batch releases | Two sprints without a deploy | Tech Lead |
| R-15 | Supabase connection ceiling hit before PgBouncer | 2 | 4 | 8 | Cap `MaxConns`; monitor; prioritize PgBouncer if replica count grows | Connection errors | Eng B |
| R-16 | Test suite treated as optional under deadline pressure | 3 | 4 | 12 | Branch protection with no admin bypass; coverage gate | Coverage decline | Tech Lead |
| R-17 | Alert fatigue → real alerts ignored | 3 | 4 | 12 | Every page needs a runbook and a <5% false-positive target; demote noisy alerts to tickets | >3 non-actionable pages/week | Eng B |
| R-18 | Prompt injection via RAG reaches tool execution | 3 | 4 | 12 | Tool allowlist, delimited untrusted content, execution-time authorization, confirmation on destructive actions | Anomalous tool invocations | Eng C |
| R-19 | Biometric data incident (legal exposure) | 2 | 5 | 10 | Envelope encryption, consent records, access audit, 24 h raw-audio purge, IR runbook | Any unauthorized access | Eng A |
| R-20 | Assumption A1 wrong — live users exist | 2 | 4 | 8 | **Confirm before Sprint 1.** If wrong, all `[SKIP-IF-GREENFIELD]` steps become mandatory | — | Tech Lead |

**Top five by score: R-01, R-02, R-03, R-04, R-07.** All are concentrated in Phases 0–4, which is expected — that is where the system changes most and where the mitigations are deliberately heaviest.

---

# 3. Rollback plan

## 3.1 By change type

| Change | Method | Time | Notes |
|---|---|---|---|
| Application code | Argo revert to previous digest | <2 min | Always available |
| Feature behaviour | Feature-flag flip | <30 s | Fastest lever; ship risky changes behind flags |
| Config | GitOps revert | <2 min | |
| Additive migration | `migrate down 1` | <5 min | Safe by construction |
| Backfill | Re-run (idempotent) or ignore | — | Never destructive |
| Contract migration (M015) | **PITR restore** | ~1 h | Backup verified immediately prior |
| Auth cutover stage | Flag or deploy revert | <5 min | See §5 rollback matrix |
| Queue cutover | Re-enable Redis worker | <5 min | Dual-write is the safety net |
| Email cutover | `EMAIL_ASYNC=false` | <1 min | Direct path retained one release |
| DB role change | Connection-string revert | <5 min | Old role retained one release |
| Infrastructure | Terraform revert / DNS weight | 5–30 min | Compose kept runnable one release |

## 3.2 Rollback decision tree

```
Incident detected
├─ User-facing and severe (auth broken, data loss, 5xx > 5%)
│    → ROLL BACK FIRST, diagnose after. Do not debug in production.
├─ Degraded but functional
│    → Feature flag off if possible; otherwise roll back at the next decision point
├─ Data corruption suspected
│    → Stop writes immediately → assess scope → PITR to before the incident
└─ Security incident
     → Contain (revoke, rotate, block) → then roll back → then investigate
```

## 3.3 The irreversible points

Only three in the whole plan, each requiring explicit sign-off:

1. **M015** (drop `user_sessions`, `users.password_hash`) — requires a verified backup, confirmed PITR, and ≥14 days post-sunset.
2. **Secret rotation (T0.8)** — old credentials cannot be un-rotated; this is intentional.
3. **Voiceprint key rotation** — old ciphertext is unreadable without the old key; keep the old key escrowed until re-encryption is verified.

Everything else in this roadmap is reversible, and that is a deliberate design property of the sequencing, not a coincidence.

---

# 4. Go-live checklist

Every item verified and signed off before production traffic. Owner initials + date required.

## Security
- [ ] All P0 findings verified unreproducible by manual test
- [ ] Security test suite green
- [ ] Penetration test or structured self-review completed; findings triaged
- [ ] All secrets in Vault; none in env files on hosts; none in git
- [ ] TLS 1.3, HSTS preload, CSP with nonces, all headers verified externally
- [ ] WAF and DDoS protection active and tested
- [ ] Rate limits verified under burst
- [ ] Audit log capturing all auth, authz, admin, and biometric events

## Authentication & Authorization
- [ ] Access ≤10 min; refresh rotating with reuse detection
- [ ] Revocation verified end-to-end within the access-token TTL
- [ ] Legacy tokens fully sunset
- [ ] Authorization matrix green including every "other user's object" case
- [ ] App connects as a non-superuser
- [ ] Step-up enforced on all sensitive actions

## Data
- [ ] All migrations applied; schema matches code (contract test green)
- [ ] Backups running; **restore drill executed, timed, and documented**
- [ ] RTO/RPO documented and demonstrated
- [ ] Retention and deletion paths implemented for PII and biometrics
- [ ] Connection pooling sized against measured load

## Reliability
- [ ] Zero message loss proven under chaos
- [ ] DLQs wired, alerting, and replayable
- [ ] Circuit breakers on every external dependency
- [ ] Graceful shutdown verified for every service
- [ ] Load test at 10× expected peak passed; capacity model written

## Operations
- [ ] All six dashboards live
- [ ] Every page-severity alert has a runbook and has been test-fired
- [ ] On-call rotation staffed with escalation path
- [ ] Incident process documented; severity ladder agreed
- [ ] Rollback demonstrated in production-like conditions in <5 min
- [ ] Canary with automated analysis proven on a deliberately broken build

## Compliance & product
- [ ] Privacy policy covers voice data and biometrics explicitly
- [ ] Biometric consent recorded per user with version
- [ ] Data export and deletion paths working end to end
- [ ] DPA in place with every processor (Resend, Supabase, cloud)
- [ ] SPF/DKIM/DMARC `p=reject` verified; sending domain warmed
- [ ] Support workflow and escalation defined
- [ ] Status page live

## Final gates
- [ ] 7 consecutive days meeting all SLOs in staging
- [ ] No open Critical or High findings
- [ ] Readiness score ≥85%
- [ ] Rollback plan reviewed by the whole team
- [ ] Go/no-go meeting held; decision recorded with named owner

---

# 5. Definition of done (per phase)

A phase is complete only when **all** hold:

1. Every task's success criteria met and demonstrated.
2. Tests written, green, and coverage target met.
3. Documentation updated — including this tracker.
4. Deployed to staging and stable for ≥3 days.
5. Rollback tested for every change in the phase.
6. Monitoring and alerts added for anything new.
7. No new Critical or High findings introduced.
8. Readiness score re-assessed and recorded.

Skipping item 4 or 5 is the most common way a roadmap like this quietly stops being true. Both are cheap; neither is optional.
