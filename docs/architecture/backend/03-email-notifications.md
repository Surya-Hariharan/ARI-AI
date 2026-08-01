# §6–§7 Email Infrastructure (Resend) & Notification Architecture

---

# §6 Email Infrastructure

## 6.0 Current state

[`SendEmail`](../../../backend/gateway/auth_helpers.go#L180) implements a genuinely well-reasoned provider chain — Resend → SMTP → console log — with a comment explaining exactly why the fallthrough exists. That part is good and should be kept as the *adapter's* internal behaviour.

Everything around it is not production-safe:

| Issue | Location | Consequence |
|---|---|---|
| Fire-and-forget `go func(){ SendEmail(...) }()` | `auth.go:158`, `:262`, `:411` | Process restart between the DB commit and the send loses the OTP permanently. The user sees "code sent" and never receives one. |
| No retry | `auth_helpers.go` | A single 500 from Resend, or a 2-second network blip, drops the mail. |
| No idempotency | — | A retried HTTP request (client, LB, or user double-click) sends duplicate OTPs, each invalidating the user's mental model of which code is current. |
| No dead-letter queue | — | Failures are invisible beyond a log line. |
| Console fallback logs the OTP | `auth_helpers.go:206` | In production this writes verification codes into stdout → log aggregation → anyone with log access can take over accounts. |
| No webhook handler | — | Bounces and complaints are never observed. Sending to dead addresses erodes domain reputation until Gmail/Outlook start rejecting *all* ARI mail — including OTPs, which breaks signup entirely. |
| No suppression list | — | ARI will keep mailing hard-bounced and complained addresses forever. |
| Templates are Go string constants with `%s` | `auth_helpers.go:250+` | No preview, no localisation, no test rendering, and `fmt.Sprintf` into HTML is an injection vector the moment any user-controlled value is interpolated. |
| Signup returns `200 "otp_sent"` regardless | `auth.go:163` | The API asserts delivery it has not verified. |

## 6.1 Target architecture

```
 Business transaction (Postgres)
   ├─ INSERT domain row
   └─ INSERT outbox_events (EmailRequested)      ← same transaction, atomic
        │
        ▼  outbox relay (poll 200ms / LISTEN-NOTIFY)
   ┌─────────────────┐
   │ NATS JetStream  │  subject: ari.email.requested
   └────────┬────────┘
            ▼
   ┌──────────────────────────── Email Service ───────────────────────────┐
   │ 1. dedupe on idempotency_key (Redis SETNX, 24h)                      │
   │ 2. suppression check (hard bounce / complaint / unsubscribe)         │
   │ 3. render template (MJML → HTML + text), locale-aware                │
   │ 4. INSERT email_messages (status=queued)                             │
   │ 5. POST api.resend.com/emails  +  Idempotency-Key header             │
   │ 6. UPDATE email_messages SET provider_id, status=sent                │
   │    on failure → retry w/ backoff → after 5 attempts → DLQ + alert    │
   └──────────────────────────────────────────────────────────────────────┘
            │                                        ▲
            ▼                                        │
        Resend  ──────── delivers ────────▶ recipient│
            │                                        │
            └── webhook (Svix-signed) ──▶ Webhook Gateway ──▶ ari.email.events
                                              verify → dedupe → 202 → enqueue
                                                            │
                                                            ▼
                                          update email_messages + suppression list
                                          + emit EmailDelivered/Bounced/Complained
```

## 6.2 Where Resend's API is used

| Resend API | Called by | When | Idempotency |
|---|---|---|---|
| `POST /emails` | Email Service worker | One call per `email_messages` row in `queued` | `Idempotency-Key: <message_id>` — Resend deduplicates for 24 h, so a worker retry after an ambiguous timeout cannot double-send |
| `POST /emails/batch` | Digest worker | Up to 100 recipients per call for daily/weekly digests | Per-batch key |
| `GET /emails/{id}` | Reconciliation cron | Hourly, for messages `sent` >1 h ago with no terminal webhook — closes the gap when a webhook is lost | — |
| `POST /domains/{id}/verify` | Ops, one-off | Domain setup | — |
| `GET /domains` | Startup check | Warn if the sending domain is unverified | — |

**Never called from a request handler.** The only synchronous email-adjacent work on a user's request path is the outbox insert.

## 6.3 Timeouts, retries, and rate limits

- Per-call timeout 10 s (already correct in `sendEmailViaResend`), plus an overall job deadline of 60 s.
- Retry classification matters more than the backoff curve:
  - `429`, `5xx`, network/timeout → **retryable**: 1s, 4s, 16s, 64s, 256s with full jitter, max 5 attempts, then DLQ.
  - `422` (invalid recipient), `403` (unverified domain) → **non-retryable**: fail immediately, mark `failed`, alert ops for the domain case. Retrying a permanent error five times is wasted quota and delays real work.
  - `401` → non-retryable, page immediately (rotated or revoked key).
- Resend's account rate limit is enforced client-side with a Redis token bucket so bursts queue rather than 429.
- **Circuit breaker** around the provider: after 10 consecutive failures, open for 60 s and let jobs accumulate in the queue rather than hammering a dead provider.
- **Provider failover:** if the breaker is open longer than 5 minutes, the adapter switches to the SMTP path (self-hosted Postal is the principle-compliant substitute). Because the outbox holds everything, no mail is lost during the switch.

**Console-log fallback must be environment-gated.** Keep it for `ENV=development`; in `production` a missing provider must fail the job into the DLQ, never print the OTP.

## 6.4 Where Resend's webhooks are used

Resend signs webhooks with **Svix** headers: `svix-id`, `svix-timestamp`, `svix-signature`.

```
POST /v1/webhooks/resend
  1. read the RAW body (never parse before verifying — re-serialization changes bytes
     and breaks the signature)
  2. reject if |now − svix-timestamp| > 5 min          ← replay window
  3. HMAC-SHA256(secret, "{id}.{timestamp}.{body}"), constant-time compare against
     each value in svix-signature (space-separated; supports key rotation)
  4. SETNX webhook:resend:{svix-id} → if it exists, return 200 immediately (duplicate)
  5. INSERT webhook_events (raw payload, status=pending)
  6. return 202          ← total handler budget < 200 ms
  7. all business logic happens in the async consumer
```

Everything after step 6 is asynchronous because a webhook endpoint that does work inline will eventually time out, causing the provider to retry, causing more work — the classic webhook feedback loop. Resend retries with backoff over ~24 h, so returning 5xx is safe; returning 200 on a payload you failed to store is not, because the event is then gone forever.

Additional controls: IP allowlist as defense in depth (not as the primary control — IPs change); dedicated deployment so a webhook flood cannot starve user traffic; a rate limit generous enough for legitimate bursts (10k/min) but bounded.

| Event | Handling |
|---|---|
| `email.sent` | `status=sent`, record `provider_id` |
| `email.delivered` | `status=delivered`, `delivered_at`; clear soft-bounce counter |
| `email.delivery_delayed` | Increment `delay_count`; alert only if a message is delayed >6 h |
| `email.bounced` (hard) | `status=bounced` → **suppression list, permanent**. If it was a verification email, mark the address `undeliverable` and prompt the user for a new one. |
| `email.bounced` (soft) | Increment; suppress after 5 soft bounces in 30 days |
| `email.complained` | `status=complained` → **permanent suppression + opt out of all non-transactional mail + alert**. Complaint rate is the single most damaging deliverability metric. |
| `email.opened` | Optional, marketing only, per consent (§6.9) |
| `email.clicked` | Optional, marketing only, per consent |

## 6.5 Data model

```sql
CREATE TABLE email_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT UNIQUE NOT NULL,        -- e.g. "otp:{user_id}:{otp_id}"
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email_hash    BYTEA NOT NULL,              -- sha256(lower(email)) for joins/analytics
  to_email_enc     BYTEA,                       -- pgp_sym_encrypt, purge after 90d
  template_id      TEXT NOT NULL,
  template_version INT  NOT NULL,
  category         TEXT NOT NULL,               -- transactional | security | marketing | digest
  locale           TEXT NOT NULL DEFAULT 'en',
  provider         TEXT NOT NULL DEFAULT 'resend',
  provider_id      TEXT,                        -- Resend message id
  status           TEXT NOT NULL DEFAULT 'queued',
  attempt_count    INT  NOT NULL DEFAULT 0,
  last_error       TEXT,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
  bounced_at  TIMESTAMPTZ, complained_at TIMESTAMPTZ,
  CHECK (status IN ('queued','sending','sent','delivered','bounced',
                    'complained','failed','suppressed'))
);
CREATE INDEX ON email_messages (status, queued_at) WHERE status IN ('queued','sending');
CREATE INDEX ON email_messages (provider_id);
CREATE INDEX ON email_messages (user_id, queued_at DESC);

CREATE TABLE email_suppressions (
  email_hash BYTEA PRIMARY KEY,
  reason     TEXT NOT NULL,   -- hard_bounce | complaint | unsubscribe | manual
  scope      TEXT NOT NULL DEFAULT 'all',  -- all | marketing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ      -- NULL = permanent
);

CREATE TABLE webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  signature_ok BOOLEAN NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INT NOT NULL DEFAULT 0,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)          -- DB-level dedupe backstop
);
```

**Stored:** message metadata, template id/version, status timeline, hashed recipient, error classification.
**Never stored:** the rendered HTML body of a transactional email (it contains OTPs and reset links), OTP codes or reset tokens in plaintext anywhere, passwords (which the current reset flow both emails and stores in transit), full third-party payloads beyond a 30-day retention, or open/click data without consent.
Plaintext recipient addresses are encrypted and purged at 90 days; the hash is retained for suppression and analytics indefinitely.

## 6.6 Idempotency and exactly-once

True exactly-once delivery across a network is impossible; what is achievable is **effectively-once**, built from three independent layers:

1. **Producer** — `idempotency_key` is `UNIQUE` on `email_messages`. A duplicate outbox event conflicts and is dropped. Keys are deterministic and derived from the domain event (`otp:{user_id}:{otp_id}`), not random.
2. **Provider** — `Idempotency-Key` header on `POST /emails`; Resend suppresses duplicates within 24 h, so a retry after an ambiguous timeout is safe.
3. **Consumer** — webhook handling is idempotent through the `svix-id` dedupe and monotonic status transitions (`delivered` never regresses to `sent`, even if webhooks arrive out of order).

Transitions are guarded so out-of-order webhooks cannot corrupt state:

```sql
UPDATE email_messages
   SET status = 'delivered', delivered_at = $2
 WHERE provider_id = $1
   AND status IN ('queued','sending','sent');   -- never downgrade a terminal state
```

## 6.7 Template management

MJML sources under `backend/email/templates/{id}/{locale}.mjml`, compiled to HTML + text at build time, versioned, and content-hashed. Rendering uses Go's `html/template` with **contextual auto-escaping** — the current `fmt.Sprintf` approach into raw HTML is safe only as long as every interpolated value is a code or an email address, and that invariant will not survive the next feature. Golden-file tests assert every template renders in every locale with no unescaped variables; Litmus/Email-on-Acid checks run in CI on template change.

| Template | Category | Notes |
|---|---|---|
| `auth.otp` | security | Code, 10-min expiry, "ignore if not you". Never a link. |
| `auth.welcome` | transactional | Post-verification |
| `auth.password_reset` | security | **Link with a single-use token — never a password** |
| `auth.password_changed` | security | Notification only |
| `auth.new_device` | security | Location, UA, one-click revoke |
| `auth.mfa_enabled` / `mfa_disabled` | security | |
| `account.export_ready` | transactional | Presigned link, 24 h |
| `voice.enrollment_complete` | transactional | |
| `task.completed` / `task.failed` | transactional | Respects preferences |
| `digest.weekly` | marketing | Requires opt-in + unsubscribe |
| `org.invitation` | transactional | Phase 4 |

Existing bodies in `auth_helpers.go` are visually strong and worth porting as-is; note the two dead `href="#"` links in the OTP and welcome templates, and that the welcome template's "Lock your account immediately" call to action goes nowhere.

## 6.8 Transactional vs. marketing separation

Separate **subdomains** and separate Resend sending domains: `mail.ari.example` for transactional/security, `news.ari.example` for marketing. This is the single highest-leverage deliverability decision available — a marketing campaign that draws complaints must not be able to degrade the reputation of the domain that delivers OTPs. Separate IP pools once volume justifies dedicated IPs (>100k/month), with a proper warm-up ramp.

DNS: SPF, DKIM (2048-bit), and **DMARC at `p=reject`** with `rua` aggregate reports monitored. `p=none` is a data-collection phase, not a destination. Add BIMI once DMARC enforcement is stable.

Transactional mail ignores marketing preferences but still respects hard-bounce suppression — there is no point sending an OTP to an address that does not exist, and doing so damages reputation.

## 6.9 Tracking and privacy

Open tracking (a tracking pixel) and click tracking (link rewriting) are **off by default for transactional and security email**. Rewriting links in a password-reset email through a tracking domain is both a phishing-training pattern and a needless interception point; a tracking pixel in a security notification leaks read-status to the provider. Enable both only for marketing categories, only with consent, with a documented retention period, and with a one-click unsubscribe (RFC 8058 `List-Unsubscribe-Post`, now effectively mandatory for bulk senders at Gmail and Yahoo).

## 6.10 Monitoring and alerting

| Metric | Alert |
|---|---|
| Bounce rate | warn >2%, page >5% |
| Complaint rate | warn >0.05%, page >0.1% (Gmail's threshold is 0.3% and enforcement is abrupt) |
| Delivery rate | page <95% |
| Queue depth / oldest queued message | page if any message waits >5 min |
| DLQ size | page on any non-zero value |
| OTP send→verify funnel | page on a >20% drop from baseline — the earliest signal that delivery is broken |
| Webhook signature failures | page on a spike (forged webhooks or a rotated secret) |
| Provider 4xx/5xx by class | dashboard |

The OTP funnel deserves emphasis: it is the metric that detects "Gmail started rejecting us" before support tickets do.

## 6.11 Failure recovery

| Failure | Detection | Recovery |
|---|---|---|
| Resend outage | Breaker opens, 5xx rate | Jobs accumulate in the durable queue; SMTP failover after 5 min; nothing lost |
| API key revoked | 401 | Page; rotate from Vault; jobs retry |
| Domain unverified | 403 | Page; jobs park in DLQ, replayed after fixing |
| Webhook secret rotated | Signature failures spike | Support two secrets during rotation |
| Missed webhooks | Reconciliation cron finds `sent` with no terminal event >1 h | `GET /emails/{id}` to reconcile |
| Poison message | 5 failed attempts | DLQ with full context; ops replays after fix |
| Mass bounce (domain reputation) | Bounce-rate alert | Pause non-transactional sending, investigate, warm up again |

---

# §7 Notification Architecture

## 7.0 Purpose and current state

None of this exists today — the only notifications ARI sends are three hardcoded auth emails. It is specified now because retrofitting preferences, quiet hours, and deduplication after five features have each grown their own notification code is far more expensive than building the seam once.

The Notification Service turns a *domain fact* ("your task finished") into *channel deliveries*, applying user preferences, deduplication, priority, and delivery tracking exactly once, in one place.

## 7.1 Pipeline

```
Domain event (NATS)                e.g. AiJobCompleted
      ▼
Notification Router
  ├─ map event → notification type (task.completed)
  ├─ resolve recipients
  ├─ load preferences + quiet hours + locale/timezone
  ├─ dedupe (Redis key: notif:{user}:{type}:{entity}, TTL by type)
  ├─ decide channels: [in_app, push, email?]
  └─ decide timing: immediate | batched | digest | scheduled
      ▼
Priority queues  ── critical ── high ── normal ── low/digest
      ▼
Channel workers
  ├─ in_app  → INSERT notifications → publish to SSE/WS
  ├─ push    → APNs / FCM (or self-hosted Web Push via VAPID)
  ├─ email   → EmailRequested → §6 pipeline
  └─ sms     → Twilio/self-hosted gateway (critical only; cost + fatigue)
      ▼
Delivery tracking → notification_deliveries (status per channel)
```

## 7.2 Channels

| Channel | Latency | Use for | Failure mode |
|---|---|---|---|
| **In-app** | <100 ms | Everything; the durable record of what happened | Store-and-forward — always succeeds; the user sees it on next load |
| **Real-time (SSE/WS)** | <200 ms | Task progress, live voice state | Best-effort; the in-app row is the fallback |
| **Push** | 1–5 s | Time-sensitive when the app is closed | Token invalidation → prune and fall back to email |
| **Email** | 5–60 s | Security alerts, digests, anything needing durability | §6 |
| **SMS** | 5–30 s | Critical account security only | Expensive; opt-in; never for routine notices |

## 7.3 Preferences

```sql
CREATE TABLE notification_preferences (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  in_app  BOOLEAN NOT NULL DEFAULT true,
  push    BOOLEAN NOT NULL DEFAULT true,
  email   BOOLEAN NOT NULL DEFAULT true,
  sms     BOOLEAN NOT NULL DEFAULT false,
  digest_frequency TEXT NOT NULL DEFAULT 'immediate',  -- immediate|hourly|daily|weekly|never
  PRIMARY KEY (user_id, notification_type)
);

CREATE TABLE notification_quiet_hours (
  user_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  start_local TIME NOT NULL DEFAULT '22:00',
  end_local   TIME NOT NULL DEFAULT '08:00',
  allow_critical BOOLEAN NOT NULL DEFAULT true
);
```

Defaults are opt-in for transactional and opt-out for marketing. **Security notifications are not user-suppressible** — a user must not be able to disable "your password was changed", because an attacker who gains session access would disable it first.

Quiet hours defer `normal`/`low` to the next allowed window; `critical` always sends. Timezone comes from the user's profile — relevant since `AuthPage.tsx` already does timezone-aware greetings, so the data is available.

## 7.4 Deduplication and rate limiting

Three protections against notification fatigue, which is the failure mode that makes users disable notifications entirely (and thereby miss the security ones):

1. **Dedupe key** `notif:{user}:{type}:{entity_id}` with a per-type TTL — the same task completing twice due to a retry sends one notification.
2. **Per-user rate cap** — max 10 push/hour, 20 email/day (excluding security). Overflow is coalesced into a digest.
3. **Coalescing** — five tasks completing in 60 s produce "5 tasks completed", not five notifications.

## 7.5 Digests

Hourly/daily/weekly digest workers run as K8s `CronJob`s with `concurrencyPolicy: Forbid`, selecting pending `digest`-mode notifications, grouping by user, rendering one email, and marking them delivered in the same transaction that records the send. Users in different timezones are batched into their local send window (default 09:00 local), not a single global UTC hour — a global hour both spikes load and arrives at 3 a.m. for a third of the world.

## 7.6 Priority queues

| Priority | Examples | SLA | Backpressure behaviour |
|---|---|---|---|
| `critical` | Security alert, MFA change, account lockout | <5 s | Never dropped, never delayed; dedicated workers so a low-priority backlog cannot starve it |
| `high` | Task failed, voice session error | <30 s | |
| `normal` | Task completed, weekly summary ready | <5 min | Coalesced under load |
| `low` | Product news, tips | <1 h | Shed first under sustained overload |

Separate worker pools per priority. A single shared pool means a marketing send delays a security alert — a queue-design mistake with real security consequences.

## 7.7 History, status, and retries

`notifications` (per user, per type, `read_at`, entity reference, rendered title/body, `expires_at`) and `notification_deliveries` (per channel: `queued|sent|delivered|failed|suppressed`, attempts, provider id, error).

Retry policy per channel: push 3 attempts (30 s, 2 min, 10 min) — on `InvalidRegistration`/`Unregistered`, delete the token and stop; email delegates to §6's policy; SMS 2 attempts; in-app never retries because the write is the delivery. All channels exhausted → DLQ + a metric, and for `critical` priority, an on-call alert (a security notification that could not be delivered is itself a security event).

## 7.8 Real-time delivery

SSE is the default for the dashboard: one-way, auto-reconnecting with `Last-Event-ID`, and it traverses proxies that break WebSockets. On connect, the client receives everything since its last event ID from the `notifications` table, so a reconnect never loses an event — the fan-out layer is best-effort and the database is the source of truth. Redis pub/sub fans out across gateway replicas; per-user connection cap of 5; 30 s heartbeat to keep intermediaries from idling the connection out.

The existing `/execution/stream` WebSocket handler ([`main.go:196`](../../../backend/gateway/main.go#L196)) is a placeholder that echoes a hardcoded `{"status":"executing","task_id":"simulated"}` to anyone who connects, with no authentication and no subscription. It should be deleted and replaced by the authenticated SSE endpoint described here.
