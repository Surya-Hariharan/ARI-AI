# §15 Architecture Diagrams

All diagrams in Mermaid. They describe the **target** architecture; where the current implementation differs materially, the difference is noted beneath the diagram.

---

## 15.1 Overall backend architecture

```mermaid
flowchart TB
    subgraph clients["Clients"]
        SPA["React SPA"]
        MOB["Mobile app"]
        DEV["Voice device / mic"]
    end

    subgraph edge["Edge"]
        CF["Cloudflare: WAF, DDoS, bot mgmt, CDN"]
        LB["Envoy Gateway: TLS, routing, retries, circuit breaking"]
    end

    subgraph entry["Entry tier"]
        GW["API Gateway (Go/Fiber)"]
        RT["Voice Realtime Edge (WS/WebRTC)"]
        WH["Webhook Gateway"]
        ADM["Admin Service"]
    end

    subgraph domain["Domain services"]
        IDP["Identity Service"]
        USR["User Service"]
        ORG["Organization Service (phase 4)"]
        AGT["Voice Agent (Python, GPU)"]
        EXE["Execution Worker (Go)"]
        NTF["Notification Service"]
        EML["Email Service"]
        FIL["File Service"]
        SRCH["Search Service"]
        AUD["Audit Service"]
        ANL["Analytics Service"]
    end

    subgraph data["Data tier"]
        PG[("PostgreSQL primary")]
        PGR[("Read replicas")]
        RDS[("Redis: cache, RL, locks")]
        NATS{{"NATS JetStream"}}
        OBJ[("MinIO / R2")]
        CH[("ClickHouse")]
        VAULT[("Vault / KMS")]
    end

    subgraph ext["External"]
        RSND["Resend"]
        OAUTH["Google / GitHub / Apple"]
        PUSH["APNs / FCM"]
    end

    SPA --> CF
    MOB --> CF
    DEV --> CF
    CF --> LB
    LB --> GW
    LB --> RT
    LB --> WH
    ADM -.private ingress.-> LB

    GW --> IDP
    GW --> USR
    GW --> ORG
    GW --> AGT
    GW --> FIL
    GW --> SRCH
    RT --> AGT
    WH --> NATS

    IDP --> PG
    USR --> PG
    ORG --> PG
    AGT --> PG
    EXE --> PG
    EML --> PG
    NTF --> PG
    AUD --> PG
    PG --> PGR
    ANL --> CH

    IDP -- outbox --> NATS
    USR -- outbox --> NATS
    AGT -- outbox --> NATS
    EXE -- outbox --> NATS

    NATS --> EML
    NATS --> NTF
    NATS --> AUD
    NATS --> ANL
    NATS --> SRCH
    NATS --> EXE

    GW --> RDS
    IDP --> RDS
    AGT --> RDS
    FIL --> OBJ
    AGT --> OBJ

    EML --> RSND
    RSND -. webhooks .-> WH
    IDP --> OAUTH
    NTF --> PUSH

    IDP --> VAULT
    AGT --> VAULT
```

**Today:** the `entry` tier is one process (gateway), there is no `NATS`, no outbox, no Email/Notification/Audit/Analytics/File/Search service, and the agent is reached over unauthenticated plaintext HTTP.

---

## 15.2 Authentication flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant GW as API Gateway
    participant ID as Identity Service
    participant PG as Postgres
    participant R as Redis
    participant OB as Outbox/NATS
    participant EM as Email Service

    Note over C,EM: Registration
    C->>GW: POST /v1/auth/register
    GW->>ID: Register
    ID->>ID: validate + breach-check password
    ID->>ID: Argon2id hash
    ID->>PG: BEGIN
    ID->>PG: INSERT users (pending_verification)
    ID->>PG: INSERT email_verification_tokens (hash)
    ID->>PG: INSERT outbox (UserRegistered)
    ID->>PG: COMMIT
    ID-->>C: 202 verification_sent (identical if email exists)
    OB-->>EM: UserRegistered
    EM->>EM: render, suppression check
    EM-->>C: OTP email via Resend

    Note over C,EM: Verify
    C->>GW: POST /v1/auth/verify-email {email, code}
    GW->>ID: VerifyEmail
    ID->>R: GETDEL otp:signup:{hash} + attempts
    alt code invalid or attempts exhausted
        ID-->>C: 400 (code destroyed after 5 attempts)
    else valid
        ID->>PG: users.status = active
        ID->>PG: INSERT sessions, refresh_tokens(hash)
        ID->>PG: INSERT outbox (UserVerified)
        ID-->>C: 200 access_token (10m) + refresh cookie
    end

    Note over C,EM: Login with MFA
    C->>GW: POST /v1/auth/login
    GW->>ID: Login
    ID->>R: check lockout
    ID->>PG: fetch credential
    ID->>ID: Argon2id verify (dummy verify if user absent)
    alt failure
        ID->>R: increment counters
        ID->>PG: outbox (LoginFailed)
        ID-->>C: 401 generic
    else MFA enrolled
        ID-->>C: 200 mfa_required + mfa_token (5 min)
        C->>ID: POST /v1/auth/mfa/verify {totp}
        ID->>ID: verify TOTP, reject replayed counter
    end
    ID->>PG: INSERT sessions + refresh_tokens + outbox(UserLoggedIn)
    ID-->>C: access_token + refresh cookie
```

---

## 15.3 Token refresh and reuse detection

```mermaid
flowchart TD
    A["Client presents refresh token"] --> B["SELECT by sha256 FOR UPDATE"]
    B --> C{"Found?"}
    C -- No --> Z1["401 + log AuthAnomaly"]
    C -- Yes --> D{"revoked?"}
    D -- Yes --> Z1
    D -- No --> E{"used_at set?"}
    E -- "Yes = REUSE" --> F["Revoke entire family"]
    F --> G["Emit RefreshTokenReuseDetected"]
    G --> H["Page on-call + notify user"]
    H --> Z1
    E -- No --> I{"expired?"}
    I -- Yes --> Z1
    I -- No --> J["Mark used_at, insert child token"]
    J --> K["Issue new access token (10 min)"]
    K --> L["200 + rotated refresh cookie"]
```

---

## 15.4 Authorization flow

```mermaid
flowchart TD
    A["Request with access token"] --> B["Gateway: verify signature, exp, iss, aud, alg"]
    B --> C{"Valid?"}
    C -- No --> D["401"]
    C -- Yes --> E["Redis: denylist sid / user not_before"]
    E --> F{"Denied?"}
    F -- Yes --> D
    F -- No --> G["Build Principal: sub, roles, scp, amr, sid"]
    G --> H{"Route in token scope?"}
    H -- No --> I["403"]
    H -- Yes --> J["Service: RequirePermission(action)"]
    J --> K["Load perms: perms:{user}:{version} (Redis 5m)"]
    K --> L{"Explicit deny?"}
    L -- Yes --> I
    L -- No --> M{"Permission granted?"}
    M -- No --> I
    M -- Yes --> N{"Step-up required?"}
    N -- "Yes and amr insufficient" --> O["401 reauth_required"]
    N -- No --> P["Repository: query WITH ownership predicate"]
    P --> Q{"Rows affected > 0?"}
    Q -- No --> R["404 (never confirm existence)"]
    Q -- Yes --> S["Execute + audit if sensitive"]
```

---

## 15.5 API request lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant CF as Cloudflare
    participant LB as Envoy
    participant GW as Gateway
    participant R as Redis
    participant SVC as Domain service
    participant PG as Postgres
    participant OB as Outbox relay
    participant N as NATS

    C->>CF: HTTPS request
    CF->>CF: WAF, bot score, edge rate limit
    CF->>LB: forward
    LB->>LB: TLS, route, timeout budget
    LB->>GW: HTTP/2
    GW->>GW: request_id + traceparent
    GW->>R: rate limit check (sliding window)
    alt over limit
        GW-->>C: 429 + Retry-After
    end
    GW->>GW: verify token, build principal
    GW->>R: denylist check
    GW->>GW: validate body, check Idempotency-Key
    GW->>SVC: gRPC over mTLS, deadline propagated
    SVC->>SVC: authorize action
    SVC->>PG: BEGIN
    SVC->>PG: business write
    SVC->>PG: INSERT outbox_events
    SVC->>PG: COMMIT
    SVC-->>GW: response
    GW-->>C: 200 + X-Request-Id
    OB->>PG: SELECT unpublished FOR UPDATE SKIP LOCKED
    OB->>N: publish
    OB->>PG: mark published
```

---

## 15.6 Webhook lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant P as Provider (Resend)
    participant WG as Webhook Gateway
    participant R as Redis
    participant PG as Postgres
    participant N as NATS
    participant W as Consumer worker

    P->>WG: POST /v1/webhooks/resend (svix headers)
    WG->>WG: read RAW body (do not parse yet)
    WG->>WG: |now - svix-timestamp| <= 5 min?
    alt outside replay window
        WG-->>P: 400
    end
    WG->>WG: HMAC-SHA256 constant-time compare (all keys)
    alt signature invalid
        WG-->>P: 401 + metric webhook_signature_failed
    end
    WG->>R: SETNX webhook:resend:{svix-id}
    alt duplicate
        WG-->>P: 200 already processed
    end
    WG->>PG: INSERT webhook_events (pending)
    WG-->>P: 202 (< 200 ms total)
    WG->>N: publish ari.webhook.received
    N->>W: deliver
    W->>PG: guarded UPDATE email_messages (no terminal downgrade)
    alt hard bounce or complaint
        W->>PG: INSERT email_suppressions
        W->>N: EmailBounced / EmailComplained
    end
    W->>PG: mark webhook_events processed
```

---

## 15.7 Email flow (Resend)

```mermaid
flowchart TB
    A["Domain action, e.g. signup"] --> B["TRANSACTION: domain row + outbox EmailRequested"]
    B --> C["Outbox relay"]
    C --> D{{"NATS ari.email.requested"}}
    D --> E["Email worker"]
    E --> F{"Idempotency key seen?"}
    F -- Yes --> G["Drop"]
    F -- No --> H{"Suppressed?"}
    H -- Yes --> I["status=suppressed, no send"]
    H -- No --> J["Render MJML template + locale"]
    J --> K["INSERT email_messages queued"]
    K --> L["POST api.resend.com/emails + Idempotency-Key"]
    L --> M{"Result"}
    M -- "2xx" --> N["status=sent, store provider_id"]
    M -- "429 / 5xx / timeout" --> O["Retry 1s,4s,16s,64s,256s"]
    O --> P{"5 attempts?"}
    P -- No --> L
    P -- Yes --> Q["DLQ + alert"]
    M -- "422 / 403" --> R["Permanent fail, no retry, alert"]
    N --> S["Resend delivers"]
    S --> T["Webhook: sent / delivered / bounced / complained"]
    T --> U["Update status timeline"]
    U --> V{"bounce or complaint?"}
    V -- Yes --> W["Suppression list, permanent"]
    V -- No --> X["Done"]
    N -.-> Y["Reconcile cron: GET /emails/{id} if no terminal event in 1h"]
```

---

## 15.8 Event bus architecture

```mermaid
flowchart LR
    subgraph producers["Producers (all via outbox)"]
        P1["Identity"]
        P2["User"]
        P3["Voice Agent"]
        P4["Execution"]
        P5["Webhook GW"]
    end

    subgraph relay["Outbox relay"]
        OR["SELECT unpublished FOR UPDATE SKIP LOCKED, LISTEN/NOTIFY + 200ms poll"]
    end

    subgraph bus["NATS JetStream"]
        S1{{"ari.user.*"}}
        S2{{"ari.voice.*"}}
        S3{{"ari.execution.*"}}
        S4{{"ari.email.*"}}
        S5{{"ari.notification.*"}}
        DLQ{{"*.dlq"}}
    end

    subgraph consumers["Consumers (idempotent, ack after success)"]
        C1["Email Service"]
        C2["Notification Service"]
        C3["Audit Service"]
        C4["Analytics"]
        C5["Search Indexer"]
        C6["Session deny-list updater"]
    end

    P1 --> OR
    P2 --> OR
    P3 --> OR
    P4 --> OR
    P5 --> OR
    OR --> S1
    OR --> S2
    OR --> S3
    OR --> S4
    OR --> S5

    S1 --> C1
    S1 --> C3
    S1 --> C4
    S1 --> C6
    S2 --> C4
    S2 --> C5
    S3 --> C2
    S3 --> C4
    S4 --> C4
    S5 --> C4

    C1 -. "5 failed attempts" .-> DLQ
    C2 -. "5 failed attempts" .-> DLQ
    DLQ --> ALERT["Alert + manual replay"]
```

---

## 15.9 Queue processing architecture

```mermaid
flowchart TB
    subgraph enqueue["Enqueue (transactional)"]
        A["Service transaction"] --> B["river.Insert in the SAME tx"]
        B --> C[("river_job table")]
    end

    subgraph workers["Worker pools"]
        W1["email.transactional c=20"]
        W2["notification.critical c=30"]
        W3["execution.tasks c=50"]
        W4["ai.inference c=4 GPU"]
    end

    C --> W1
    C --> W2
    C --> W3
    C --> W4

    W3 --> D{"Step outcome"}
    D -- success --> E["Mark step completed, next step"]
    D -- "transient error" --> F["Backoff with full jitter"]
    F --> G{"attempt < max?"}
    G -- Yes --> W3
    G -- No --> H[("DLQ")]
    D -- "permanent error" --> H
    H --> I["Alert + admin replay endpoint"]

    subgraph scaling["KEDA"]
        M["oldest_job_age_seconds > 30"] --> N["scale up fast, down slow"]
    end
    C -.-> M
    N -.-> workers
```

**Today:** `RPush` / `BLPop` on a Redis list — at-most-once, no ack, no retry, no DLQ; a crashed worker silently loses the task.

---

## 15.10 Notification pipeline

```mermaid
flowchart TB
    A{{"Domain event"}} --> B["Notification Router"]
    B --> C["Map event to notification type"]
    C --> D["Resolve recipients"]
    D --> E["Load preferences, quiet hours, locale, timezone"]
    E --> F{"Dedupe key exists?"}
    F -- Yes --> G["Drop"]
    F -- No --> H{"Priority"}
    H -- critical --> I["Send now, bypass quiet hours"]
    H -- "high / normal / low" --> J{"In quiet hours?"}
    J -- Yes --> K["Defer to next allowed window"]
    J -- No --> L{"Digest mode?"}
    L -- immediate --> I
    L -- "hourly / daily / weekly" --> M["Park for digest worker"]
    I --> N{"Per-user rate cap exceeded?"}
    N -- Yes --> M
    N -- No --> O["Fan out to channels"]
    O --> P["in_app: INSERT + SSE publish"]
    O --> Q["push: APNs / FCM"]
    O --> R["email: EmailRequested to §6"]
    O --> S["sms: critical only"]
    P --> T[("notification_deliveries")]
    Q --> T
    R --> T
    S --> T
    Q --> U{"Token invalid?"}
    U -- Yes --> V["Delete token, fall back to email"]
```

---

## 15.11 Database architecture

```mermaid
erDiagram
    users ||--o| user_credentials : has
    users ||--o{ sessions : owns
    sessions ||--o{ refresh_tokens : "rotates within family"
    users ||--o{ user_roles : assigned
    roles ||--o{ user_roles : grants
    roles ||--o{ role_permissions : contains
    users ||--o{ devices : registers
    devices ||--o{ permissions_state : declares
    users ||--o| user_voice_profiles : enrolls
    users ||--o{ voice_sessions : starts
    voice_sessions ||--o{ voice_turns : contains
    voice_sessions ||--o{ voice_events : emits
    voice_sessions ||--o{ execution_tasks : triggers
    execution_tasks ||--o{ execution_steps : "resumable steps"
    users ||--o{ user_goals : sets
    users ||--o{ user_preferences : configures
    users ||--o{ user_integrations : connects
    users ||--o{ agent_memory : accumulates
    users ||--o{ interaction_logs : generates
    users ||--o{ notifications : receives
    notifications ||--o{ notification_deliveries : "per channel"
    users ||--o{ email_messages : addressed
    email_messages ||--o{ webhook_events : "status via"
    users ||--o{ audit_log : "actor of"
    outbox_events }o--|| users : "aggregate ref"
```

```mermaid
flowchart TB
    subgraph app["Application"]
        A1["Gateway pool"]
        A2["Identity pool"]
        A3["Worker pool"]
        A4["Analytics pool"]
    end
    PB["PgBouncer (transaction mode)"]
    A1 --> PB
    A2 --> PB
    A3 --> PB
    A4 --> PB
    PB --> PRI[("Primary: all writes, read-after-write")]
    PRI -- streaming --> RR1[("Replica 1: dashboards, history")]
    PRI -- streaming --> RR2[("Replica 2: analytics, backup source")]
    PRI --> WAL["WAL archive to object storage"]
    WAL --> PITR["PITR window 30 days"]
    RR2 --> BK["pgBackRest nightly full + monthly archive"]
    BK --> XR[("Cross-region, Object Lock")]
    BK --> VER["Daily restore verification job"]
```

---

## 15.12 Deployment architecture

```mermaid
flowchart TB
    subgraph dev["Developer"]
        D1["Feature branch"] --> D2["Pull request"]
    end
    subgraph ci["GitHub Actions"]
        C1["lint + typecheck"] --> C2["unit + integration (testcontainers)"]
        C2 --> C3["migration up/down/up"]
        C3 --> C4["gitleaks, govulncheck, pip-audit, semgrep"]
        C4 --> C5["build distroless + SBOM + Cosign"]
        C5 --> C6["Trivy scan"]
        C6 --> C7["ephemeral preview env + smoke"]
    end
    subgraph reg["Registry"]
        RG[("GHCR, immutable digests")]
    end
    subgraph gitops["Argo CD"]
        G1["staging: auto-sync"]
        G2["production: manual approval"]
    end
    subgraph prod["Production cluster"]
        M["pre-sync Job: migrations (expand only)"]
        CAN["Argo Rollouts canary 5 → 25 → 50 → 100"]
        AN["Analysis: error rate, P95, 4xx/5xx"]
        RB["Auto-rollback on breach"]
        POOLS["Node pools: general | GPU | memory-opt | spot"]
    end
    D2 --> C1
    C7 --> RG
    RG --> G1
    G1 --> E2E["Playwright e2e + k6 load"]
    E2E --> G2
    G2 --> M --> CAN --> AN
    AN -- fail --> RB
    AN -- pass --> POOLS
```

---

## 15.13 Observability stack

```mermaid
flowchart LR
    subgraph svc["Instrumented services"]
        S1["Gateway"]
        S2["Identity"]
        S3["Voice Agent"]
        S4["Execution Worker"]
        S5["Email / Notification"]
    end
    OC["OTel Collector: batch, tail sampling, redaction"]
    S1 --> OC
    S2 --> OC
    S3 --> OC
    S4 --> OC
    S5 --> OC
    OC --> PR[("Prometheus / Mimir")]
    OC --> LK[("Loki")]
    OC --> TP[("Tempo")]
    OC --> CH[("ClickHouse")]
    PR --> GF["Grafana"]
    LK --> GF
    TP --> GF
    CH --> GF
    PR --> AM["Alertmanager"]
    AM --> PD["PagerDuty: page"]
    AM --> SL["Slack: info"]
    AM --> JR["Jira: ticket"]
    GF --> DASH["Dashboards: service, voice, auth, queue, business, infra"]
    SNT["Sentry / GlitchTip"] --> GF
    S1 -.errors.-> SNT
    S3 -.errors.-> SNT
```

---

## 15.14 Security layers

```mermaid
flowchart TB
    L1["L1 Edge: DDoS, WAF, bot mgmt, TLS 1.3, geo"]
    L2["L2 Network: private VPC, NetworkPolicy default-deny, no public IPs"]
    L3["L3 Transport: mTLS internal, HSTS preload external"]
    L4["L4 Identity: 10-min access tokens, rotating refresh, MFA, SPIFFE"]
    L5["L5 Authorization: RBAC, ownership predicates, deny-by-default"]
    L6["L6 Application: validation, output encoding, parameterized SQL, CSP"]
    L7["L7 Data: encryption at rest, envelope encryption for voiceprints"]
    L8["L8 Audit: append-only, hash-chained, immutable"]
    L9["L9 Detection: anomaly detection, security metrics, IR runbooks"]
    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7 --> L8 --> L9
    ATT["Attacker"] -.-> L1
    L9 -.feeds.-> L1
```

```mermaid
flowchart LR
    subgraph zt["Zero-trust service call"]
        A["Caller pod"] --> B["Mesh sidecar: mTLS, SPIFFE ID"]
        B --> C["Service JWT: aud=target, 5 min, scoped"]
        C --> D["User assertion: signed original principal"]
        D --> E["Callee: verify all three, then authorize the USER"]
    end
```

---

## 15.15 Complete end-to-end voice request flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant D as Device
    participant RT as Voice Realtime Edge
    participant AG as Voice Agent
    participant R as Redis
    participant PG as Postgres
    participant Q as River queue
    participant EX as Execution Worker
    participant N as NATS
    participant NT as Notification
    participant SPA as Dashboard SSE

    U->>D: "Hey Ari, send Alice a message"
    D->>D: on-device wake detection (120 ms)
    D->>RT: WS connect, token in Sec-WebSocket-Protocol
    RT->>RT: verify token, check session quota
    D->>RT: stream PCM frames
    RT->>AG: gRPC stream
    AG->>AG: DSP noise + echo (60 ms)
    AG->>R: GET voicecfg:{user} thresholds
    AG->>AG: speaker verification (150 ms)
    alt speaker score below threshold
        AG->>PG: outbox VoiceSpeakerRejected (audited)
        AG-->>D: "I did not recognize your voice"
    end
    AG->>AG: streaming ASR (350 ms)
    AG->>AG: intent classify, patterns first (80 ms)
    alt trigger command fast path
        AG-->>D: immediate TTS, no queue
    else multi-step plan
        AG->>AG: planner LLM (300 ms)
        AG->>AG: validate plan against tool allowlist
        AG->>PG: BEGIN
        AG->>PG: INSERT execution_tasks + execution_steps
        AG->>Q: river.Insert IN THE SAME TX
        AG->>PG: INSERT outbox (TaskQueued)
        AG->>PG: COMMIT
        AG-->>D: TTS first chunk "Sending that now" (100 ms)
        Note over U,D: first audible byte at ~1.2 s
    end
    Q->>EX: dequeue with lease
    EX->>EX: re-authorize each step against the ORIGINAL principal
    loop each pending step
        EX->>AG: execute action (idempotency key per step)
        AG-->>EX: result
        EX->>PG: UPDATE execution_steps completed
        EX->>N: execution.step_completed
        N->>SPA: SSE progress
    end
    EX->>PG: task completed + outbox
    N->>NT: execution.task_completed
    NT->>NT: preferences, quiet hours, dedupe
    NT->>SPA: in-app notification
    alt client disconnected
        NT->>NT: push, then email fallback
    end
```
