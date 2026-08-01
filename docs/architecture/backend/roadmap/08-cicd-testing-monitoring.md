# CI/CD, Testing, and Monitoring Rollouts

---

# 1. CI/CD roadmap

Built incrementally so that each stage is useful on its own. There is no `.github/` directory today, so stage 1 is genuinely the first line.

## Stage 1 — Phase 1, week 1: make it green

`.github/workflows/ci.yml` on every PR:

```yaml
name: CI
on: [pull_request, push]
concurrency: { group: "${{ github.ref }}", cancel-in-progress: true }

jobs:
  go:
    runs-on: ubuntu-latest
    strategy: { matrix: { service: [gateway, execution] } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22', cache-dependency-path: backend/${{ matrix.service }}/go.sum }
      - run: go vet ./...
        working-directory: backend/${{ matrix.service }}
      - uses: golangci/golangci-lint-action@v6
        with: { working-directory: backend/${{ matrix.service }} }
      - run: go build ./...
        working-directory: backend/${{ matrix.service }}
      - run: go test -race -coverprofile=cover.out ./...
        working-directory: backend/${{ matrix.service }}
      - run: go tool cover -func=cover.out | tail -1

  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11', cache: 'pip' }
      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
      - run: ruff check backend/agent
      - run: mypy backend/agent --ignore-missing-imports
      - run: pytest backend/agent/tests -m "not slow"     # ML tests run nightly

  frontend:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, "npm ci", "npm run lint", "npx tsc --noEmit", "npm run test"]
```

`-race` matters here specifically: the current code has concurrent patterns (`sync.Map`, goroutine email sends) that a race detector would exercise on day one.

Python note: `torch` is ~2 GB. Cache aggressively, and split ML-dependent tests behind a `slow` marker running nightly, or CI becomes the bottleneck that makes people stop running it.

## Stage 2 — Phase 1, week 2: migrations and security

```yaml
  migrations:
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: test }, ports: ['5432:5432'],
                  options: --health-cmd pg_isready --health-interval 5s }
    steps:
      - run: migrate -path migrations -database "$DB" up
      - run: migrate -path migrations -database "$DB" down -all
      - run: migrate -path migrations -database "$DB" up      # up→down→up must be clean
      - run: psql "$DB" -f scripts/verify_grants.sql          # Phase 3 onward
      - run: psql "$DB" -f scripts/verify_schema_matches_code.sql

  security:
    steps:
      - uses: gitleaks/gitleaks-action@v2
      - run: govulncheck ./...
      - run: pip-audit -r backend/requirements.txt
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master
        with: { scan-type: fs, severity: 'CRITICAL,HIGH', exit-code: '1' }
```

`verify_schema_matches_code.sql` is the direct answer to the `execution_logs` defect: assert that every column the code references exists. Even a crude version (a list of expected columns per table, checked against `information_schema`) would have caught it.

## Stage 3 — Phase 4: integration testing

Testcontainers-backed integration job spinning Postgres + Redis (+ NATS from Phase 6), running the full suite including chaos and idempotency tests. Runs on PR; ~5–8 minutes.

## Stage 4 — Phase 5: build, sign, deploy

```yaml
  build:
    permissions: { contents: read, packages: write, id-token: write }
    steps:
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.sha }}
          cache-from: type=gha
          provenance: true
          sbom: true
      - uses: sigstore/cosign-installer@v3
      - run: cosign sign --yes ghcr.io/.../${{ matrix.service }}@${{ steps.build.outputs.digest }}
```

Deploy pipeline: merge to `main` → build + sign → Argo CD auto-syncs staging → e2e (Playwright) + load (k6) → manual approval → production canary.

## Release and versioning

Semantic versioning on tags; Conventional Commits driving a generated changelog; images tagged by both digest and version, deployed **by digest** (a tag can be moved; a digest cannot). Database migrations version independently of application versions, with a compatibility matrix documenting which app versions work against which schema version — that matrix is what makes a rollback decision fast at 3 a.m.

## Branch protection (enable at the end of Phase 1)

Required checks: all CI jobs green. One approving review; two for `backend/gateway/auth*` and anything under `migrations/`. No force-push to `main`. No admin bypass — an emergency bypass is how the Phase 1 investment quietly evaporates.

---

# 2. Testing roadmap

## 2.1 Rollout by phase

| Phase | Added | Target coverage |
|---|---|---|
| 0 | 3 hand-written integration tests (reset, BOLA, agent token) | — |
| 1 | Unit + integration harness; auth suite against current behaviour | 60% on auth |
| 2 | Token, session, OTP, rotation, reuse; auth security suite | 80% on identity |
| 3 | **Authorization matrix** (~150 cases); repository tests | 80% on repos |
| 4 | Chaos, idempotency, webhook, queue, email failure-mode tests | 70% overall |
| 5 | E2E (Playwright), load (k6), deploy/rollback drill, DR restore | — |
| 6 | Notification, event-consumer, MFA/OAuth tests | 75% overall |

## 2.2 Test types

**Unit** — pure logic, no I/O. Token minting/validation, password hashing, OTP generation, retry classification, permission evaluation, template rendering. Fast (<10 s for the suite) so they run on save.

**Integration** — real Postgres and Redis via testcontainers, no mocks for infrastructure. Repository queries (including the ownership predicates), migrations, outbox relay, queue enqueue/consume, session lifecycle. This tier catches the schema/code drift class of bug.

**API/contract** — full HTTP through the router: status codes, problem+json shape, headers, rate limits, idempotency replay. Plus OpenAPI contract tests asserting no field is removed or retyped without a version bump.

**Security** — a first-class suite, not an afterthought:
- Authn: `alg:none`, algorithm confusion, expired, wrong `aud`, wrong `iss`, tampered signature, replayed refresh.
- Authz: the matrix, with the "other user's object" case for every resource.
- Injection: SQL metacharacters in every string field, template injection, SSRF payloads against URL-accepting endpoints, prompt injection through voice text and RAG documents.
- Rate limits: burst tests asserting 429 with correct headers.
- Regression tests reproducing each of S-1, S-2, S-3, S-6 — they must fail against fixed code and pass against a deliberately reverted fix.

**Load (k6)** — steady state at expected peak, spike to 10×, soak for 2 h watching for leaks (the `pendingSignups` map is exactly what a soak test surfaces), and stress to find the breaking point *before* users do. Login is the interesting profile: Argon2id at 64 MiB is deliberately expensive, so verify the rate limiter engages before memory does.

**Chaos** — kill workers mid-task, kill the relay mid-publish, partition Redis, fail over the database, exhaust the connection pool, black-hole Resend. Each has an expected degradation; the test asserts the degradation is the expected one and not an outage.

**E2E (Playwright)** — signup→verify→login→voice command→result→logout; password reset; session revocation from a second device; refresh-token expiry and silent renewal.

**Voice-specific** — golden audio fixtures for wake detection (accept and reject sets), SIV with matched and mismatched speakers, ASR WER against a reference set, latency assertions against the §2.2 budget per stage, and degradation paths (Ollama down, ASR fails, TTS fails).

**Migration testing** — `up→down→up` on every PR, plus a *forward-compatibility* test: run the previous release's code against the new schema, which is what proves expand/contract actually works.

## 2.3 Standards

Table-driven tests; deterministic (no sleeps, no real clocks — inject a clock); isolated (each test owns its data, no shared fixtures that create ordering dependencies); named `Test<Unit>_<Scenario>_<Expectation>`. Every bug fix ships with the test that would have caught it — that rule is what converts a test suite from a cost into an asset.

---

# 3. Monitoring rollout

Introduced in the order that makes each stage immediately useful, rather than building the full stack before anything is observable.

## Stage 1 (Phase 1) — Structured logs

`log/slog` in Go, `structlog` in Python, JSON to stdout, mandatory fields (`ts`, `level`, `service`, `version`, `trace_id`, `request_id`, `user_id`, `msg`), and a redaction filter that drops known-sensitive keys before they are written. Value on day one: grep-able logs with correlation IDs, which is what you need to debug Phases 2–4.

## Stage 2 (Phase 1) — Health and basic metrics

Keep the existing `/health`, `/live`, `/ready` split — it is already correct — and fix the two asymmetries: the gateway fails readiness when `DB == nil` (it should fail *startup* in production), and the worker reports ready when `DB == nil` (it should fail readiness). Make readiness shallow: cache dependency status for a few seconds rather than pinging on every probe, or the probe becomes load. Add `/metrics` with RED metrics per route.

## Stage 3 (Phase 5) — Full OTel

Traces spanning SPA → gateway → agent → queue → worker, with context propagated through job payloads and outbox rows. The gateway already mints a request ID via `requestid.New()` and discards it at the first downstream call — propagating it is the cheapest observability win available and should land in Stage 1.

Tail-based sampling in the Collector: 100% of errors, 100% of auth flows, 100% of SLO-breaching requests, 1–5% baseline.

## Stage 4 (Phase 5) — Dashboards, SLOs, alerts

Six dashboards (service, voice pipeline, auth security, queues/events, business, infrastructure) with deploy markers overlaid — the fastest way to answer "did the deploy cause this."

Alerts are introduced in three waves, deliberately:
1. **Availability** — error rate, latency SLO burn, health-check failures.
2. **Saturation** — queue age, DLQ, consumer lag, connection pool, disk.
3. **Security** — auth failure spikes, refresh-token reuse (page on any occurrence), authz denial spikes, webhook signature failures.

Every page-severity alert requires a runbook before it is enabled, and must be **test-fired once** — an alert nobody has ever seen fire is an untested code path with a pager attached.

## Stage 5 (Phase 6) — Business and security analytics

DAU, commands per user, task success rate, wake accuracy, LLM cost per user, retention. Security: failed-login geography, impossible travel, new-device rates, lockout rates.

## Incident response

Severity ladder SEV1–SEV4 with defined response times. Every SEV1/SEV2 gets a blameless postmortem within 5 business days with an action item that has an owner and a date. Runbooks required before go-live: credential compromise, token-signing-key compromise, database failover, queue backlog, email delivery failure, DDoS, **voiceprint exposure** (highest severity — biometric data cannot be reissued), and rollback.

Error-budget policy: >50% consumed freezes risky changes; >100% triggers a feature freeze until reliability work restores it. Without the policy attached, SLOs are decoration.
