# §8–§11 Events, Database, Caching, Queues

---

# §8 Event-Driven Architecture

## 8.0 Transport choice

**NATS JetStream.** Single Go binary, clusters with three nodes, supports both pub/sub streams and work queues, at-least-once with explicit ack, per-consumer replay, and native subject hierarchies. Self-hosted and vendor-neutral, consistent with the project's standing principle.

| Alternative | Why not (for now) |
|---|---|
| Kafka / Redpanda | Correct at high volume with long retention and compaction needs; operationally heavier than ARI justifies. Migrate if sustained throughput exceeds ~50k events/s or you need multi-day replay with log compaction. |
| Redis Streams | Already deployed, so tempting — but persistence guarantees are weaker (AOF `everysec` can lose a second of events) and consumer-group ergonomics are thin. Redis stays a cache and lock manager. |
| Postgres `LISTEN/NOTIFY` | Payload-size limited, no persistence, no replay, and notifications are lost if no listener is connected. Fine as the *outbox relay trigger*, not as the bus. |

## 8.1 The outbox pattern — non-negotiable

Publishing to a broker and committing to the database are two systems; doing both without coordination is a dual write, and dual writes lose data. Every event is therefore written to Postgres in the same transaction as the state change it describes, then relayed.

```sql
CREATE TABLE outbox_events (
  id             BIGSERIAL PRIMARY KEY,
  event_id       UUID NOT NULL UNIQUE,
  event_type     TEXT NOT NULL,
  event_version  INT  NOT NULL DEFAULT 1,
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  payload        JSONB NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',  -- trace_id, actor, source, idempotency_key
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  attempts       INT NOT NULL DEFAULT 0
);
CREATE INDEX ON outbox_events (created_at) WHERE published_at IS NULL;
```

Relay: `SELECT … WHERE published_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100` — publish, mark, commit. `SKIP LOCKED` lets multiple relay replicas run without coordination. Woken by `LISTEN/NOTIFY` for latency, with a 200 ms poll as the safety net (NOTIFY is lost if no listener is connected, so the poll is what makes it correct). Published rows are pruned after 7 days.

Ordering guarantee: **per aggregate only.** `aggregate_id` is the partition key; events for one user are ordered, events across users are not. This is the right guarantee — global ordering would require a single partition and cap throughput at one consumer.

## 8.2 Envelope

```json
{
  "event_id": "evt_01J...",
  "event_type": "user.registered",
  "event_version": 1,
  "occurred_at": "2026-08-01T10:00:00Z",
  "aggregate": { "type": "user", "id": "usr_01J..." },
  "actor":    { "type": "user", "id": "usr_01J...", "ip": "…" },
  "trace_id": "4bf92f...", "correlation_id": "req_…", "causation_id": "evt_…",
  "data": { }
}
```

`causation_id` is what makes a distributed system debuggable: given any event you can walk backwards to the request that caused it.

**Schema evolution.** JSON Schema per event type in `shared/schemas/` (the directory already exists with four contracts — extend the pattern), validated in CI. Additive changes only within a version; removing or retyping a field requires `event_version` 2 with both versions published during a transition window.

## 8.3 Event catalog

Every consumer is at-least-once and therefore must be idempotent — keyed on `event_id` in a `processed_events` table or a Redis `SETNX`.

### Identity

| Event | Producer | Consumers | Key payload | Retry / ordering | Failure recovery |
|---|---|---|---|---|---|
| `user.registered` | Identity | Email (verification), Analytics, Audit | `user_id, email_hash, source` | 5×, per-user ordered | Replay from outbox |
| `user.verified` | Identity | Email (welcome), User (provision defaults), Search, Analytics, Audit | `user_id, verified_at` | 5× | Idempotent provisioning |
| `user.login_succeeded` | Identity | Analytics, Notification (new device), Audit, Fraud | `user_id, ip, ua, device_id, new_device` | 3×, lossy-tolerant | — |
| `user.login_failed` | Identity | Audit, Fraud, Rate-limiter | `email_hash, ip, reason` | 3× | — |
| `user.password_changed` | Identity | Notification, Session revoker, Audit | `user_id, method` | 5×, **strictly ordered per user** | Critical — must not be lost |
| `user.mfa_enabled` / `disabled` | Identity | Notification, Audit | `user_id, factor_type` | 5× | |
| `session.revoked` | Identity | Gateway deny-list, Audit | `session_id, user_id, reason` | 5×, latency-critical | Deny-list rebuilt from DB on gateway start |
| `refresh_token.reuse_detected` | Identity | Security alerting (page), Notification, Audit | `user_id, family_id, ip` | 5× | Never dropped |
| `account.locked` | Identity | Notification, Audit | `user_id, reason, until` | 5× | |
| `device.registered` | Identity | Notification, Audit | `user_id, device_id, fingerprint` | 3× | |

### Organization (Phase 4)

| Event | Producer | Consumers |
|---|---|---|
| `org.created` | Org | Billing, Analytics, Audit |
| `org.invitation_sent` | Org | Email, Audit |
| `org.invitation_accepted` | Org | User (membership), Notification, Billing (seats), Audit |
| `org.member_removed` | Org | Session revoker (org-scoped), Audit |

### Voice / AI

| Event | Producer | Consumers | Notes |
|---|---|---|---|
| `voice.session_started` / `ended` | Agent | Analytics, Billing (minutes) | High volume — sampled |
| `voice.wake_detected` | Agent | Analytics | Sampled 1:10 |
| `voice.speaker_verified` / `rejected` | Agent | Audit (security-relevant), Analytics | Rejections always audited |
| `voice.transcription_completed` | Agent | Search index, Analytics | Transcript is PII — see §9.7 |
| `voice.intent_classified` | Agent | Analytics, Model-improvement pipeline | |
| `voice.low_confidence` | Agent | Model-improvement, Analytics | Feeds `low_confidence_events` |
| `ai.job_completed` / `failed` | Execution | Notification, Analytics, Billing | User-visible |
| `voice.profile_enrolled` / `deleted` | Agent | Audit (**always**), Notification | Biometric — mandatory audit |

### Execution

| Event | Producer | Consumers | Notes |
|---|---|---|---|
| `execution.task_queued` | Gateway/Agent | Analytics | |
| `execution.step_completed` | Execution | SSE fan-out, Analytics | Ordered per task |
| `execution.task_completed` / `failed` | Execution | Notification, Analytics, Audit | Terminal |
| `execution.task_dead_lettered` | Execution | Alerting (page) | Any occurrence is an incident |

### Email / Notification / Files / Search

| Event | Producer | Consumers |
|---|---|---|
| `email.requested` | Any (outbox) | Email Service |
| `email.sent` / `delivered` | Email Service | Analytics |
| `email.bounced` / `complained` | Webhook Gateway | Suppression list, User (flag address), Alerting |
| `notification.sent` / `failed` | Notification | Analytics, Alerting (critical only) |
| `file.uploaded` | File | Processing pipeline, AV scan, Analytics |
| `file.processed` / `scan_failed` | File | Notification, Quarantine |
| `search.index_requested` | Any | Search |
| `webhook.received` | Webhook GW | Per-provider consumers, Audit |

### Compliance

| Event | Producer | Consumers | Notes |
|---|---|---|---|
| `user.data_export_requested` | User | Export worker, Audit | GDPR Art. 15, 30-day SLA |
| `user.deletion_requested` | User | Deletion orchestrator (all services), Audit | GDPR Art. 17 — must fan out to *every* service holding user data, including voiceprints, RAG embeddings, and object storage |

## 8.4 Consumer rules

1. **Idempotent.** Check `processed_events(consumer_name, event_id)` before acting, insert after — in the same transaction as the effect where possible.
2. **Ack after success**, never before. NATS redelivers on ack timeout (30 s default, extended via `InProgress` for long work).
3. **Poison messages** go to `{stream}.dlq` after 5 attempts, with the full envelope and the last error. DLQ depth > 0 alerts.
4. **No unbounded fan-out.** A consumer that publishes an event which (transitively) triggers itself must carry a hop counter.
5. **Consumer lag is the health metric.** Alert on lag > 1,000 messages or > 60 s, whichever comes first.
6. **Backwards-compatible parsing.** Ignore unknown fields; never fail on an added field.

---

# §9 Database Design

## 9.0 Engine choice

PostgreSQL 16 for everything transactional, plus `pgvector` for embeddings and `pgcrypto` for envelope encryption. One engine, ACID, mature replication, and it can serve the vector workload without a second datastore. ClickHouse is added later purely for analytics (append-only, columnar, high-cardinality aggregation) — that is a genuinely different workload, not a preference.

NoSQL was considered and rejected: ARI's data is highly relational (users → devices → sessions → turns → events), the outbox pattern requires multi-row transactions, and there is no access pattern here that a document store serves better.

Migration path from hosted Supabase to self-hosted CloudNativePG/Patroni is preserved by using no Supabase-proprietary features on the write path — which today means removing the `auth.uid()` RLS policies (§5.0) rather than deepening the dependency.

## 9.1 Schema issues in the current migrations

| # | Issue | Impact |
|---|---|---|
| 1 | `execution_logs` has `(id, task_id, status, output, timestamp)` but the worker inserts `(id, task_id, device_id, status, metadata, created_at)` | **Every execution status write fails.** `/execution/status/:task_id` 404s for all tasks. |
| 2 | `execution_logs.task_id` is `TEXT` with **no index and no unique constraint**, and no FK to a task table | Status lookups are sequential scans; duplicate rows per task; orphaned logs |
| 3 | `users.role TEXT DEFAULT 'User'` — no CHECK, no FK, inconsistent casing | Typos become silent privilege bugs |
| 4 | `user_sessions.token TEXT UNIQUE` stores the **raw JWT** | DB read access = session hijack for every user |
| 5 | No `deleted_at` anywhere | GDPR erasure and undo are impossible without hard deletes |
| 6 | No optimistic-locking `version` column | Concurrent profile updates silently overwrite (last-writer-wins) |
| 7 | `interaction_logs`, `voice_events`, `voice_turns` unpartitioned | These are the highest-growth tables; vacuum and index bloat will dominate |
| 8 | No outbox table | Dual writes throughout |
| 9 | Missing FK indexes: `devices.user_id`, `user_integrations.user_id`, `agent_memory.user_id`, `interaction_logs.user_id`, `user_goals.user_id`, `user_preferences.user_id` | Postgres does **not** auto-index FK columns; every cascade delete and user-scoped query scans |
| 10 | `idx_users_email` duplicates the implicit unique index from `email TEXT UNIQUE` | Redundant index, wasted writes |
| 11 | `otp_codes` used as a state flag (`code='reset'`, `type='forgot_password'`) | Table is doing two jobs; `handleLogin` pays an extra query per login to read the flag |
| 12 | Migrations are `IF NOT EXISTS`-only with no down migrations and no version tracking | Drift is silent; rollback is manual; issue #1 is exactly this failure mode |
| 13 | `voice_embedding BYTEA` on `users` and a second copy on `user_voice_profiles.embedding` | Two sources of truth for biometric data; unclear which is authoritative for deletion |

## 9.2 Core schema changes

```sql
-- Identity (owner: Identity Service)
ALTER TABLE users
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification','active','suspended','deleted')),
  ADD COLUMN email_normalized TEXT,          -- UNIQUE; dots/plus-tags stripped
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN version INT NOT NULL DEFAULT 1,
  ADD COLUMN last_login_at TIMESTAMPTZ,
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

-- Credentials split out: password material never travels with profile reads
CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  algo TEXT NOT NULL DEFAULT 'argon2id',
  params JSONB NOT NULL,                     -- lets you re-hash on upgrade
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_change BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  amr TEXT[] NOT NULL DEFAULT '{}',
  ip INET, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ, revoked_reason TEXT
);
CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;
-- refresh_tokens: see §4.1

-- Roles
CREATE TABLE roles (id TEXT PRIMARY KEY, description TEXT NOT NULL);
CREATE TABLE role_permissions (role_id TEXT REFERENCES roles(id), permission TEXT,
                               PRIMARY KEY (role_id, permission));
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id),
  scope_type TEXT NOT NULL DEFAULT 'global',   -- global | org | team
  scope_id UUID,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, role_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Execution, corrected
CREATE TABLE execution_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  session_id UUID REFERENCES voice_sessions(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  intent TEXT NOT NULL,
  plan JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled','dead_lettered')),
  attempt_count INT NOT NULL DEFAULT 0,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON execution_tasks (user_id, created_at DESC);
CREATE INDEX ON execution_tasks (status, created_at) WHERE status IN ('queued','running');

CREATE TABLE execution_steps (
  task_id UUID NOT NULL REFERENCES execution_tasks(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  action TEXT NOT NULL,
  params JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output JSONB, error JSONB,
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  PRIMARY KEY (task_id, step_index)
);
```

`execution_steps` is what makes resumption safe: a retried task skips steps already `completed`, so "send the message" cannot fire twice.

## 9.3 Indexing

Add the missing FK indexes (#9 above), drop the redundant `idx_users_email`, and add:

```sql
CREATE INDEX CONCURRENTLY ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
CREATE INDEX CONCURRENTLY ON outbox_events (created_at) WHERE published_at IS NULL;
CREATE INDEX CONCURRENTLY ON email_messages (status, queued_at) WHERE status IN ('queued','sending');
CREATE INDEX CONCURRENTLY ON interaction_logs (user_id, timestamp DESC);
CREATE INDEX CONCURRENTLY ON agent_memory (user_id, updated_at DESC);
CREATE INDEX CONCURRENTLY ON voice_sessions (state, started_at) WHERE state <> 'IDLE';
-- RAG
CREATE INDEX ON rag_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Always `CONCURRENTLY` in production — a plain `CREATE INDEX` takes an `ACCESS EXCLUSIVE`-adjacent lock that blocks writes for the duration. Partial indexes (`WHERE status = …`) are dramatically smaller and are the right shape for queue-like tables where the hot set is a tiny fraction of rows.

## 9.4 Transactions and locking

- **Isolation:** `READ COMMITTED` default; `REPEATABLE READ` for multi-read consistency; `SERIALIZABLE` only for refresh-token rotation and quota decrement, with retry-on-40001 wrappers.
- **Optimistic locking** (`version` column) for user-facing edits — profile, preferences, goals. Concurrent edit → `409 Conflict` with the current state, letting the client merge. Today's blind `UPDATE users SET …` silently discards a concurrent edit.
- **Pessimistic locking** (`SELECT … FOR UPDATE`) only where correctness demands serialization: refresh-token rotation, quota consumption, outbox relay (`SKIP LOCKED`).
- **Rules:** keep transactions short; never make a network call inside one (the current `handleVerifyOTP` does DB work interleaved with goroutine-spawned email sends — the sends are outside the transaction, which is right, but they are also outside any durability guarantee, which is not); consistent lock ordering to avoid deadlocks; explicit `statement_timeout` (5 s OLTP, 60 s batch) and `idle_in_transaction_session_timeout` (10 s) so a stuck client cannot hold locks and block vacuum indefinitely.

## 9.5 Soft delete and data lifecycle

`deleted_at` on user-facing entities; all reads go through views or repository predicates that exclude soft-deleted rows. Hard deletion runs 30 days later via cron, giving a recovery window.

GDPR erasure is *not* a soft delete: it must fan out to every store — Postgres rows, voiceprints, RAG embeddings, object storage audio, search indexes, ClickHouse analytics, and the email suppression list (retained lawfully, as a hash, on legitimate-interest grounds). This is why `user.deletion_requested` is an event with many consumers rather than a `DELETE` statement.

Retention defaults: `voice_events` 90 d → ClickHouse; `interaction_logs` 180 d (contains speech content — arguably the most sensitive non-biometric data in the system); `audit_log` 7 y; `email_messages` metadata 2 y, recipient plaintext 90 d; raw enrollment audio 24 h.

## 9.6 Partitioning

Range-partition by month: `voice_events`, `voice_turns`, `interaction_logs`, `audit_log`, `outbox_events` (archived), `email_messages`. Partitions created 3 months ahead by cron; old partitions `DETACH`ed and archived to Parquet in object storage. The operational win is that dropping a partition is instant, while `DELETE FROM … WHERE timestamp < …` on a large table generates enormous WAL, bloats indexes, and starves autovacuum.

## 9.7 Encryption and biometric data

Voiceprints are special-category biometric data under GDPR Art. 9 and, in some jurisdictions (e.g. Illinois BIPA), carry a private right of action. The current implementation encrypts with `pgp_sym_encrypt(decode($1,'base64'), $2)` where `$2` is `VOICE_EMBEDDING_KEY` passed as a **query parameter** ([`voice_handlers.go:32`](../../../backend/gateway/voice_handlers.go#L32)). Two problems: the key can surface in `pg_stat_statements`, `log_statement`, and error contexts; and there is one global key with no version, so rotation would require decrypting every row with no way to tell which key encrypted which.

Target — envelope encryption:

```sql
CREATE TABLE user_voice_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  embedding_ciphertext BYTEA NOT NULL,
  dek_wrapped          BYTEA NOT NULL,   -- per-user DEK, wrapped by the KMS KEK
  kek_version          INT   NOT NULL,
  algo                 TEXT  NOT NULL DEFAULT 'aes-256-gcm',
  nonce                BYTEA NOT NULL,
  embedding_dim        INT   NOT NULL,
  model_version        TEXT  NOT NULL,   -- embeddings are not portable across models
  consent_at           TIMESTAMPTZ NOT NULL,
  consent_version      TEXT NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Encryption happens in the application, not in SQL, so no key ever appears in a query. `kek_version` makes rotation a background re-wrap of DEKs rather than a full re-encryption. `consent_at` is a legal requirement, not a nicety. Every read of `embedding_ciphertext` writes an audit row. Also resolve the duplication: `users.voice_embedding` and `user_voice_profiles.embedding` must not both exist — pick `user_voice_profiles` and drop the column from `users`.

## 9.8 Migrations

Replace the ad-hoc `run_migrations.go`/`.js` scripts with a real tool (`golang-migrate` or Atlas): versioned up/down pairs, a `schema_migrations` table, an advisory lock so concurrent deploys cannot race, checksum verification to catch edited-after-apply migrations, and CI that applies every migration to a scratch database and then runs the test suite. Expand/contract for every breaking change: add nullable → backfill → dual-write → switch reads → drop old, each step a separate deploy. Migrations run as a pre-deploy Kubernetes Job, never from application startup.

## 9.9 Connection pooling

Application (pgxpool) → PgBouncer (transaction mode) → Postgres. Currently each service opens `MaxConns: 15` directly to the Supabase pooler; at 20 gateway replicas that is 300 connections and will exhaust the ceiling, producing connection errors that look like database outages.

Sizing: `max_connections ≈ 4 × vCPU` at the Postgres layer; PgBouncer absorbs the difference. Transaction-pooling mode forbids session-level state — no `SET` outside a transaction, no session advisory locks, no prepared-statement caching unless pgx's `QueryExecModeExec` is configured. Separate pools per workload (web/worker/analytics) so a batch job cannot exhaust the pool serving user requests.

## 9.10 Replicas, backup, and DR

Two streaming replicas: one for read scaling, one for analytics/backup. Route to replicas only where staleness is acceptable — dashboards, history, search — and never for read-after-write on the same request (a user updating their profile must read the primary, or they will see their old data and file a bug).

**Backup:** continuous WAL archiving to object storage (pgBackRest) + nightly full + PITR to any second within 30 days. Monthly archives retained 1 year, in a second region with Object Lock so a compromised credential cannot delete backups.

**Targets:** RPO ≤ 5 min, RTO ≤ 1 h for the primary; RPO 0 / RTO ≤ 5 min for AZ failure via synchronous replica promotion.

**Restore drills quarterly, in a staging environment, timed and documented.** An untested backup is a hypothesis. This is currently the largest unaddressed operational risk: ARI inherits Supabase's backups with no verification, no documented RTO/RPO, and no restore runbook.

---

# §10 Caching Strategy

## 10.0 Layers

| Layer | Technology | TTL | Invalidation |
|---|---|---|---|
| Browser | `Cache-Control`, ETag | Static: 1 y (hashed filenames); API: `no-store` | Content hash |
| CDN | Cloudflare | Static 1 y; API bypass | Purge by tag |
| Application in-process | `ristretto` LRU | 10–60 s | TTL only — never try to invalidate per-replica in-process caches; keep TTLs short instead |
| Distributed | Redis | Per key class | Event-driven + TTL |
| Database | Postgres shared buffers | — | — |

## 10.1 Redis key classes

| Purpose | Key | TTL | Notes |
|---|---|---|---|
| Session lookup | `sess:{session_id}` | 15 min | Write-through on session update |
| Token deny-list | `denylist:sid:{sid}` / `denylist:user:{uid}` | = access-token TTL (10 min) | Bounded size by construction |
| Rate limits | `rl:{class}:{subject}:{window}` | window + 60 s | Sliding window via sorted set, or a Lua token bucket |
| OTP | `otp:{purpose}:{email_hash}` | 10 min | Hashed code + attempt counter |
| Password-reset throttle | `pwreset:{user_id}` | 1 h | |
| Permissions | `perms:{user_id}:{version}` | 5 min | Version-keyed → no explicit invalidation needed |
| Feature flags | `flags:{env}:{version}` | 60 s | Pub/sub on change |
| User profile | `user:{id}` | 5 min | Invalidate on `user.updated` |
| Voice config | `voicecfg:{user_id}` | 30 min | Wake/speaker thresholds — read on every session start |
| TTS phrase cache | `tts:{voice}:{hash(text)}` | 7 d | Pre-synthesized common phrases; directly buys latency budget |
| RAG query cache | `rag:{hash(query)}:{user}` | 5 min | Only for identical queries |
| LLM response cache | `llm:{model}:{hash(prompt)}` | 1 h | Deterministic prompts only (`temperature=0`) |
| Idempotency records | `idem:{key}` | 24 h | Stores the response |
| Distributed locks | `lock:{resource}` | 30 s | Redlock-style with a fencing token |
| SSE fan-out | `notif:{user_id}` (pub/sub) | — | Not a cache |
| Circuit-breaker state | `cb:{service}` | 60 s | Shared across replicas |

## 10.2 Patterns and hazards

**Cache-aside** for reads; **write-through** for sessions; **write-behind** for high-volume counters (usage metering flushed every 10 s). 

Three specific hazards to design against:

*Stampede.* When a hot key expires, every replica misses simultaneously and hits the database at once. Mitigation: a per-key `SETNX` lock so one request recomputes while others serve stale, plus **jittered TTLs** (`base ± 10%`) so keys populated together do not expire together.

*Penetration.* Repeated lookups of a nonexistent key bypass the cache entirely and can be used deliberately as an attack. Cache negative results with a short TTL (30 s).

*Thundering herd on restart.* A cold cache after a deploy can overload the database. Warm critical keys at startup and roll deployments gradually.

**Never cache:** authentication decisions beyond the token's own lifetime, permission grants for longer than 5 minutes, anything containing a secret, or anything whose staleness is a security issue. **Never** use a Redis cache as the source of truth — the current `pendingSignups` map is the in-memory version of this mistake, and moving it to Redis fixes the replication problem but the durable record must still be in Postgres.

## 10.3 Redis operations

Redis Sentinel or Cluster for HA — a single Redis is a system-wide single point of failure. Separate logical databases (or instances) for cache, queue, and pub/sub so a cache eviction storm cannot evict rate-limit counters. `maxmemory-policy allkeys-lru` for the cache instance, but **`noeviction` for the rate-limit and lock instances** — silently evicting a lock key is a correctness bug, not a capacity issue. Persistence: AOF `everysec` for queue/lock instances, none needed for pure cache. Alert on hit rate < 80%, evictions > 0 on `noeviction` instances, memory > 80%, and P99 latency > 5 ms.

---

# §11 Queue Architecture

## 11.0 Technology selection

Two systems, chosen for two different guarantee requirements:

**River (Postgres-backed) for transactional jobs.** The decisive property: `river.Insert(tx, job)` participates in the *same transaction* as the business write. Enqueue-after-commit can lose the job on a crash; enqueue-before-commit can produce a job for a transaction that rolled back. Only a database-backed queue eliminates both. Gives exactly-once enqueue, at-least-once execution, unique jobs, priorities, and scheduling, at a cost of roughly a few thousand jobs/second — far above ARI's needs.

**NATS JetStream work queues for high-volume, non-transactional jobs** — telemetry ingest, search indexing, analytics fan-out, where 100k+/s matters and losing an occasional record does not.

Redis + `RPush`/`BLPop` — the current implementation — is rejected outright: `BLPop` removes the message before processing, so it provides **at-most-once** delivery with no ack, no visibility timeout, no retry, no DLQ, and no way to even detect a loss. A worker crash after popping loses the task silently.

## 11.1 Queues

| Queue | Backend | Priority | Concurrency | Retry | DLQ | Scaling signal |
|---|---|---|---|---|---|---|
| `email.transactional` | River | high | 20 | 5×, exp | yes | oldest-job age |
| `email.marketing` | River | low | 10 | 3× | yes | depth |
| `notification.critical` | River | critical | 30 | 5× | yes | oldest-job age (tight SLA) |
| `notification.normal` | River | normal | 20 | 3× | yes | depth |
| `execution.tasks` | River | high | 50 | 5× | yes | oldest-job age |
| `ai.inference` | River | normal | GPU-bound (4–8) | 3× | yes | GPU queue depth |
| `voice.enrollment` | River | normal | 10 | 3× | yes | depth |
| `file.processing` | River | normal | 15 | 3× | yes | depth |
| `search.index` | JetStream | low | 20 | 5× | yes | consumer lag |
| `analytics.ingest` | JetStream | low | 50 | 2× | no (lossy) | consumer lag |
| `webhook.inbound` | River | high | 30 | 5× over 24 h | yes | depth |
| `cleanup.*` | Cron → River | low | 5 | 2× | no | — |

## 11.2 Job contract

```go
type Job struct {
    ID             uuid.UUID
    Type           string
    Payload        json.RawMessage
    IdempotencyKey string        // enforced UNIQUE
    Principal      Principal     // re-authorized at execution, not at enqueue
    TraceID        string        // continues the originating trace
    Attempt        int
    MaxAttempts    int
    ScheduledAt    time.Time
    Deadline       time.Time     // hard cap; expired jobs fail rather than run late
}
```

Rules: payloads carry **IDs, not snapshots** (a stale snapshot executes against outdated state — fetch fresh at execution time); payloads never contain secrets or PII beyond identifiers; every handler is idempotent; every handler respects `ctx.Done()` so a rolling deploy drains cleanly. The existing execution worker already handles graceful shutdown correctly (finish the current task, stop taking new ones) — that pattern carries over.

## 11.3 Retry and failure

Exponential backoff with **full jitter**: `delay = rand(0, min(cap, base × 2^attempt))`. Jitter matters more than the curve — synchronized retries after a downstream recovery produce a thundering herd that re-breaks the thing that just recovered.

Classify before retrying:

| Class | Examples | Action |
|---|---|---|
| Transient | network, 5xx, timeout, deadlock (40P01), serialization failure (40001) | Retry with backoff |
| Rate-limited | 429 | Retry honoring `Retry-After`; open the circuit breaker |
| Permanent | validation, 404, permission denied, malformed payload | Fail immediately — do not burn 5 attempts on a certainty |
| Poison | repeated panics, deserialization failure | Straight to DLQ |

DLQ entries retain the full payload, all attempt errors, and the trace ID, and are replayable after a fix through an admin endpoint. DLQ depth > 0 pages, because a dead-lettered job means a user-visible promise was broken.

## 11.4 Worker scaling

KEDA scales on the queue-native signal rather than CPU:

```yaml
triggers:
  - type: postgresql
    metadata:
      query: "SELECT COALESCE(EXTRACT(EPOCH FROM now() - MIN(scheduled_at)), 0)
                FROM river_job WHERE state = 'available' AND queue = 'execution.tasks'"
      targetQueryValue: "30"     # scale up when the oldest job has waited 30s
```

**Oldest-job age, not queue depth, is the right signal.** Depth conflates a brief burst (harmless) with a stalled consumer (an incident); age directly measures the user-visible symptom.

Bounds: min 2 replicas (never zero for user-facing queues — cold start adds latency exactly when load arrives), max bounded by the database connection pool. Scale up fast (30 s), down slow (5 min stabilization) to avoid flapping. GPU workers for `ai.inference` scale on GPU queue depth with a longer cooldown, since node provisioning takes minutes.

## 11.5 Scheduler

**Infrastructure cron** — K8s `CronJob` with `concurrencyPolicy: Forbid` and `startingDeadlineSeconds`:

| Job | Schedule | Purpose |
|---|---|---|
| `cleanup-expired-tokens` | `*/15 * * * *` | Delete expired sessions, refresh tokens, OTPs, verification/reset tokens — **entirely missing today**, so these tables grow monotonically |
| `cleanup-pending-signups` | hourly | Remove unverified signups past their window (today's `sync.Map` leak) |
| `outbox-reconcile` | `*/5 * * * *` | Publish rows the relay missed |
| `email-reconcile` | hourly | Poll Resend for messages lacking a terminal webhook |
| `digest-hourly/daily/weekly` | per schedule | §7.5 |
| `partition-maintenance` | daily | Create next month's partitions, detach old |
| `backup-verify` | daily | Restore the latest backup into a scratch instance and assert row counts |
| `session-anomaly-scan` | hourly | Impossible travel, concurrent-geo sessions |
| `voice-audio-purge` | hourly | Delete raw enrollment audio past 24 h |
| `metrics-rollup` | `*/5 * * * *` | Materialized-view refresh for dashboards |

**Application-level scheduling** for user-scoped future work (reminders, scheduled voice actions): a `scheduled_jobs` table polled every 10 s with `FOR UPDATE SKIP LOCKED`, promoting due rows into River. This handles arbitrary per-user times, which cron cannot express, and survives restarts, which an in-process `time.Ticker` does not — and a ticker in a 3-replica deployment fires three times, which is how duplicate reminders happen.
