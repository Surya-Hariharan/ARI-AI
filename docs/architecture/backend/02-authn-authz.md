# §4–§5 Authentication & Authorization

---

# §4 Authentication Architecture

## 4.0 The core model change

Today: **the JWT *is* the session.** A 30-day HS256 token is minted at login, a copy is stored raw in `user_sessions`, and `AuthRequired()` checks only the signature. The session table is written but never read on the auth path, which is why revocation does not work.

Target: **the session is the truth; the access token is a short-lived, cacheable assertion about it.**

```
credentials ──▶ Identity Service ──▶ session (server-side, revocable)
                                       ├─▶ access token   JWT, 10 min, stateless verify
                                       └─▶ refresh token  opaque 256-bit, 30 d, rotating
```

Why this split rather than long-lived JWTs (current) or pure server-side sessions:

| Option | Revocation latency | Verify cost | Verdict |
|---|---|---|---|
| Long-lived JWT (today) | **Up to 30 days — effectively none** | Free | Unacceptable. A stolen token is valid for a month and `logout` is theatre. |
| Pure server-side sessions | Instant | A Redis/DB hit per request | Correct but couples every request to session-store availability. |
| **Short access + rotating refresh + deny-list** | ≤10 min (0 for high-risk, via deny-list) | Free in the common case; one Redis `SISMEMBER` on the deny-list | **Chosen.** Bounded exposure, stateless hot path, instant revocation where it matters. |

## 4.1 Token specification

**Access token** — JWT, 10 minutes.

```json
{
  "iss": "https://auth.ari.example",
  "sub": "usr_01J...",            // user id
  "aud": ["ari-api"],             // rejected by any service it isn't addressed to
  "sid": "ses_01J...",            // session id — the deny-list key
  "jti": "tok_01J...",            // unique; enables single-token revocation
  "iat": 1..., "exp": 1..., "nbf": 1...,
  "scp": ["voice:invoke","profile:write"],
  "roles": ["user"],
  "amr": ["pwd","otp"],           // how they authenticated — gates step-up
  "dev": "dev_01J...",            // device binding
  "vpv": true                     // voiceprint verified this session
}
```

Signing: **EdDSA (Ed25519) with asymmetric keys and a published JWKS.** HS256 (current) means every service that verifies a token can also *mint* one — with a shared `JWT_SECRET` in every container's env, a compromise anywhere is a compromise everywhere. Asymmetric signing keeps the private key inside Identity alone. Key rotation: two active keys, `kid` in the header, new key introduced 24 h before use, old key retained for 2× max token lifetime.

Mandatory validation on every verify: signature, `exp`, `nbf`, `iss`, **`aud`**, `alg` allowlist. The current `ValidateJWT` correctly rejects non-HMAC algorithms (guarding the classic `alg: none`/RS→HS confusion) but checks neither `aud` nor `iss`, so a token minted for any purpose works everywhere.

**Refresh token** — opaque, 32 random bytes, base64url. Never a JWT (JWTs cannot be revoked without a store, which defeats the purpose). Stored as **SHA-256 hash only**; a database dump must not yield usable sessions. Contrast with today's `user_sessions.token`, which stores the live bearer token in plaintext.

```sql
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL,                 -- rotation lineage
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    BYTEA NOT NULL UNIQUE,         -- sha256(token)
  parent_id     UUID REFERENCES refresh_tokens(id),
  used_at       TIMESTAMPTZ,                   -- non-null ⇒ already rotated
  revoked_at    TIMESTAMPTZ,
  revoked_reason TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_ip    INET,
  created_ua    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
```

## 4.2 Rotation and reuse detection

Every refresh consumes the presented token and issues a new one in the same family, inside one transaction:

```sql
BEGIN;
SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE;   -- serializes concurrent tabs
-- if not found                      → 401, log AuthAnomaly
-- if revoked_at IS NOT NULL         → 401
-- if used_at IS NOT NULL            → REUSE: revoke the entire family, emit
--                                     RefreshTokenReuseDetected, page on-call
-- if expires_at < now()             → 401
UPDATE refresh_tokens SET used_at = now() WHERE id = $2;
INSERT INTO refresh_tokens (family_id, parent_id, ...) VALUES (...);
COMMIT;
```

Reuse detection is the entire point: a token can be *presented* twice only if it was copied. When that happens the correct response is to kill the whole family and force re-authentication, accepting a false positive from a flaky network over a silent account compromise. The `FOR UPDATE` is what prevents two browser tabs racing into a false reuse alarm.

**Remember Me.** Off → refresh TTL 12 h, no sliding window. On → 30 d with a sliding window capped at 90 d absolute. Absolute caps matter: without them a stolen refresh token is immortal.

## 4.3 Revocation

Three levels:

1. **Session revoke** (`logout`) — mark `sessions.revoked_at`, revoke the refresh family, add `sid` to Redis `denylist:sid:{sid}` with TTL = access-token lifetime (10 min). Cost of the deny-list is one Redis set membership check per request, bounded in size because entries expire with the tokens they describe.
2. **User revoke** (`logout-all`, password change, reset, MFA change, role change) — revoke all sessions, add `denylist:user:{user_id}` with a `not_before` timestamp; any token with `iat` before it is rejected.
3. **Global revoke** (key compromise) — rotate the signing key; all outstanding tokens die at once.

This is the fix for the current no-op: `handleRevokeSession` deletes rows nobody reads.

## 4.4 Registration

```
POST /v1/auth/register {email, password, full_name}
  ├─ validate: RFC-5322 email, password ≥12 chars checked against the top-100k
  │  breached-password list (length + breach-check beats composition rules —
  │  NIST SP 800-63B; the current 8-char minimum is below the modern floor)
  ├─ normalize email (lowercase, strip Gmail dots/plus-tags for the uniqueness key
  │  while storing the original for display — otherwise a+1@ and a+2@ are two accounts)
  ├─ Argon2id hash  (m=64MiB, t=3, p=2 — keep exactly as implemented today)
  ├─ TRANSACTION:
  │     INSERT users (status='pending_verification')
  │     INSERT email_verification_tokens (token_hash, expires_at = now()+24h)
  │     INSERT outbox   (UserRegistered)
  │  COMMIT
  └─ 202 {"status":"verification_sent"}   ← identical response whether or not the
                                             email already exists
```

**Two changes from today's flow.**

*First, no in-memory pending state.* `pendingSignups sync.Map` ([`auth.go:29`](../../../backend/gateway/auth.go#L29)) is per-process: with two replicas behind a load balancer, verification fails whenever the OTP POST lands on a different pod than the signup POST. It is also never swept, so every abandoned signup leaks a `PendingSignup` (email, phone, name, password hash) into RSS for the process lifetime. The row goes in Postgres with a `pending_verification` status and a cleanup cron.

*Second, no enumeration.* Today signup returns `409 "An account with this email already exists"`. That is a free account-existence oracle, and it is inconsistent with the forgot-password handler, which gets this right. If the address is already registered, still return `202` — and send the *existing* user a "someone tried to register with your address" email instead.

**Domain allowlist.** `allowedEmailDomains = {@gmail.com, @outlook.com}` ([`auth.go:33`](../../../backend/gateway/auth.go#L33)) blocks every corporate and self-hosted address. If it exists as anti-abuse, replace it with a disposable-domain *blocklist* plus rate limiting; if it is a deliberate product choice, keep it but make it configuration rather than a compiled-in constant.

## 4.5 Email verification (OTP)

Move to Redis, hashed, with attempt limits:

```
Key:   otp:signup:{email_hash}
Value: {code_hash: sha256(code+pepper), attempts: 0, created_at, user_id}
TTL:   600s
```

- 6-digit code from `crypto/rand` — the current `GenerateOTP` is *almost* right but calls `rand.Int(reader, big.NewInt(999999))`, which yields `[0, 999998]` and can never produce `999999`. Use `big.NewInt(1000000)`.
- **Constant-time comparison.** Today: `if pending.OTP != req.Code` — a plain string compare that leaks a timing signal.
- **5 attempts, then the code is destroyed** and a fresh signup is required. Today there is no per-code attempt counter at all; the only limit is 20 req/min/IP on the whole auth group, which a distributed attacker walks straight through, and which is in any case a *per-replica in-memory* limit.
- Resend: max 3 per address per hour, 60 s minimum interval.
- Verification consumes the code atomically (Lua `GETDEL`-and-check) so two concurrent submissions cannot both succeed.

## 4.6 Login

```
POST /v1/auth/login {email, password, device_id?}
  ├─ check lockout: Redis lockout:{user_id}  → 423 with Retry-After
  ├─ fetch credential; if the user does not exist, still run a dummy Argon2id
  │  verification against a fixed hash so response time does not reveal existence
  ├─ CheckPassword (Argon2id, constant-time — already correct)
  ├─ on failure: increment counters, emit LoginFailed, generic 401
  ├─ if MFA enrolled → 200 {"status":"mfa_required","mfa_token": <5-min, single-purpose JWT>}
  ├─ risk scoring: new device / new ASN / impossible travel → require step-up
  ├─ TRANSACTION: INSERT sessions, INSERT refresh_tokens, INSERT outbox(UserLoggedIn)
  └─ 200 {access_token, expires_in: 600, refresh_token, user}
```

Refresh token delivery: `Set-Cookie: __Host-ari_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/v1/auth/token`. The access token goes in the response body and lives in JS memory only.

**This replaces `localStorage`.** Both [`api/client.ts:80`](../../../frontend/src/api/client.ts#L80) and [`AuthContext.tsx:82`](../../../frontend/src/app/context/AuthContext.tsx#L82) persist the bearer token to `localStorage` — readable by any XSS payload or malicious dependency, and with a 30-day token that is a month of full account access from a single script injection. (They also use *different keys* — `ari_token` vs `ari_auth_token` — so the two client layers do not share auth state; worth fixing regardless.) With an in-memory access token plus an `HttpOnly` refresh cookie, an XSS gets at most 10 minutes and cannot exfiltrate a durable credential. `SameSite=Strict` on a cookie used only by a POST-only refresh endpoint removes the CSRF concern; if the refresh endpoint ever needs to be cross-site, add double-submit CSRF tokens.

## 4.7 OAuth (Google, GitHub, Apple)

Authorization Code + **PKCE** (S256), even server-side — it costs nothing and defends against code interception on mobile deep links.

```
GET /v1/auth/oauth/google/start
  → state = random 32B, stored in Redis (TTL 10 min) bound to the browser
  → code_verifier stored server-side; code_challenge = S256(verifier) sent to provider
  → 302 to provider

GET /v1/auth/oauth/google/callback?code&state
  ├─ validate state (single-use; delete on read)
  ├─ exchange code + verifier for tokens over TLS, server-to-server
  ├─ verify id_token: signature against the provider's JWKS, iss, aud, exp, nonce
  ├─ REQUIRE email_verified == true — otherwise an attacker registers an unverified
  │  address at the provider and takes over the matching ARI account
  ├─ link by verified email, or create; record in oauth_identities
  └─ issue ARI session (same as login)
```

Account-linking rule: if the email exists with a *password* credential, do **not** auto-link. Require the user to log in with the password first and confirm the link. Auto-linking on an unverified provider email is a well-known takeover path.

Apple specifics: client secret is a JWT signed with the ES256 key and needs periodic regeneration (≤6 months); `email` and `name` are returned **only on first authorization**, so they must be persisted then or lost forever; handle the private relay address.

The env file already defines `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` — none of this is implemented today.

## 4.8 Magic links

32 random bytes, stored as SHA-256, TTL 10 min, single-use, bound to the requesting browser via a companion cookie so a forwarded email cannot be consumed by a third party. Rate limit 3/hour/address. Consuming issues a session with `amr: ["magic"]`, and `amr` gates what a magic-link session may do: it must not be sufficient to change the password, change MFA, or read biometric settings without step-up.

## 4.9 Password reset

**This is the P0 fix.** Replace the current "generate a password, email it, and return it in the HTTP response" flow entirely.

```
POST /v1/auth/password/forgot {email}
  ├─ ALWAYS return 202 with an identical body and near-identical timing
  ├─ if the account exists:
  │     token = 32 random bytes;  store sha256(token), expires_at = now()+30min, single-use
  │     outbox → password reset email containing ONLY a link with the token
  └─ NEVER: rotate the password, invalidate sessions, or return anything about the account

POST /v1/auth/password/reset {token, new_password}
  ├─ look up by sha256(token); reject if used/expired
  ├─ validate the new password (length + breach check)
  ├─ TRANSACTION: update credential; mark token used; revoke ALL sessions and
  │  refresh families; add the user to the deny-list; outbox(PasswordChanged)
  └─ 200 — then send a "your password was changed" notification (not on the critical path)
```

What this fixes, concretely, versus [`handleForgotPassword`](../../../backend/gateway/auth.go#L360):

| Current behaviour | Consequence |
|---|---|
| `"new_password": newPassword` in the response | **Anonymous full account takeover** for any known email address |
| Password is rotated on *request*, before any proof of mailbox control | Anonymous denial of service — lock any user out at will |
| Plaintext password emailed | Compromised by any mailbox breach, forever; sits in mail archives |
| Sessions deleted from `user_sessions` | No effect — the middleware never reads that table |
| Sentinel row written to `otp_codes` with `code='reset'` | Abuses the OTP table as a flag; `handleLogin` then does an extra query per login to read it |

## 4.10 Account lockout & brute-force protection

Layered, because any single layer is bypassable:

| Layer | Key | Limit | Action |
|---|---|---|---|
| Edge | IP/ASN | Cloudflare rate rules | Challenge/block |
| Gateway | IP | 20 auth req/min | 429 |
| Identity | account | 5 failures/15 min | Progressive delay: 1s, 2s, 4s, 8s, then 15-min lock |
| Identity | account | 20 failures/24 h | 1-hour lock + security email |
| Identity | password (credential stuffing) | 100 distinct accounts tried with the same password/hour | Block the source, alert |
| Identity | OTP | 5 attempts per code | Destroy the code |

Lockouts are per-account **and** per-IP: per-account only enables a targeted DoS against a user; per-IP only is defeated by a botnet. Counters in Redis with TTL; a successful login clears the account counter. Every lockout writes an audit row and emits `AccountLocked`.

## 4.11 Device management

`devices` gains `device_fingerprint`, `trusted`, `last_seen_at`, `push_token`, `revoked_at`. Login from an unrecognized device sends a notification with the location and user-agent and offers one-click revocation. Trusted devices may skip MFA for 30 days (a `dev` claim + a signed device cookie); the trust is revocable per device from the sessions UI. For voice devices specifically, a device holding a long-lived credential should be issued a *device certificate* through an attested enrollment, not an ordinary user token — a shared home speaker holding a user's bearer token is an account-takeover surface.

## 4.12 Session expiration policy

| Session type | Idle timeout | Absolute max |
|---|---|---|
| Web (default) | 12 h | 7 d |
| Web (remember me) | 30 d | 90 d |
| Mobile | 30 d | 180 d |
| Voice device | 90 d | 365 d (cert-bound) |
| Admin | 15 min | 8 h |
| Impersonation | 30 min | 30 min |

## 4.13 Multiple devices

Sessions are independent; N concurrent sessions are allowed (default cap 10, oldest evicted). `GET /v1/sessions` lists device, IP-derived location, last-seen, and current-session marker; each is individually revocable. Today `handleGetSessions` returns *one* session and, incidentally, cannot even do that reliably — it scans `created_at` (a `timestamptz`) into a Go `string`, which pgx rejects, so the handler always falls through to the hardcoded `{"browser":"Unknown","lastLogin":"Just now"}` branch.

## 4.14 2FA / MFA

**TOTP (RFC 6238)** as the default second factor: 30 s step, ±1 window drift, SHA-1 (for authenticator-app compatibility), 6 digits. The secret is encrypted at rest with a KMS-derived key, never returned after enrollment. Enrollment requires proving one valid code before the factor is activated. Replay protection: store the last accepted counter per factor and reject reuse — without it, a phished code is valid for 90 seconds.

**WebAuthn/passkeys** as the strong path (phishing-resistant; the only factor that actually defeats real-world credential phishing). Recommended for admins — and *mandatory* for the Admin Service.

**SMS is deliberately not offered** as a primary second factor (SIM-swap and SS7 interception); it remains available only as a low-assurance account-recovery signal.

**Recovery codes.** 10 single-use codes, 128 bits each, shown once, stored Argon2id-hashed. Using one emits `RecoveryCodeUsed` and emails the user. Below 3 remaining, prompt to regenerate.

**Step-up authentication.** Re-authentication (password or WebAuthn, within the last 5 min) is required for: changing password, changing email, enrolling/removing MFA, viewing or deleting the voiceprint, creating API keys, deleting the account, and any admin action. Enforced by checking `amr` and `auth_time` in the access token.

## 4.15 Voice-specific authentication

Speaker verification is **authorization context, never authentication.** A voiceprint cannot be revoked or changed, is trivially observable, and is increasingly synthesizable — treating it as a credential is a design error. In ARI it is used as an *additional* factor that gates what an already-authenticated session may do:

| Action class | Required |
|---|---|
| Read-only ("what's the weather") | Valid session |
| Personal data ("read my messages") | Valid session + `vpv: true` (speaker verified, score ≥ threshold) |
| State-changing ("send a message", "unlock") | Session + `vpv` + confirmation turn |
| Security-relevant ("change my password") | Never available over voice — requires the app + step-up |

Anti-spoofing (replay and synthesis detection) must sit in front of SIV; the score alone does not distinguish a live speaker from a recording.

## 4.16 API keys (programmatic access)

Format `ari_live_<24-byte base62>`, displayed once, stored as SHA-256 with a searchable 8-char prefix. Scoped, optionally IP-restricted, with a mandatory expiry (max 365 d) and a `last_used_at` for staleness reporting. Secret scanning on GitHub push protection registers the `ari_live_` prefix; a detected leak auto-revokes and notifies.

## 4.17 Service-to-service authentication

**Layer 1 — mTLS via the mesh.** SPIFFE identities (`spiffe://ari.internal/ns/prod/sa/gateway`), certificates auto-rotated hourly by the mesh. Proves *which workload* is calling.

**Layer 2 — service JWT.** Short-lived (5 min), `aud` = target service, `scp` = allowed methods. Proves *what the call is allowed to do*.

**Layer 3 — end-user assertion.** The original user principal forwarded as a signed token so the agent can authorize the *user*, not merely trust the gateway. Without this, gateway compromise is total compromise.

Today all three layers are absent: the gateway calls the agent over plaintext HTTP with no credential, and the execution worker calls `/execute` the same way. Interim step before a mesh exists: a shared `AGENT_SERVICE_TOKEN` verified by FastAPI middleware, plus removing the `8000:8000` and `9090:9090` host port publications from `docker-compose.yml`.

## 4.18 Secrets management

| Secret | Storage | Rotation |
|---|---|---|
| JWT signing key | External Secrets Operator → Vault/cloud KMS | 90 d, dual-key overlap |
| DB credentials | Vault dynamic credentials | 24 h (dynamic) |
| `RESEND_API_KEY` | Vault | 180 d |
| OAuth client secrets | Vault | 365 d |
| Voiceprint DEK | KMS envelope encryption | 365 d, versioned |
| Service certs | Mesh CA | 1 h (automatic) |

Rules: secrets are never in env files committed to git, never in images, never in logs. `.env.example` correctly ships placeholders and `.env` is untracked — good. Add `gitleaks`/`trufflehog` to CI and to a pre-commit hook so the earlier incident (real Supabase keys reaching git history) cannot recur; note that remediation requires *rotating* the exposed keys, not only removing the file, since git history and any clone still contain them.

Startup validation already exists in two good forms worth generalizing: `getJWTSecret()` fatals on a missing or <32-char secret, and the agent's `_validate_startup_security_config()` fatals on missing encryption keys. Extend to every required secret, and add an explicit refusal to start in `ENV=production` when any dev fallback (console email logging, permissive CORS) is active.

---

# §5 Authorization Architecture

## 5.0 Current state

There is no authorization layer. `AuthRequired()` establishes *authentication* and every handler then trusts `c.Locals("userID")`. Two consequences are exploitable today:

**Broken object-level authorization.** [`handleUpdateGoal`](../../../backend/gateway/user_handlers.go#L264) and [`handleDeleteGoal`](../../../backend/gateway/user_handlers.go#L281):

```go
_, err := DB.Exec(ctx, "UPDATE user_goals SET status=$1 WHERE id=$2", req.Status, goalID)
_, err := DB.Exec(ctx, "DELETE FROM user_goals WHERE id=$1", goalID)
```

`userID` is read into the surrounding context but never used in the predicate. Any authenticated user can modify or delete any other user's goals given an ID — OWASP API Security #1. The fix is mechanical (`AND user_id = $n` plus a rows-affected check that returns 404 on zero), but the systemic fix is a repository layer where *every* query takes a principal and it is impossible to write a tenant-scoped query without one.

**Non-functional RLS.** [`007_rls_policies.sql`](../../../supabase/migrations/007_rls_policies.sql) enables RLS on nine tables with `USING (auth.uid() = user_id)`. `auth.uid()` reads a Supabase GoTrue JWT claim from the session's request settings. ARI does not use GoTrue — it mints its own JWT — and connects via `DATABASE_URL` as a privileged role, which is `BYPASSRLS`. So `auth.uid()` is NULL, every policy evaluates false for the app role and is bypassed anyway. It provides zero protection while creating the impression of defense in depth. Meanwhile `users`, `devices`, `user_sessions`, `otp_codes`, `agent_memory`, `execution_logs`, and `interaction_logs` have no RLS at all.

**Two coherent options — pick one, don't leave it half-done:**

- **(A) Application-enforced (recommended for Phase 1).** Drop the RLS policies, connect as a non-superuser role with explicit table grants, and enforce every access in a repository layer with mandatory principal arguments. Simple, testable, no per-connection state.
- **(B) Database-enforced.** Keep RLS but make it real: connect as a `BYPASSRLS`-less role and `SET LOCAL app.user_id = $1` at the start of every transaction, with policies rewritten to `current_setting('app.user_id')::uuid`. Genuine defense in depth, but every code path must set the GUC and connection poolers in transaction mode make this easy to get subtly wrong.

## 5.1 Model: RBAC + ownership + (later) ReBAC

```
Principal ──has──▶ Role(s) ──grant──▶ Permission(s) ──on──▶ Resource type
     └──owns──▶ Resource instance          (ownership predicate)
     └──member of──▶ Org ──has──▶ Org Role ──scoped to──▶ Org resources
```

Every decision answers: *can principal P perform action A on resource R in scope S?* Roles cover the coarse cut, ownership predicates cover the instance cut, and ReBAC (OpenFGA) is introduced only when sharing between users appears.

## 5.2 Roles

**System roles**

| Role | Grants |
|---|---|
| `guest` | Public reads only |
| `user` | Full control of own resources |
| `support` | Read user metadata (never content, never biometrics); cannot mutate |
| `admin` | User lifecycle, quotas, feature flags; all actions audited |
| `super_admin` | Role assignment, key rotation, break-glass; requires two-person approval for destructive ops |
| `service` | Machine identities, per-service scopes only |

**Organization roles (Phase 4)** — `org_owner`, `org_admin`, `org_billing`, `org_member`, `org_guest`, plus `team_lead`/`team_member` at team scope. Effective permission = union of system role, org role, team role, and direct grants, minus explicit denials (deny always wins).

The `users.role TEXT NOT NULL DEFAULT 'User'` column in `002_schema.sql` is a single-role string with no constraint and inconsistent casing (`'User'`). Replace with `roles` / `user_roles` tables supporting multiple, scoped, expiring role assignments.

## 5.3 Permission namespace

`{resource}:{action}[:{scope}]` — e.g. `goal:write:own`, `user:read:org`, `voice:enroll:own`, `billing:manage:org`, `admin:impersonate`.

| Resource | Actions |
|---|---|
| `user` | read, write, delete, impersonate |
| `session` | read, revoke |
| `goal` / `preference` / `integration` | read, write, delete |
| `voice_profile` | read, enroll, delete |
| `voice_session` | read, invoke, cancel |
| `execution_task` | read, create, cancel |
| `file` | read, upload, delete |
| `notification` | read, manage_preferences |
| `org` | read, write, delete, invite, manage_members, manage_billing |
| `audit` | read |
| `feature_flag` | read, write |
| `admin` | access, impersonate, force_logout, grant_quota |

## 5.4 Enforcement points

Four layers, deny-by-default at each:

1. **Gateway** — coarse: authenticated? token audience correct? route in the token's scope set? Cheap rejection before any downstream cost.
2. **Service handler** — action-level: `RequirePermission("goal:write:own")` as router-group middleware, never per-handler opt-in.
3. **Repository** — instance-level: every query takes a `Principal`; ownership/tenancy predicates are added by the repository, not by callers. This is the layer that structurally prevents the `handleDeleteGoal` class of bug.
4. **Database** — grants per role; optionally RLS per option (B).

```go
// Repository signature that makes the bug unrepresentable
func (r *GoalRepo) Delete(ctx context.Context, p auth.Principal, goalID uuid.UUID) error {
    tag, err := r.db.Exec(ctx,
        `DELETE FROM user_goals WHERE id = $1 AND user_id = $2`, goalID, p.UserID)
    if err != nil { return err }
    if tag.RowsAffected() == 0 { return ErrNotFound }  // 404, not 403 — don't confirm existence
    return nil
}
```

Returning 404 rather than 403 for objects the principal cannot see matters: 403 confirms the resource exists, which is an enumeration oracle.

## 5.5 Decision flow and caching

```
Request → extract principal (token) → load effective permissions
        → cache: perms:{user_id}:{version}  (Redis, TTL 5 min)
        → evaluate: explicit deny? → DENY
                    permission present + ownership predicate satisfied? → ALLOW
                    else → DENY (default)
        → audit every DENY on a sensitive resource
```

Cache invalidation is version-based: a `permission_version` counter per user is bumped on any role or membership change, and the version is part of the cache key, so stale entries become unreachable rather than needing deletion. Role changes also bump the user deny-list `not_before`, forcing token refresh so a demotion takes effect within 10 minutes rather than 30 days.

## 5.6 Fine-grained and future ReBAC

Phase 1 needs only role + ownership. Introduce **OpenFGA** (self-hosted, Zanzibar-derived) when any of these appear: sharing a resource with another user, org hierarchies with inheritance, or per-field permissions. Model sketch:

```
type goal
  relations
    define owner: [user]
    define editor: [user] or owner
    define viewer: [user, team#member] or editor
```

Do not build this early — a relationship engine with no relationships is pure overhead.

## 5.7 Feature flags and entitlements

Flags are an authorization input, not a separate system: `flag:voice_v2:enabled` resolves per user/org/percentage and is evaluated in the same decision. Entitlements (plan limits — voice minutes, LLM tokens, devices) live in an `entitlements` table populated from billing events and are enforced at the same point, so "over quota" and "not permitted" return through one consistent path (`403` with a `quota_exceeded` problem type and a `Retry-After` where applicable).

## 5.8 Authorization for the voice path

The most subtle case: a plan generated by an LLM must never execute with more authority than the requesting user. Rules:

1. The plan is generated from user speech, which is **untrusted input** — prompt injection through a voice command or a RAG document is a live threat.
2. Each step's `action` is checked against an allowlist of registered tools; the LLM never names an arbitrary endpoint.
3. Each step is authorized **at execution time** against the original principal carried in the job payload — not at plan time, so a revoked permission takes effect on an in-flight plan.
4. Destructive actions require an explicit confirmation turn and cannot be chained automatically within one plan.
5. Tool parameters are schema-validated before execution; `tools_service.action_router` is the correct chokepoint for this.
