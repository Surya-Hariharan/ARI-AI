
# API Migration

**Strategy:** introduce `/api/v1/` as the versioned surface. Existing unversioned paths are aliased to their v1 equivalents for one release, then removed. No endpoint is deleted without a deprecation window except `/execution/stream`, which is an unauthenticated mock with no consumers.

**Deprecation protocol:** a deprecated endpoint returns `Deprecation: true`, `Sunset: <RFC 1123 date>`, and `Link: <successor>; rel="successor-version"`. Usage is tracked by a metric; removal requires 30 days at zero usage.

---

## 1. Endpoint disposition

### Authentication

| Current | Disposition | v1 path | Phase | Notes |
|---|---|---|---|---|
| `POST /api/auth/signup` | **Rename + change** | `POST /api/v1/auth/register` | 2 | Returns `202` always; stops enumerating (removes the 409) |
| `POST /api/auth/verify-otp` | **Keep + change** | `POST /api/v1/auth/verify-email` | 2 | Redis-backed, attempt-capped; returns access+refresh |
| `POST /api/auth/login` | **Keep + change** | `POST /api/v1/auth/login` | 2 | Adds `access_token`/`expires_in` + cookie; drops `requires_password_update` |
| `POST /api/auth/auto-signin` | **Replace** | `POST /api/v1/auth/refresh` | 2 | Cookie-based; token no longer sent in the body |
| `POST /api/auth/forgot-password` | **Change** (done in P0) | `POST /api/v1/auth/password/forgot` | 0/2 | `202`, no `new_password`, no side effects |
| — | **Create** | `POST /api/v1/auth/password/reset` | 0 | Token-based reset |
| `POST /api/auth/update-password` | **Keep + harden** | `POST /api/v1/auth/password/change` | 2 | Requires current password; revokes other sessions |
| — | **Create** | `POST /api/v1/auth/logout` | 2 | |
| — | **Create** | `POST /api/v1/auth/logout-all` | 2 | |
| — | **Create** | `POST /api/v1/auth/mfa/{enroll,verify,disable}` | 6 | |
| — | **Create** | `GET /api/v1/auth/oauth/{provider}/{start,callback}` | 6 | |

### User

| Current | Disposition | v1 path | Phase |
|---|---|---|---|
| `GET/PUT /api/user/profile` | **Keep** | `GET/PATCH /api/v1/me` | 3 |
| `GET /api/user/session` | **Replace** | `GET /api/v1/me/sessions` | 2 |
| `POST /api/user/session/revoke` | **Replace** | `DELETE /api/v1/me/sessions/{id}` + `/all` | 2 |
| `GET/POST /api/user/integrations[/toggle]` | **Keep + fix** | `GET /api/v1/me/integrations`, `PUT …/{id}` | 3 |
| `GET /api/user/usage` | **Replace** | `GET /api/v1/me/usage` | 5 |
| `GET/POST/PUT/DELETE /api/user/goals[/:id]` | **Keep + secure** | `/api/v1/me/goals[/{id}]` | 0/3 |
| `GET/POST /api/user/preferences` | **Keep** | `GET/PUT /api/v1/me/preferences` | 3 |
| — | **Create** | `POST /api/v1/me/export`, `DELETE /api/v1/me` | 7 |

### Voice & execution

| Current | Disposition | v1 path | Phase |
|---|---|---|---|
| `POST /voice/command` | **Change semantics** | `POST /api/v1/voice/commands` | 4 |
| `GET /execution/status/:task_id` | **Secure + move** | `GET /api/v1/voice/commands/{id}` | 0/4 |
| `GET /execution/stream` (WS) | **Delete** | `GET /api/v1/voice/commands/{id}/events` (SSE) | 0/4 |
| `POST /api/user/voice/enroll` | **Keep + harden** | `POST /api/v1/me/voice/enrollment` | 3 |
| `POST /api/user/voice/verify` | **Keep** | `POST /api/v1/me/voice/verify` | 3 |
| — | **Create** | `DELETE /api/v1/me/voice/enrollment` | 3 |
| — | **Create** | `WS /api/v1/voice/stream` | 6 |

### Infrastructure

| Current | Disposition | Notes |
|---|---|---|
| `GET /health`, `/live`, `/ready` | **Keep unchanged** | Already correct; unversioned by convention |
| — | **Create** `POST /api/v1/webhooks/resend` | Phase 4 |
| — | **Create** `GET /metrics` | Phase 5, internal port only |

**Agent service (all 44 endpoints):** none are public. They move behind the service-token check in Phase 0 and mTLS in Phase 6. The `/plan` endpoint is already feature-flagged off by default (`ARI_ENABLE_LEGACY_PLAN_ENDPOINT`), which is the right pattern; extend it — every legacy agent endpoint gets a flag and a removal date.

---

## 2. Request/response examples

### `POST /api/v1/auth/register`

```http
POST /api/v1/auth/register HTTP/1.1
Content-Type: application/json
Idempotency-Key: 9f2c1a3e-...

{ "email": "user@gmail.com", "password": "correct horse battery staple",
  "full_name": "Alex Doe", "locale": "en", "timezone": "Asia/Kolkata" }
```
```http
HTTP/1.1 202 Accepted
X-Request-Id: req_01J8...

{ "status": "verification_sent",
  "message": "If that address can receive mail, a verification code is on its way." }
```
Identical response whether or not the address is already registered — this is the enumeration fix. **Auth:** none. **Rate limit:** 3/hour/IP, 1/min/email.

### `POST /api/v1/auth/login`

```http
POST /api/v1/auth/login
{ "email": "user@gmail.com", "password": "…", "device_id": "dev_01J8…" }
```
```http
HTTP/1.1 200 OK
Set-Cookie: __Host-ari_rt=8f3a…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=2592000

{ "access_token": "eyJhbGciOiJFZERTQSIsImtpZCI6ImsyMDI2MDgi...",
  "token_type": "Bearer", "expires_in": 600,
  "user": { "id": "usr_01J8…", "email": "user@gmail.com",
            "full_name": "Alex Doe", "roles": ["user"] } }
```
MFA case:
```http
HTTP/1.1 200 OK
{ "status": "mfa_required", "mfa_token": "eyJ…", "methods": ["totp"], "expires_in": 300 }
```
**Rate limit:** 5/15min/account, 20/min/IP.

### `POST /api/v1/auth/refresh`

```http
POST /api/v1/auth/refresh
Cookie: __Host-ari_rt=8f3a…
```
```http
HTTP/1.1 200 OK
Set-Cookie: __Host-ari_rt=b71d…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh
{ "access_token": "eyJ…", "token_type": "Bearer", "expires_in": 600 }
```
Reuse detected:
```http
HTTP/1.1 401 Unauthorized
Set-Cookie: __Host-ari_rt=; Max-Age=0
Content-Type: application/problem+json

{ "type": "https://ari.example/problems/token-reuse",
  "title": "Session terminated",
  "detail": "This session was ended for your security. Please sign in again.",
  "status": 401 }
```
Note the user-facing wording says nothing about *why* — the detail that a reused token was detected is an internal signal, logged and alerted, not explained to a possible attacker.

### `POST /api/v1/voice/commands`

```http
POST /api/v1/voice/commands
Authorization: Bearer eyJ…
Idempotency-Key: 3b7f…

{ "command_text": "remind me to call Alice at 5pm", "device_id": "dev_01J8…" }
```
```http
HTTP/1.1 202 Accepted
Location: /api/v1/voice/commands/tsk_01J8…

{ "task_id": "tsk_01J8…", "status": "queued",
  "status_url": "/api/v1/voice/commands/tsk_01J8…",
  "events_url": "/api/v1/voice/commands/tsk_01J8…/events" }
```
**The key change:** this returns before planning, not after. Today the gateway blocks up to 12 s on the agent's `/plan` call before the client sees anything.

### `GET /api/v1/voice/commands/{id}/events` (SSE)

```http
GET /api/v1/voice/commands/tsk_01J8…/events
Authorization: Bearer eyJ…
Accept: text/event-stream
Last-Event-ID: 3
```
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-store

id: 4
event: step.completed
data: {"step_index":0,"action":"parse_time","status":"completed"}

id: 5
event: task.completed
data: {"task_id":"tsk_01J8…","status":"completed","summary":"Reminder set for 17:00"}
```
`Last-Event-ID` replay is what makes a dropped connection invisible to the user.

### `DELETE /api/v1/me/goals/{id}`

```http
DELETE /api/v1/me/goals/gol_01J8… HTTP/1.1
Authorization: Bearer eyJ…
```
```http
HTTP/1.1 204 No Content
```
Another user's goal:
```http
HTTP/1.1 404 Not Found
{ "type": "https://ari.example/problems/not-found", "title": "Goal not found", "status": 404 }
```
404, never 403 — a 403 would confirm the object exists.

### `POST /api/v1/webhooks/resend`

```http
POST /api/v1/webhooks/resend
svix-id: msg_2Xy…
svix-timestamp: 1785312000
svix-signature: v1,g0hM9S… v1,kQr2Xa…

{ "type": "email.bounced", "created_at": "2026-08-01T10:00:00Z",
  "data": { "email_id": "re_abc…", "to": ["user@gmail.com"],
            "bounce": { "type": "hard", "message": "550 5.1.1 unknown" } } }
```
```http
HTTP/1.1 202 Accepted
{ "received": true }
```
Handler budget <200 ms: verify, dedupe, persist, return. Multiple `v1,` values are supported so the secret can be rotated without dropping events.

### `POST /api/v1/me/voice/enrollment`

`multipart/form-data` with `audio` plus `consent_version`. Requires re-authentication within 5 minutes (`amr` + `auth_time` check) because it writes biometric data.
```http
HTTP/1.1 202 Accepted
{ "enrollment_id": "enr_01J8…", "status": "processing" }
```
Missing step-up:
```http
HTTP/1.1 401 Unauthorized
{ "type": "https://ari.example/problems/reauth-required",
  "title": "Re-authentication required", "status": 401, "max_age": 300 }
```

---

## 3. Authentication and rate-limit reference

| Endpoint class | Auth | Rate limit | Key |
|---|---|---|---|
| `auth/register`, `password/forgot`, `password/reset` | none | 3/h | IP + email |
| `auth/login`, `verify-email`, `mfa/verify` | none / mfa token | 5/15min | account + IP |
| `auth/refresh` | refresh cookie | 60/min | session |
| `me/*` reads | Bearer | 300/min | user |
| `me/*` writes | Bearer | 100/min | user |
| `me/voice/enrollment` | Bearer + step-up | 5/day | user |
| `voice/commands` POST | Bearer | 60/min | user |
| `voice/commands/{id}/events` | Bearer | 5 concurrent | user |
| `voice/stream` (WS) | Bearer | 3 concurrent | user |
| `webhooks/*` | signature | 10,000/min | provider |
| `internal/admin/*` | Bearer + admin + WebAuthn | 60/min | admin |
| `health`, `live`, `ready` | none | exempt | — |

Additional resource quotas beyond request counts (a voice product can be abused without exceeding any request limit): audio bytes/minute per user, LLM tokens/day per user, concurrent voice sessions per user, GPU-seconds per user per day.

---

## 4. Error response standard

All errors become RFC 9457 `application/problem+json`. Today handlers return `{"error": "…"}` with inconsistent detail levels, several leaking internals.

```json
{
  "type": "https://ari.example/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/auth/register",
  "request_id": "req_01J8…",
  "errors": [ { "field": "password", "code": "too_short", "message": "Must be at least 12 characters." } ]
}
```

| Status | `type` slug | When |
|---|---|---|
| 400 | `malformed-request` | Unparseable body |
| 401 | `unauthorized` / `token-expired` / `reauth-required` / `token-reuse` | Auth failures |
| 403 | `forbidden` / `quota-exceeded` | Authenticated but not permitted |
| 404 | `not-found` | Absent **or not visible to this principal** |
| 409 | `conflict` / `version-mismatch` | Optimistic-lock failure |
| 422 | `validation-failed` / `idempotency-key-reuse` | Semantic errors |
| 423 | `account-locked` | Lockout, with `Retry-After` |
| 429 | `rate-limited` | With `Retry-After`, `RateLimit-*` |
| 502/503/504 | `upstream-unavailable` / `service-unavailable` | Downstream failures — never a naked 500 |

Rules: `detail` is safe to display to end users; internal causes go to logs keyed by `request_id`; error bodies never contain SQL, stack traces, or hostnames. A backward-compatibility shim keeps `{"error": "<title>"}` alongside the problem fields for one release so the SPA does not break mid-migration.

---

## 5. Cross-cutting API changes by phase

| Phase | Change | Client impact |
|---|---|---|
| 0 | `forgot-password` loses `new_password`; execution routes secured; stream deleted | Reset UI rewritten |
| 2 | `/api/v1/` introduced; access+refresh; session endpoints | Client auth layer rewritten |
| 3 | 404-not-403; problem+json; optimistic-lock 409s | Error handling updated |
| 4 | Async commands; SSE; webhook endpoint | Command flow becomes subscribe-based |
| 5 | `Deprecation`/`Sunset` headers on legacy aliases | None if already on v1 |
| 6 | MFA and OAuth endpoints | Additive |

## 6. API versioning policy

`/api/v1/` in the path. Additive changes (new optional fields, new endpoints, new enum values clients are told to ignore when unknown) ship within v1. Breaking changes (removing or renaming a field, changing a type, tightening validation, changing status-code semantics) require v2 plus a 6-month overlap.

Every response carries `X-API-Version`. The OpenAPI spec is generated from code and published in CI; a contract test asserts that no PR removes or retypes an existing field without a version bump — the mechanical guard that makes the policy real rather than aspirational.
