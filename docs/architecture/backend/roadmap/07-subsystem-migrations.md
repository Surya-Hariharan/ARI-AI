# Subsystem Migrations

Queue · Event bus · Email · Notifications · AI backend · Infrastructure

---

# 1. Queue migration — Redis list → River

## 1.1 What is being replaced

```
Gateway ──RPush "execution_tasks"──▶ Redis list ──BLPop──▶ Execution worker
```

`BLPop` removes the message before it is processed. There is no ack, no lease, no retry, no DLQ, and no way to detect loss. A `kill -9`, an OOM, or a rolling deploy that outruns the drain window loses the task permanently — and because `logExecution` has never successfully written a row (the schema mismatch fixed in T0.6), there is not even a record that the task existed.

## 1.2 Target

```
Service tx ──river.Insert(tx, job)──▶ river_job (Postgres) ──lease──▶ Worker
                  same transaction                              ack / retry / DLQ
```

## 1.3 Five-stage cutover

### Stage 1 — Install (no behaviour change)
`river migrate-up` creates River's tables. Deploy the new worker binary with `RIVER_ENABLED=false`. Nothing consumes River yet. Verify the tables exist and the worker starts clean.

### Stage 2 — Dual-write (1 week)
The producer writes to both paths inside one transaction:

```go
tx, _ := db.Begin(ctx)
defer tx.Rollback(ctx)

taskID := uuid.New()
_, err = tx.Exec(ctx, `INSERT INTO execution_tasks (...) VALUES (...)`, ...)
_, err = riverClient.InsertTx(ctx, tx, ExecuteTaskArgs{TaskID: taskID}, nil)
if err := tx.Commit(ctx); err != nil { return err }

// Legacy path, AFTER commit — a lost push is now recoverable from River
if cfg.DualWriteRedis {
    redisClient.RPush(ctx, "execution_tasks", taskJSON)
}
```

Only the **Redis** worker consumes during this stage; the River worker runs in `dry_run` mode, claiming jobs, logging what it *would* do, and marking them complete without side effects.

A reconciliation job runs every 5 minutes:
```sql
SELECT t.id FROM execution_tasks t
LEFT JOIN river_job j ON (j.args->>'task_id')::uuid = t.id
WHERE t.created_at > now() - interval '10 minutes' AND j.id IS NULL;
```
Any row returned is a dual-write bug. **Exit criterion: zero discrepancies for 7 consecutive days.**

### Stage 3 — Consumer flip
Set `RIVER_ENABLED=true`, `dry_run=false`, and stop the Redis worker (do not delete it). River becomes the executor. Redis still receives pushes as the rollback path. Monitor for 48 h: task completion rate, oldest-job age, DLQ depth, duplicate side effects.

### Stage 4 — Drain and disable
Confirm `LLEN execution_tasks == 0`, set `DUAL_WRITE_REDIS=false`, keep the flag for one release.

### Stage 5 — Remove
Delete the Redis worker code, the list key, and migration M023 (`DROP COLUMN execution_logs.timestamp`).

## 1.4 Worker rollout

The new worker is a genuine rewrite, not a transport swap, because it gains step-level resumption:

```go
func (w *ExecuteTaskWorker) Work(ctx context.Context, job *river.Job[ExecuteTaskArgs]) error {
    task, steps, err := w.repo.LoadTask(ctx, job.Args.TaskID)
    if err != nil { return err }
    if err := w.authz.Reauthorize(ctx, task.Principal); err != nil {
        return river.JobCancel(err)          // permission revoked since enqueue — do not retry
    }
    for _, s := range steps {
        if s.Status == "completed" { continue }   // resume, never re-execute
        if ctx.Err() != nil { return ctx.Err() }  // drain cleanly on shutdown
        out, err := w.agent.Execute(ctx, s.Action, s.Params, s.IdempotencyKey)
        if err != nil {
            if isPermanent(err) {
                w.repo.FailStep(ctx, s, err)
                return river.JobCancel(err)       // straight to DLQ, no retries
            }
            return err                            // River retries with backoff
        }
        w.repo.CompleteStep(ctx, s, out)
        w.outbox.Emit(ctx, "execution.step_completed", ...)
    }
    return w.repo.CompleteTask(ctx, task)
}
```

Three properties worth calling out: completed steps are skipped on retry (so "send message" fires once), permission is re-checked at execution time rather than trusted from enqueue time, and `river.JobCancel` distinguishes "this will never succeed" from "try again" — the current worker retries nothing and gives up on everything.

## 1.5 Validation, rollback, monitoring

| Concern | Approach |
|---|---|
| **Validation** | Chaos test: `kill -9` at 10 randomized points mid-task; assert zero loss and zero duplicate side effects. Replay the same job 100× and assert one effect. |
| **Rollback** | Stage 2–4 are flag flips. Worst case, re-enable the Redis worker; both paths have been receiving pushes. |
| **Monitoring** | `queue_depth`, `queue_oldest_job_age_seconds` (the scaling and alerting signal), `job_duration_seconds{type,result}`, `dlq_size` (page on non-zero), reconciliation discrepancy count. |

---

# 2. Event bus migration — direct calls → NATS JetStream

## 2.1 Why the outbox comes first

Phase 4 introduces `outbox_events` with consumers invoked **directly, in-process**. Phase 6 changes only the *transport*: the relay publishes to NATS instead of calling functions, and consumers subscribe instead of being called. Consumer logic is untouched.

This ordering means the risky part (transactional correctness, idempotency, retry semantics) is proven in Phase 4 with a simple transport, and the transport swap in Phase 6 is comparatively boring. Doing it the other way — introducing NATS and the outbox together — couples two hard problems.

## 2.2 Introducing NATS

1. **Deploy** a 3-node JetStream cluster (file storage, R=3). Verify quorum survives losing one node.
2. **Define streams** with explicit retention:
   - `ARI_USER` ← `ari.user.>`, limits retention, 7 days
   - `ARI_VOICE` ← `ari.voice.>`, 24 h (high volume)
   - `ARI_EXECUTION` ← `ari.execution.>`, 7 days
   - `ARI_EMAIL` ← `ari.email.>`, 7 days
   - `ARI_DLQ` ← `ari.dlq.>`, 30 days
3. **Retarget the relay**: `publish()` changes from a function call to `js.PublishMsg` with `Nats-Msg-Id: event_id` (JetStream deduplicates on it within the dedupe window — a second layer beneath the consumer's own idempotency check).
4. **Migrate consumers one at a time**, each behind a flag: audit → analytics → search → email → notifications. Security-critical consumers migrate last.
5. **Replay** capability: a durable consumer can be reset to a sequence or timestamp to rebuild a projection. Test this before you need it.
6. **DLQ**: after `max_deliver: 5`, the message lands on `ari.dlq.<original.subject>` with the failure context, and DLQ depth alerts.

## 2.3 Rollback

Each consumer's flag flips back to the direct call. The outbox rows are the same either way, so no data is lost during a flip. NATS can be shut down entirely and the system reverts to Phase 4 behaviour.

## 2.4 Monitoring

Consumer lag (alert >1,000 or >60 s), redelivery rate, DLQ depth, publish latency, stream storage utilization, and — the one people forget — *unpublished outbox row age*, which catches a stalled relay that no NATS metric would show.

---

# 3. Email migration

## 3.1 Current → target

| Today | Target |
|---|---|
| `go func(){ SendEmail(...) }()` from three handlers | Outbox row → queue job → Email Service → Resend |
| No retry, no DLQ, no idempotency | Classified retry, DLQ, `Idempotency-Key` |
| No webhooks, no suppression | Svix-verified webhook ingest, suppression list |
| `fmt.Sprintf` HTML templates in Go source | MJML compiled at build time, versioned |
| Console fallback prints OTPs | Dev-only, body redacted (fixed in T0.7) |

## 3.2 Cutover

**Preserve the existing adapter.** `sendEmailViaResend` and `sendEmailViaSMTP` are correct and well-reasoned; they move into the Email Service unchanged. What changes is everything *around* them.

```
Deploy 1: email_messages/suppressions/webhook_events tables + Email Service (idle)
Deploy 2: handlers write outbox rows AND still call SendEmail directly
          → Email Service consumes and logs what it WOULD send (dry-run)
          → compare: every direct send has a matching dry-run entry
Deploy 3: EMAIL_ASYNC=true — Email Service sends, direct path disabled
          → keep the direct path behind the flag for one release
Deploy 4: webhook endpoint live; suppression enforced
Deploy 5: remove the direct path; delete the template constants from auth_helpers.go
```

The dry-run comparison in deploy 2 is what makes this safe: if the outbox path misses an email type, you find out from a metric, not from a user who never received an OTP.

## 3.3 Template migration

Port `OTPEmailBody`, `WelcomeEmailBody` to MJML verbatim — they are well-built and worth keeping. Replace `ForgotPasswordEmailBody(newPassword)` with `PasswordResetEmailBody(link)` (already done in T0.1). Fix the dead `href="#"` links. Add golden-file tests asserting every template renders in every locale with no unescaped interpolation.

## 3.4 Suppression, retry, DLQ, tracking

Suppression is checked before every send and enforced for all categories on hard bounce/complaint; transactional mail bypasses *marketing* preferences but never bypasses suppression. Retry classification: 429/5xx/timeout retry at 1s→256s ×5 then DLQ; 422/403 fail immediately. Tracking (opens/clicks) stays **off** for transactional and security categories.

## 3.5 Monitoring and rollback

The OTP send→verify funnel is the alarm that matters: a >20% drop from baseline means delivery is broken, and it fires before support tickets do. Also: bounce rate >5%, complaint rate >0.1%, queue age >5 min, DLQ non-zero, webhook signature failures.

Rollback at any deploy is `EMAIL_ASYNC=false`, restoring the direct-send path.

---

# 4. Notification migration

Notifications are net-new, so the risk is not breaking them — it is *disturbing the emails that already work*.

**Rule: the Notification Service never takes over a notification type until it has run in shadow mode for that type.**

```
Deploy 1: notifications, notification_deliveries, notification_preferences tables
          + default preference rows backfilled for all users
Deploy 2: Service consumes events, writes in-app rows only — no email, no push
          Users see an in-app feed; nothing existing changes
Deploy 3: Take over ONE non-critical type (task.completed). Existing auth emails untouched.
Deploy 4: Add push (Web Push/VAPID), still only for migrated types
Deploy 5: Migrate remaining non-security types
Deploy 6: Migrate security notifications LAST, with a shadow week comparing
          "would have sent" against what the direct path actually sent
```

Security emails go last because they are the ones that must never silently stop, and because a preference bug that suppresses "your password was changed" is a security incident rather than a UX annoyance. Correspondingly: **security notification types are not user-suppressible** and are exempt from quiet hours and rate caps.

**Rollback:** per-type flags. Any type can revert to the direct email path independently.

---

# 5. AI backend migration

## 5.1 Agent authentication — three stages

| Stage | Mechanism | Phase | Rollback |
|---|---|---|---|
| 1 | Shared `X-ARI-Service-Token`, constant-time compare, router-level dependency; host ports unpublished | 0 | Remove the dependency |
| 2 | Per-caller tokens (`gateway`, `execution`) with `aud` claims; NetworkPolicy restricting ingress to those two workloads | 5 | Revert to the shared token |
| 3 | mTLS via the mesh + SPIFFE identity + forwarded end-user assertion | 6 | Mesh permissive mode |

Stage 3's user assertion is the important one: until then the agent trusts the gateway's word about who the user is, so a gateway compromise is total. With the assertion, the agent verifies the user principal independently.

## 5.2 Gateway ↔ agent communication

Today: JSON over plaintext HTTP with hardcoded timeouts (12 s for `/plan`, 30 s for voice). Target: gRPC over mTLS with propagated deadlines.

Migrate service by service, keeping HTTP as the fallback:
1. Define protos in `shared/proto/` (the `shared/schemas/` directory already establishes the contract-first habit).
2. Agent serves gRPC **and** HTTP on separate ports.
3. Gateway calls gRPC behind `USE_GRPC_AGENT=true`, falling back to HTTP on `Unimplemented`.
4. Remove HTTP once gRPC is stable for a release.

Endpoints migrate in risk order: `/voice/verify` and `/voice/enroll` first (small payloads, clear contracts), streaming endpoints last.

## 5.3 Voice endpoints and streaming

The 44 HTTP endpoints in `main.py` are an internal API surface that grew organically. Rationalize without breaking: group them under versioned routers (`/v1/wake`, `/v1/asr`, `/v1/tts`, `/v1/rag`, `/v1/runtime`), keep the old paths as aliases for one release, add a per-endpoint deprecation flag following the existing `ARI_ENABLE_LEGACY_PLAN_ENDPOINT` pattern, and delete anything with zero traffic after 30 days.

Streaming (Phase 6): the realtime edge terminates the client WebSocket and speaks gRPC bidirectional streaming to the agent. Introduce alongside the request/response path; migrate clients per device type; keep non-streaming as the fallback for constrained clients.

## 5.4 Execution worker

Covered in §1. The additional AI-specific change: per-user GPU and token quotas enforced before dispatch, so one user's plan cannot monopolize inference capacity.

## 5.5 Security and monitoring

Security: service auth (above), input validation on every endpoint (audio payload caps already exist and are the right pattern to generalize), tool allowlist enforcement in `action_router`, RAG ingest SSRF guards, and prompt-injection defenses (delimited untrusted content, no concatenated system prompts, execution-time authorization).

Monitoring: per-stage latency against the §2.2 budget, wake false-accept/reject, SIV score distribution, ASR confidence, model load time, GPU memory and utilization, and **model version as a label on every metric** — without it, "latency regressed" is unattributable.

---

# 6. Infrastructure migration

## 6.1 Docker and Compose

| Stage | State |
|---|---|
| Now | One `docker-compose.yml`: bind mounts, `air`, `--reload`, all ports published |
| Phase 0 | Add `docker-compose.prod.yml`: no mounts, no reloaders, only 8080 published, resource limits, Redis with `requirepass` + AOF |
| Phase 1 | Multi-stage builds; pinned base digests; `.dockerignore`; build in CI |
| Phase 5 | Distroless, non-root, read-only rootfs, baked model weights, signed images |

The dev compose file stays exactly as it is. It is a good dev loop; the mistake would be making it serve two purposes.

## 6.2 Kubernetes rollout (Phase 5)

Order matters — each step is independently verifiable:

1. Cluster + namespaces + NetworkPolicy default-deny.
2. Stateful dependencies first (Redis via operator, then NATS in Phase 6). Postgres stays on Supabase until Phase 7.
3. Stateless services one at a time, starting with the **execution worker** — no ingress, no traffic, lowest blast radius, and it proves the image/config/secret pipeline end to end.
4. Agent next (needs GPU nodes, PVC for weights, longer probe timings — its startup is 30–120 s).
5. Gateway last, behind an ingress, with traffic shifted gradually from the compose deployment via DNS weighting.
6. Keep compose runnable for one full release as the escape hatch.

## 6.3 Component-by-component

| Component | Migration | Rollback |
|---|---|---|
| **Ingress** | Envoy Gateway + cert-manager; staging cert first | DNS back to the old endpoint |
| **Redis** | Operator-managed with Sentinel; separate instances for cache (`allkeys-lru`) and locks/rate-limits (`noeviction`) | Point back to the single instance |
| **Postgres** | Supabase → PgBouncer in front (Phase 5) → CloudNativePG (Phase 7) | Connection-string revert |
| **NATS** | 3-node JetStream, file storage (Phase 6) | Consumers revert to direct calls |
| **River** | No infra — it is Postgres tables | — |
| **Vault** | External Secrets Operator; migrate one secret class at a time, verifying each | Env vars retained for one release |
| **Object storage** | MinIO (self-hosted) or R2; S3-compatible so they are interchangeable | — |
| **Monitoring** | Prometheus/Loki/Tempo/Grafana via kube-prometheus-stack | Additive; no rollback needed |
| **Autoscaling** | HPA on CPU first, then KEDA on oldest-job age | Fixed replica count |

## 6.4 Secrets migration

The highest-care sequence, because a mistake locks the app out of its own database:

1. Deploy External Secrets Operator; populate Vault.
2. Deploy services reading from **both** sources, preferring Vault, falling back to env, and logging which source served each secret.
3. Watch the logs until every secret is served from Vault.
4. Remove the env fallback.
5. Delete the plaintext env files from every host.

Never migrate all secrets at once. Order: least critical first (`RESEND_API_KEY`), most critical last (`DATABASE_URL`, `JWT_SECRET`).

## 6.5 Deployment progression

```
compose dev  →  compose prod  →  K8s manual (kubectl apply)
             →  K8s + Helm    →  K8s + Argo CD (GitOps)
             →  Argo Rollouts canary + automated analysis + auto-rollback
```

Each step is a working deployment method on its own. Do not attempt to jump from compose to GitOps canary — the intermediate states are where you learn what your manifests actually need.
