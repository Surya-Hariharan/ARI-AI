# Database Migration Plan

**Tool:** `golang-migrate` from Phase 1 onward. Every migration is a `NNN_name.up.sql` / `NNN_name.down.sql` pair, applied under an advisory lock, verified by checksum, and tested `up → down → up` in CI.

**Baseline:** existing `supabase/migrations/001–007` plus Phase 0's `008`, `009` are registered via `migrate force 9`. Numbering continues from 010.

**Governing rule:** every schema change follows **expand → backfill → dual-write → switch reads → contract**, with each step in a **separate deploy**. No migration is permitted to require downtime, and no migration ships in the same PR as the code that depends on it.

---

## Downtime-risk classification

Used in every table below.

| Class | Meaning | Postgres operations |
|---|---|---|
| **None** | Metadata-only, instant | `ADD COLUMN` with constant/no default, `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`, `ADD CONSTRAINT … NOT VALID`, `DROP INDEX CONCURRENTLY` |
| **Brief lock** | `ACCESS EXCLUSIVE` held briefly; safe with `lock_timeout` | `DROP COLUMN`, `RENAME`, `ALTER … SET DEFAULT`, `VALIDATE CONSTRAINT` (weaker lock) |
| **Rewrite** | Full table rewrite — **never permitted** on a hot table | `ALTER COLUMN TYPE` (most), `ADD COLUMN` with a volatile default on PG<11 |
| **Data** | Long-running writes; must be batched | Backfills, large `UPDATE`/`DELETE` |

Every migration sets `SET lock_timeout = '3s'; SET statement_timeout = '30s';` at the top so a migration that cannot acquire its lock fails fast instead of queueing behind a long query and blocking every subsequent request.

---

## Phase 0 migrations (already specified)

| # | Purpose | Risk | Rollback |
|---|---|---|---|
| **008** | `password_reset_tokens` table (T0.1) | None | `DROP TABLE` |
| **009** | `execution_logs`: add `user_id`, `device_id`, `metadata`, `created_at`; index `task_id` | None | Drop the added columns; the legacy `timestamp` column is untouched |

---

## Phase 1 migrations

| # | Purpose | Risk |
|---|---|---|
| **010** | `schema_migrations` baseline (tool-created) + `SET lock_timeout` convention documented in a template migration | None |

No schema change. Deliverable is the *process*, not the DDL.

---

## Phase 2 — Identity

### M011 · Credentials, sessions, refresh tokens

**Purpose:** move password material off `users`, replace `user_sessions` with a revocable session model.

```sql
-- up
CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  algo TEXT NOT NULL DEFAULT 'argon2id',
  params JSONB NOT NULL DEFAULT '{"m":65536,"t":3,"p":2}'::jsonb,
  must_change BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  amr TEXT[] NOT NULL DEFAULT '{}',
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX CONCURRENTLY idx_sessions_user_active
  ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  parent_id UUID REFERENCES refresh_tokens(id),
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX CONCURRENTLY idx_rt_family_active
  ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
```

**Data migration:** none in this step — `user_credentials` is populated by M012's backfill.
**Backward compatibility:** total. `users.password_hash` and `user_sessions` are untouched; existing code keeps working.
**Rollback:** `DROP TABLE refresh_tokens, sessions, user_credentials CASCADE;` — safe because nothing reads them yet.
**Downtime:** None. **Order:** before any Phase 2 code deploy.

### M012 · Backfill credentials

```sql
-- up (idempotent, re-runnable)
INSERT INTO user_credentials (user_id, password_hash, algo, params)
SELECT id, password_hash,
       CASE WHEN password_hash LIKE '$argon2id$%' THEN 'argon2id' ELSE 'bcrypt' END,
       '{}'::jsonb
FROM users
WHERE password_hash <> ''
ON CONFLICT (user_id) DO NOTHING;
```

**Note:** the existing `CheckPassword` already dispatches on the `$argon2id$` prefix with a bcrypt fallback, so both algorithms coexist correctly — the backfill just records which is which.
**Risk:** Data, but tiny at current scale. If the user count is large, batch by `id` ranges of 10k with a pause.
**Backward compatibility:** dual-source. Code reads `user_credentials` if present, falls back to `users.password_hash`.
**Rollback:** `TRUNCATE user_credentials;` — the source data is still in `users`.

### M013 · Verification and reset tokens; user status

```sql
-- up
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE users ADD CONSTRAINT users_status_chk
  CHECK (status IN ('pending_verification','active','suspended','deleted')) NOT VALID;

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email_hash BYTEA NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip INET,
  success BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX CONCURRENTLY idx_login_attempts_email_time
  ON login_attempts (email_hash, created_at DESC);
```

**Why `status` defaults to `'active'`:** existing rows are real users; defaulting to `pending_verification` would lock every current account out. New signups set `pending_verification` explicitly in code.
**Why `NOT VALID`:** adding a validated CHECK scans the whole table under a strong lock. `NOT VALID` is instant; `VALIDATE CONSTRAINT` runs later under a much weaker lock (M014).
**Backfill:** `UPDATE users SET email_normalized = lower(email) WHERE email_normalized IS NULL;` batched.
**Rollback:** drop the added columns and the two tables. `DROP COLUMN` is a brief lock — acceptable.

### M014 · Validate constraints, add unique index

```sql
-- up
ALTER TABLE users VALIDATE CONSTRAINT users_status_chk;
CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_normalized
  ON users (email_normalized) WHERE deleted_at IS NULL;
```

**Risk:** the unique index will **fail** if the backfill produced duplicates (e.g. `a.b@gmail.com` and `ab@gmail.com` both normalize to the same value). Run the duplicate-detection query in staging first:
```sql
SELECT email_normalized, count(*) FROM users
GROUP BY 1 HAVING count(*) > 1;
```
Resolve duplicates manually before running. This is the single most likely migration to fail in this plan; do not run it unattended.
**Rollback:** `DROP INDEX CONCURRENTLY`; `ALTER TABLE … ALTER CONSTRAINT` back to `NOT VALID` is not possible — drop and re-add as `NOT VALID`.

### M015 · Contract: drop legacy session/password columns

**Runs only after** the legacy token sunset (T2.8) and a full release of stability.

```sql
-- up
DROP TABLE user_sessions;
ALTER TABLE users DROP COLUMN password_hash;
DELETE FROM otp_codes WHERE type = 'forgot_password';  -- sentinel rows from the old flow
```

**Downtime:** brief lock on `users`.
**Rollback:** **not cleanly reversible** — this is the one irreversible migration in the plan. Preconditions: a verified backup taken immediately prior, PITR confirmed available, and ≥14 days since the sunset. The `.down.sql` recreates the structures but not the data, and says so in a comment.

---

## Phase 3 — Authorization

### M016 · RBAC tables

```sql
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id),
  scope_type TEXT NOT NULL DEFAULT 'global',
  scope_id UUID,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles
  (user_id, role_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

INSERT INTO roles (id, description) VALUES
  ('user','Standard user'), ('support','Read-only support'),
  ('admin','Administrator'), ('super_admin','Full administrative control')
ON CONFLICT DO NOTHING;
```

**Backfill:** `INSERT INTO user_roles (user_id, role_id) SELECT id, lower(role) FROM users …` — note the current `users.role` default is `'User'` with inconsistent casing, so normalize with `lower()` and map anything unrecognized to `'user'`, logging the exceptions.
**Contract (later):** `ALTER TABLE users DROP COLUMN role;` after the middleware reads exclusively from `user_roles`.

### M017 · Drop the non-functional RLS policies

```sql
-- up
DROP POLICY IF EXISTS "Users can only see their own goals" ON user_goals;
-- … the remaining eight …
ALTER TABLE user_goals DISABLE ROW LEVEL SECURITY;
-- … the remaining eight …
```

**Include this comment verbatim in the migration file**, because a future reader will otherwise read this as a security regression:

> These policies keyed on `auth.uid()` (Supabase GoTrue). ARI issues its own JWTs and connects as a privileged role, so `auth.uid()` was always NULL and every policy evaluated false for the app role — which then bypassed RLS regardless. They provided no protection while implying defense in depth. Access control is enforced in the repository layer (Phase 3, option A). See `docs/architecture/backend/02-authn-authz.md` §5.0.

**Rollback:** re-create the policies — trivially, since they never did anything.

### M018 · Least-privilege role + audit log

```sql
-- up
CREATE ROLE ari_app LOGIN PASSWORD :'ari_app_password' NOINHERIT;
GRANT CONNECT ON DATABASE postgres TO ari_app;
GRANT USAGE ON SCHEMA public TO ari_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ari_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ari_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ari_app;

CREATE TABLE audit_log (
  id BIGSERIAL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  ip INET,
  trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash BYTEA,
  row_hash BYTEA,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_log_2026_08 PARTITION OF audit_log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

REVOKE UPDATE, DELETE ON audit_log FROM ari_app;   -- append-only for the app
```

**Critical ordering note:** the `GRANT` must be applied and verified **before** the connection string switches to `ari_app`. Run a staging soak for a full sprint; a missing grant appears only when the un-exercised code path runs. Ship a `scripts/verify_grants.sql` that asserts `ari_app` can perform every operation the app performs, and run it in CI against the test container.
**Rollback:** revert `DATABASE_URL` to the previous role. Keep the old role for one release.

---

## Phase 4 — Durability

### M019 · Outbox

```sql
CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0
);
CREATE INDEX CONCURRENTLY idx_outbox_unpublished
  ON outbox_events (created_at) WHERE published_at IS NULL;
```

The partial index is essential: it stays small regardless of table size, because the hot set is only the unpublished rows.

### M020 · River schema
Applied by `river migrate-up` into its own tables. Keep River's migrations separate from the app's — they are versioned by the library and must not be hand-edited.

### M021 · Execution tasks and steps
Per blueprint §9.2. `execution_tasks` gets `idempotency_key TEXT UNIQUE`, `execution_steps` a composite PK on `(task_id, step_index)` plus a per-step `idempotency_key`.
**Data migration:** none — `execution_logs` history is not worth migrating; keep the old table read-only for 90 days, then drop.

### M022 · Email tables
`email_messages`, `email_suppressions`, `webhook_events` per §6.5. Partition `email_messages` by month from the start — it is append-heavy and retrofitting partitioning later requires a table rewrite.

### M023 · Contract: legacy execution columns
```sql
ALTER TABLE execution_logs DROP COLUMN timestamp;   -- superseded by created_at in M009
```
Runs only after the Phase 4 worker cutover is complete and the old worker is deleted.

### M024 · Cleanup-supporting indexes
Partial indexes on `expires_at` for `sessions`, `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens` so the cleanup crons (T4.9) do index scans rather than sequential scans on tables that will otherwise grow forever.

---

## Phase 7 — Scale (deferred)

| # | Purpose | Notes |
|---|---|---|
| M0xx | Partition `voice_events`, `interaction_logs` by month | Requires a rewrite — do it during a maintenance window, or use `pg_partman` with a live migration path |
| M0xx | Envelope encryption columns on `user_voice_profiles`; drop `users.voice_embedding` | Requires a re-encryption job; see the biometric key-rotation note in Phase 0 T0.8 |
| M0xx | `deleted_at` + soft-delete views across user-facing tables | |
| M0xx | Organization/team tables | Only when the org tier is built |

---

## Execution order summary

```
008 → 009 │ Phase 0, already applied
010       │ Phase 1 baseline
011 → 012 → 013 → 014 │ Phase 2 expand + backfill + validate
          … legacy sunset (code) …
015       │ Phase 2 CONTRACT (irreversible — backup first)
016 → 017 → 018 │ Phase 3
019 → 020 → 021 → 022 │ Phase 4 expand
023 → 024 │ Phase 4 contract + indexes
```

## Migration rules (enforced in CI)

1. Every `.up.sql` has a `.down.sql`. Irreversible ones say so explicitly in a comment and require a documented backup precondition.
2. CI runs `up → down → up` against a clean container for every migration on every PR.
3. `lock_timeout` and `statement_timeout` are set at the top of every migration.
4. Backfills are batched, resumable, and never inside the DDL migration.
5. No migration ships in the same PR as the code that depends on it.
6. `CREATE INDEX` is always `CONCURRENTLY` (and therefore outside a transaction — `golang-migrate` needs the `-- +migrate NoTransaction` equivalent flag for those files).
7. Constraints are added `NOT VALID` then validated separately.
8. Drops happen at least one full release after the last reader is removed.
