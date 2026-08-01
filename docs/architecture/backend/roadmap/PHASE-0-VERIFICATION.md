# Phase 0 — Verification Record

Branch `phase0-security-lockdown`, implemented 2026-08-01 against `84944a6`.
Task definitions: [`02-phase-0-p0-security.md`](02-phase-0-p0-security.md).

---

## Status

| Task | Status | Notes |
|---|---|---|
| T0.1 Password reset rewrite | ✅ Done | Backend + frontend |
| T0.2 Goal ownership predicates | ✅ Done | Sweep found goals were the only instance |
| T0.3 Execution endpoints secured | ✅ Done | Status authenticated + owner-scoped; mock WS deleted |
| T0.4 Agent service auth | ✅ Done | Token + host ports unpublished |
| T0.5 CORS allowlist | ✅ Done | Fails closed in production |
| T0.6 `execution_logs` fix | ✅ Done | Migration 009 + worker insert corrected |
| T0.7 Log redaction | ✅ Done | Console email fallback gated + body never logged |
| **T0.8 Secret rotation** | ⛔ **Not done — requires you** | See "Outstanding" below |
| T0.9 Auth rate limiting | ✅ Done | Redis-backed, per-account |
| T0.10 Production compose | ✅ Done | `docker-compose.prod.yml` |

Also fixed opportunistically: `GenerateOTP` off-by-one (S-22, `rand.Int` bound was 999999 so `999999` was unreachable), OTP comparison now constant-time (part of S-8), and the silently-discarded `interaction_logs` error (R-14, partial).

---

## Build verification

```
backend/gateway     go build ./... && go vet ./...   OK
backend/execution   go build ./... && go vet ./...   OK
backend/agent       py_compile main.py               OK   (via python:3.11-slim; no local interpreter)
frontend            npm run build                    OK   (2167 modules)
docker-compose.yml       config -q                   OK
docker-compose.prod.yml  config -q                   OK
```

Note: the frontend has **no TypeScript compiler installed** (`vite build` uses esbuild, which strips types without checking). Type errors in the changed files are therefore unverified — `npm i -D typescript && tsc --noEmit` is part of T1.3.

---

## Manual verification steps

Not yet executed — there is no test harness until Phase 1, and no running deployment against which to run these. Run each after bringing up the stack, and record the result.

### T0.1 Password reset

```bash
# 1. No credential in the response, and no account state change
curl -si -X POST localhost:8080/api/auth/forgot-password \
     -H 'Content-Type: application/json' -d '{"email":"you@gmail.com"}'
#    EXPECT 202, body {"status":"sent","message":"If an account with that email exists..."}
#    EXPECT no "new_password" field anywhere
#    EXPECT the old password still works at /api/auth/login

# 2. Unknown address is indistinguishable
curl -si -X POST localhost:8080/api/auth/forgot-password \
     -H 'Content-Type: application/json' -d '{"email":"nobody@gmail.com"}'
#    EXPECT byte-identical body and status to step 1

# 3. Link works exactly once
curl -si -X POST localhost:8080/api/auth/reset-password \
     -H 'Content-Type: application/json' \
     -d '{"token":"<from email>","new_password":"newpassword123"}'
#    EXPECT 200 first time; 400 on replay

# 4. Expiry — set expires_at into the past, then replay
psql "$DATABASE_URL" -c "UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE used_at IS NULL"
#    EXPECT 400 "invalid or has expired"

# 5. Throttle
for i in $(seq 1 4); do curl -s -o /dev/null -w "%{http_code} " -X POST \
  localhost:8080/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"you@gmail.com"}'; done
#    EXPECT 202 202 202 429
```

### T0.2 Goal ownership (BOLA)

```bash
# As user A: create a goal, note its id.
# As user B:
curl -si -X PUT    localhost:8080/api/user/goals/<A_GOAL_ID> \
     -H "Authorization: Bearer $B_TOKEN" -H 'Content-Type: application/json' -d '{"status":"completed"}'
curl -si -X DELETE localhost:8080/api/user/goals/<A_GOAL_ID> -H "Authorization: Bearer $B_TOKEN"
#    EXPECT 404 from both (NOT 403 — a 403 confirms existence)
#    EXPECT A's row unchanged and still present
```

### T0.3 Execution endpoints

```bash
curl -si localhost:8080/execution/status/$(uuidgen)          # EXPECT 401
curl -si localhost:8080/execution/status/<OTHER_USERS_TASK> \
     -H "Authorization: Bearer $TOKEN"                        # EXPECT 404
curl -si localhost:8080/execution/stream                      # EXPECT 404 (route deleted)
```

### T0.4 Agent isolation

```bash
curl -si --max-time 3 localhost:8000/voice/enroll             # EXPECT connection refused
docker compose exec gateway wget -qO- http://agent:8000/health              # EXPECT 200 (probe exempt)
docker compose exec gateway wget -qO- http://agent:8000/voice/wake/info     # EXPECT 401
docker compose exec gateway wget -qO- --header="X-ARI-Service-Token: $ARI_SERVICE_TOKEN" \
  http://agent:8000/voice/wake/info                                          # EXPECT 200
```

### T0.5 CORS

```bash
curl -si -X OPTIONS localhost:8080/api/auth/login \
     -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
#    EXPECT no Access-Control-Allow-Origin header
# And: ENV=production with ALLOWED_ORIGINS unset must refuse to start.
```

### T0.6 Execution logging

```bash
# Apply migrations 008 and 009 first, then submit a voice command.
psql "$DATABASE_URL" -c "SELECT task_id,user_id,status,created_at FROM execution_logs ORDER BY created_at DESC LIMIT 5"
#    EXPECT rows for 'executing' and a terminal status — this table has always been empty
curl -s localhost:8080/execution/status/<TASK_ID> -H "Authorization: Bearer $TOKEN"
#    EXPECT a real status (this endpoint has never returned one)
```

### T0.7 / T0.9

```bash
# With ENV=production and no RESEND_API_KEY/SMTP_HOST: signup must error, and no
# email body or OTP may appear in `docker compose logs gateway`.
# Six wrong OTP submissions: the sixth returns 429 and the pending signup is destroyed.
```

---

## Outstanding — requires action from you

**T0.8 — rotate every credential ever committed to git. Not something I can do.**

Removing `.env` from the working tree did not revoke anything: the values remain in git history and in every clone or fork. Until rotated, they are live credentials.

Rotate: Supabase service-role key, Supabase anon key, database password, `JWT_SECRET`, `RESEND_API_KEY`, `VOICE_EMBEDDING_KEY`, and any OAuth client secrets.

Two consequences to plan for:
1. **Rotating `JWT_SECRET` logs out every user.** Bundle it with the T0.1 deploy so people re-authenticate once rather than twice.
2. **Rotating `VOICE_EMBEDDING_KEY` makes existing voiceprints undecryptable.** Either write a re-encryption pass (decrypt with old, encrypt with new, one transaction per user) or delete the enrollments and ask users to re-enrol. Given the key was exposed, deleting is the more defensible option — and note there is a second copy of this data in `users.voice_embedding` that the Phase 3 work consolidates.

Also add `gitleaks` as a pre-commit hook now; the CI gate arrives in T1.3.

---

## Migrations to apply

`008_password_reset_tokens.sql` and `009_execution_logs_fix.sql`, in that order, **before** deploying the code. Both are additive and reversible:

```sql
-- rollback 008
DROP TABLE IF EXISTS password_reset_tokens;
-- rollback 009
ALTER TABLE execution_logs
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS device_id,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS created_at;
```

When `golang-migrate` is introduced in T1.1, baseline these as applied (`migrate force 9`) rather than re-running them.

---

## Deploy order

1. Apply migrations 008, 009.
2. Set new env vars everywhere: `ENV`, `ALLOWED_ORIGINS`, `APP_BASE_URL`, `ARI_SERVICE_TOKEN`. Gateway and agent both **fail to start** in production without them — deliberate, but it means a missing variable is a failed deploy rather than a silent security hole.
3. Deploy backend (gateway, agent, execution together — the service token is required on both sides).
4. Deploy frontend.
5. Rotate secrets (T0.8).

Backend before frontend is deliberate: the backend keeps returning the old `status`/`message` fields (minus `new_password`), so the current SPA degrades to "check your email" rather than breaking.

---

## Known gaps carried into Phase 1+

These are **not** regressions — they are the audit findings Phase 0 was never scoped to fix, restated so they are not mistaken for done.

- **S-4/S-5** — no token revocation; session tokens still stored as plaintext JWTs in `user_sessions`. The session wipe in the reset handler still only affects callers that read that table, which `AuthRequired()` does not. A stolen JWT survives a password reset for up to 30 days. *Phase 2.*
- **S-7** — the nine `auth.uid()` RLS policies remain non-functional. *Phase 3.*
- **S-11** — tokens still in `localStorage`. *Phase 2.*
- **S-12** — `VOICE_EMBEDDING_KEY` still passed as a SQL parameter. *Phase 3.*
- **R-4** — `pendingSignups` is still an unswept in-process `sync.Map`; the OTP attempt cap is now in Redis, but the pending record is not, so signup still breaks with more than one gateway replica. *Phase 2.*
- **R-2/R-3** — the queue is still at-most-once and email is still fire-and-forget. The reset email specifically can be lost with no retry; the token is committed first, so the recovery path is "request another link." *Phase 4.*
- **No tests.** Every verification above is manual. *Phase 1.*
