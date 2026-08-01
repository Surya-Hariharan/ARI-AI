# Phase 0 — P0 Security Lockdown

**Objective:** eliminate every finding that an unauthenticated or low-privilege attacker can exploit today.
**Effort:** 8 ed · **Duration:** 1 sprint (3 eng) / 2 weeks (solo)
**Gate:** nothing in Phase 1+ starts until every task here is verified.

---

## Why this phase comes first — and why nothing else does

Phase 0 contains no architecture. Every task is a small, surgical, mostly-mechanical change. That is exactly why it goes first: it is the highest security value per engineer-day available anywhere in this roadmap, and it requires none of the tooling that Phase 1 builds.

The specific argument for each class:

| Class | Why it cannot wait behind tooling, tests, or refactors |
|---|---|
| **Password reset** | `POST /api/auth/forgot-password` with a known email returns working credentials for that account. There is no authentication, no rate limit that matters (20/min/IP, per-replica), and no audit trail. Every hour this is deployed is an hour any account is takeable. This is not a "high severity finding"; it is a public account-takeover API. |
| **Authorization** | `handleUpdateGoal`/`handleDeleteGoal` let any authenticated user destroy any other user's data. The blast radius grows with every user added, and the damage is *not recoverable* — there are no soft deletes and no audit log to reconstruct from. Fixing it later means fixing it after data is already gone. |
| **Agent authentication** | The agent exposes biometric enrollment, biometric deletion, arbitrary tool execution, and RAG ingestion with zero authentication, on a host-published port. RAG ingestion is the subtle one: a poisoned document is persistent prompt injection into every future answer, and it is invisible in the request logs afterwards. |
| **Public endpoints** | `/execution/status/:task_id` and the WebSocket leak task state and burn resources with no principal attached. |
| **Secrets** | Credentials in git history remain valid in every clone and every fork until rotated. Deleting the file did not revoke anything. The OTP-to-stdout fallback turns any log-read access into account takeover. |
| **CORS / rate limiting / DB privileges / RLS** | These are defense-in-depth layers. They are in Phase 0 only where the fix is hours, not days — the rest is deliberately deferred to Phases 1–3 rather than half-done here. |

**What is deliberately NOT in Phase 0**, despite being security work: JWT redesign, refresh tokens, session management, MFA, full RBAC, real RLS, Redis rate limiting. Each of those is a multi-week rewrite that needs a test harness. Attempting them now, untested, is how you introduce a worse bug than the one you fixed. Phase 0 buys time for Phases 2–3 to be done properly.

---

## Task list

Effort in engineer-days. `[V]` = validation step. Each task ships as its own PR.

---

### T0.1 · Rewrite password reset — 2.0 ed · **CRITICAL**

**Files:** `backend/gateway/auth.go`, `backend/gateway/auth_helpers.go`, new migration `008_password_reset_tokens.sql`, `frontend/src/app/pages/AuthPage.tsx`

**Change:**
1. New table (this one migration is acceptable ahead of `golang-migrate` because it is additive-only and self-contained):
```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  BYTEA NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_ip  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_user_active
  ON password_reset_tokens (user_id) WHERE used_at IS NULL;
```
2. `handleForgotPassword` becomes: look up user → if found, generate 32 random bytes, store `sha256`, expire in 30 min, send an email containing **only a link** → return `202` with a fixed body **in all cases**. Delete the password rotation, the `otp_codes` sentinel insert, the session deletion, and above all the `new_password` response field.
3. New `POST /api/auth/reset-password {token, new_password}`: look up by hash, reject used/expired, update credential, mark used, delete all `user_sessions` rows for the user.
4. Replace `ForgotPasswordEmailBody(newPassword)` with `PasswordResetEmailBody(link)`.
5. Remove the `requires_password_update` logic from `handleLogin` and the `otp_codes` query it performs on every login.
6. Frontend: replace the "copy your new password" UI with "check your email" plus a reset-token page.

**Breaking change:** yes — the response shape of `/api/auth/forgot-password` changes and `new_password` disappears. Coordinated frontend deploy required; ship backend first (it stays backward-compatible for one deploy by returning the old `status`/`message` fields, minus `new_password`).

**Rollback:** revert both PRs; the table is additive and can stay.

**[V]** `curl -X POST /api/auth/forgot-password -d '{"email":"<test>"}'` returns `202` with no password field; the account's password is unchanged; the emailed link works exactly once; a second use returns 400; a 31-minute-old token returns 400.

---

### T0.2 · Ownership predicates on goals — 0.5 ed · **CRITICAL**

**Files:** `backend/gateway/user_handlers.go`

```go
func handleUpdateGoal(c *fiber.Ctx) error {
    userID := c.Locals("userID").(string)
    goalID := c.Params("id")
    // ... parse body, validate status against an allowlist
    tag, err := DB.Exec(c.Context(),
        `UPDATE user_goals SET status=$1 WHERE id=$2 AND user_id=$3`,
        req.Status, goalID, userID)
    if err != nil { return c.Status(500).JSON(...) }
    if tag.RowsAffected() == 0 {
        return c.Status(404).JSON(fiber.Map{"error": "Goal not found"})  // never 403
    }
    return c.JSON(fiber.Map{"status": "success"})
}
```

Same for `handleDeleteGoal`. Also audit every other handler for the same pattern — `handleToggleIntegration` and `handleUpdatePreference` already scope by `user_id`, so goals are the only current instance, but the sweep must be done and recorded.

Add `status` validation against `('active','completed','abandoned')` — the DB CHECK will reject others, but with a 500 rather than a 400.

**Breaking change:** none. **Rollback:** revert.

**[V]** Integration test: user A creates a goal; user B's `PUT`/`DELETE` with A's goal ID returns 404 and the row is unchanged. This test is the seed of the Phase 3 authz matrix.

---

### T0.3 · Authenticate execution endpoints — 0.5 ed · **HIGH**

**Files:** `backend/gateway/main.go`

- `/execution/status/:task_id` → add `AuthRequired()` and scope the query by owner. The current `execution_logs` table has no `user_id`; until T0.6 adds one, join through `interaction_logs` or (simpler and preferred) defer the ownership scope to T0.6 and ship auth-only now, tracked as a follow-up in the same sprint.
- `/execution/stream` → **delete it.** It is a mock that echoes `{"status":"executing","task_id":"simulated"}` to any unauthenticated connection. Deleting removes an unauthenticated resource-consumption vector at zero product cost; the real SSE endpoint arrives in Phase 4. Remove the `websocket.IsWebSocketUpgrade` middleware and the `gofiber/websocket` dependency along with it.

**Breaking change:** yes if any client uses the stream. Grep says the frontend does not consume it.

**[V]** Unauthenticated `GET /execution/status/<uuid>` returns 401; `GET /execution/stream` returns 404.

---

### T0.4 · Agent service authentication + port lockdown — 1.0 ed · **CRITICAL**

**Files:** `backend/agent/main.py`, `backend/gateway/main.go`, `backend/gateway/voice_handlers.go`, `backend/execution/main.go`, `docker-compose.yml`, `.env.example`

1. FastAPI dependency verifying `X-ARI-Service-Token` against `ARI_SERVICE_TOKEN` with `hmac.compare_digest`, applied to **every** route except `/health`, `/live`, `/ready`. Apply it as a router-level dependency, not per-endpoint, so a new endpoint is authenticated by default:
```python
app = FastAPI(title="ARI Agent Service", lifespan=app_lifespan,
              dependencies=[Depends(require_service_token)])
```
Then exempt the three probes explicitly. Fail closed at startup if `ARI_SERVICE_TOKEN` is unset in a non-dev environment — extend the existing `_validate_startup_security_config()`, which already does exactly this pattern for encryption keys.
2. Gateway and execution worker send the header on every agent call (3 call sites in `voice_handlers.go`, 1 in `main.go`, 1 in `execution/main.go`).
3. `docker-compose.yml`: delete the `ports:` blocks for `agent` (8000) and `execution` (9090). They are reachable on the compose network by service name; publishing them to the host is what makes them internet-reachable on a server.

**Breaking change:** any direct developer access to `localhost:8000` — document `docker compose exec` as the replacement.

**Rollback:** revert; the token check is a single dependency.

**[V]** `curl localhost:8000/voice/enroll` fails to connect; from inside the network, a call without the header returns 401; with the header, 200.

---

### T0.5 · CORS allowlist — 0.25 ed · **HIGH**

**Files:** `backend/gateway/main.go`, `.env.example`

```go
origins := os.Getenv("ALLOWED_ORIGINS")   // "https://app.ari.example,http://localhost:5173"
if origins == "" {
    log.Fatal("FATAL: ALLOWED_ORIGINS is required")   // fail closed, matching getJWTSecret()
}
app.Use(cors.New(cors.Config{
    AllowOrigins:  origins,
    AllowHeaders:  "Origin,Content-Type,Accept,Authorization,X-Device-ID,X-Request-Id",
    ExposeHeaders: "X-Request-Id",
    AllowMethods:  "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    MaxAge:        600,
}))
```

Do **not** set `AllowCredentials: true` yet — it arrives with the refresh cookie in Phase 2, and enabling it now with a misconfigured list is worse than the wildcard.

**[V]** Preflight from an unlisted origin omits `Access-Control-Allow-Origin`; the SPA still works.

---

### T0.6 · Fix `execution_logs` schema/code mismatch — 1.0 ed · **HIGH**

**Files:** new migration `009_execution_logs_fix.sql`, `backend/execution/main.go`

The worker inserts `(id, task_id, device_id, status, metadata, created_at)`; the table has `(id, task_id, status, output, timestamp)`. Every insert has always failed.

```sql
ALTER TABLE execution_logs
  ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS device_id  TEXT,
  ADD COLUMN IF NOT EXISTS metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_execution_logs_task ON execution_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_user ON execution_logs (user_id, created_at DESC);
```

Keep the legacy `timestamp` column for now (it has a default and nothing reads it); drop it in the Phase 4 contract step. Add `user_id` to the task payload the gateway pushes so the worker can populate it — this is what makes T0.3's ownership scope possible.

**Downtime risk:** none. `ADD COLUMN` with a constant default is metadata-only in Postgres 11+. `CREATE INDEX` should be `CONCURRENTLY` if the table has grown — it has not, since no insert has ever succeeded.

**[V]** Submit a voice command; `SELECT * FROM execution_logs WHERE task_id=…` returns rows for `executing` and a terminal state; `/execution/status/:task_id` returns a real status instead of 404.

---

### T0.7 · Log redaction and dev-only email fallback — 0.5 ed · **HIGH**

**Files:** `backend/gateway/auth_helpers.go`, `backend/gateway/auth.go`

1. Gate the console fallback:
```go
if os.Getenv("ENV") == "production" {
    return fmt.Errorf("no email delivery backend configured")  // fail, do not print
}
log.Printf("=== EMAIL (dev only) === To: %s Subject: %s", to, subject)  // no body
```
Even in dev, stop printing the body — print the OTP as a distinct, clearly-labelled dev line if convenient, but never the full HTML.
2. Remove the OTP and expiry from `log.Printf("Pending signup stored for %s (OTP expires %s)…")`.
3. Grep for and remove any other logging of `otp`, `token`, `password`, `code`.

**[V]** `ENV=production` with no `RESEND_API_KEY` and no SMTP: signup returns an error and no OTP appears in stdout. `grep -riE 'log.*(otp|password|token)' backend/` returns nothing.

---

### T0.8 · Rotate all previously-committed secrets — 0.5 ed · **HIGH**

**Not a code change — an operations task, and the one most likely to be skipped.**

1. Rotate: Supabase service-role key, Supabase anon key, database password, `JWT_SECRET`, `RESEND_API_KEY`, `VOICE_EMBEDDING_KEY`, any OAuth client secrets.
2. Rotating `JWT_SECRET` invalidates every outstanding token — every user is logged out. **`[SKIP-IF-GREENFIELD]`** otherwise: schedule it, announce it, and do it alongside T0.1 so users re-authenticate once, not twice.
3. Rotating `VOICE_EMBEDDING_KEY` is the hard one: existing voiceprints are encrypted under the old key. Write a one-off re-encryption script (decrypt with old, encrypt with new, in one transaction per user) or, if enrollment counts are trivial, delete the voiceprints and ask users to re-enroll — which is also the more privacy-respectful option given the key was exposed.
4. Add `gitleaks` as a pre-commit hook now; the CI gate lands in T1.3.

**[V]** Old keys rejected by the respective providers. `gitleaks detect --no-git` on the working tree is clean.

---

### T0.9 · Per-account auth rate limiting — 1.0 ed · **HIGH**

**Files:** `backend/gateway/main.go`, new `backend/gateway/ratelimit.go`

Full Redis sliding-window rate limiting is Phase 1 work, but the *account-scoped* limit on the reset and OTP paths cannot wait, because T0.1's reset endpoint is a new email-sending primitive and the OTP verify path has no attempt cap at all.

Minimum viable version using the Redis client already in `main.go`:
```go
func limitPerKey(key string, max int64, window time.Duration) (bool, error) {
    n, err := redisClient.Incr(ctx, key).Result()
    if err != nil { return false, err }        // fail OPEN on Redis error for login,
    if n == 1 { redisClient.Expire(ctx, key, window) }  // fail CLOSED for reset/OTP
    return n <= max, nil
}
```
Apply: `forgot-password` 3/hour/account + 10/hour/IP; `verify-otp` 5 attempts/email then delete the pending signup; `login` 5/15min/account.

Note the deliberate asymmetry in failure mode: if Redis is down, login should still work (availability), but password reset and OTP verification should not (security). Document the choice in the code.

**[V]** Six OTP attempts: the sixth returns 400 and the pending signup is gone. Four reset requests in an hour: the fourth returns 429.

---

### T0.10 · Production compose hardening — 0.75 ed · **MEDIUM**

**Files:** new `docker-compose.prod.yml`

The existing compose file is a good dev environment and must stay as-is. Add a separate production file: no bind mounts, no `air`/`--reload`, images built from pinned tags, no published ports except the gateway, resource limits, `restart: unless-stopped`, Redis with `requirepass` and AOF, and env from a secrets file rather than a committed `.env`.

This is not the Kubernetes target (Phase 5) — it is the honest interim so that "deploy to a server" does not mean "deploy the dev loop."

**[V]** `docker compose -f docker-compose.prod.yml config` validates; only 8080 is published; `docker inspect` shows no source bind mounts.

---

## Phase 0 summary

| Task | Effort | Severity | Breaking | Blocks |
|---|---:|---|---|---|
| T0.1 password reset | 2.0 | Critical | Yes (FE) | — |
| T0.2 goal ownership | 0.5 | Critical | No | — |
| T0.3 execution endpoints | 0.5 | High | Minor | T0.6 for ownership |
| T0.4 agent auth | 1.0 | Critical | Dev workflow | — |
| T0.5 CORS | 0.25 | High | No | — |
| T0.6 execution_logs | 1.0 | High | No | — |
| T0.7 log redaction | 0.5 | High | No | — |
| T0.8 secret rotation | 0.5 | High | Yes (logout) | — |
| T0.9 auth rate limits | 1.0 | High | No | — |
| T0.10 prod compose | 0.75 | Medium | No | — |
| **Total** | **8.0** | | | |

### Security impact

Findings closed: **S-1, S-2, S-3, S-6, S-9, S-10, S-23, R-1**, and partially **S-8** (attempt cap added; hashing and constant-time compare land in Phase 2) and **R-5** (auth paths only; general limiter in Phase 1).

Findings explicitly still open after Phase 0, and why: **S-4/S-5** (no revocation, plaintext session tokens) need the Phase 2 rewrite; **S-7** (RLS) needs the Phase 3 decision; **S-11** (`localStorage`) needs the Phase 2 cookie flow; **S-12** (voiceprint key handling) needs envelope encryption in Phase 3; **S-13/S-14** (MFA/OAuth, scanning) are Phase 1/6.

### Testing requirements

Phase 0 predates the test harness, so validation is manual-plus-minimal:
- A written verification script per task (the `[V]` steps above), executed and recorded.
- Three integration tests written by hand against a local compose stack — reset flow, goal BOLA, agent token — carried forward into the Phase 1 suite as its first cases.
- One manual attempt to reproduce each of S-1, S-2, S-3, S-6 after deploy, documented with the request and response.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| T0.1 frontend/backend deploy skew leaves reset broken | Medium | High | Ship backend first, keep old response fields (minus `new_password`) for one deploy |
| Secret rotation logs everyone out mid-session | High if live | Medium | Announce; combine with T0.1; `[SKIP-IF-GREENFIELD]` |
| Voiceprint key rotation corrupts embeddings | Medium | High | Re-encryption script tested on a copy first; prefer delete-and-re-enroll |
| Agent token breaks a developer's local flow | High | Low | Document `docker compose exec`; default dev token in `.env.example` |
| T0.6 migration conflicts with a later `golang-migrate` baseline | Medium | Low | Record 008/009 as already-applied when baselining in T1.1 |

### Success criteria

1. All ten `[V]` checks pass and are recorded.
2. Manual reproduction of S-1, S-2, S-3, S-6 fails.
3. No secret appears in `gitleaks` output or in application logs.
4. Agent and execution ports are unreachable from outside the compose network.
5. `/execution/status/:task_id` returns real data for a real task — the first time this has ever worked.
6. Readiness score re-assessed: **26% → 38%**.
