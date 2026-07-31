# Self-Hosted-First Stack: Target vs. Current, and Migration Plan

Status: **planning only — no code changed by this doc.**

## Principle

Every technology choice for ARI defaults to: self-hosted, open-source, vendor-independent,
production-ready even for a single user, horizontally scalable without a rewrite,
security-first, offline/local-first where practical.

## Target baseline stack

| Layer | Target |
|---|---|
| Mobile | Flutter |
| Backend (AI/voice pipeline) | FastAPI |
| API Gateway | FastAPI + Caddy (or Nginx) |
| Authentication | Self-hosted auth service |
| Password Hashing | Argon2id |
| Auth Tokens | JWT + refresh tokens, with rotation |
| Database | PostgreSQL (self-hosted) |
| Vector Search | pgvector |
| Cache / Queue | Redis |
| Object Storage | MinIO (dev/self-hosted), Cloudflare R2 later |
| Email | Resend (delivery only, not auth) |
| Background Jobs | Celery + Redis |
| Real-time | WebSockets |
| AI Models | Ollama + cloud providers via adapters |
| Containerization | Docker Compose (dev), Kubernetes later |
| Monitoring | Prometheus + Grafana |
| Logging | Loki + Grafana |
| Error Tracking | Sentry |
| CI/CD | GitHub Actions |

## What's actually in the repo today

| Layer | Current reality | Gap vs. target |
|---|---|---|
| Mobile | None — `frontend/` is a Vite + React + MUI web app | Flutter app doesn't exist yet |
| Backend gateway | Go + Fiber (`backend/gateway`) — `auth.go`, `auth_helpers.go`, `auth_middleware.go`, `user_handlers.go`, `voice_handlers.go` | Target names FastAPI, not Go. Open decision — see below |
| AI/voice backend | Python FastAPI (`backend/agent`) — ASR, TTS, wake word, RAG, planner, mood, intent, context engines | Matches target already |
| Execution service | Go (`backend/execution`) — separate service, not in target table at all | Undecided how this maps to the target (Celery worker? kept as-is?) |
| Authentication | **Already self-hosted**, in `backend/gateway/auth.go`: signup → OTP → verify → login, forgot-password, update-password, JWT (HS256) via `auth_middleware.go` | Close to target already. Password hashing is **bcrypt**, not Argon2id. No visible refresh-token rotation, device management, session management, RBAC, or MFA yet |
| Firebase Authentication | Referenced only in `.env.example` (`FIREBASE_*`, `VITE_FIREBASE_*`) — **no Firebase SDK is imported or used anywhere in `backend/` or `frontend/src/`** | Not actually a real dependency — just unused env scaffolding from an earlier plan (commit `9c13f30`). Safe to delete once confirmed unused, no rip-out needed |
| Database | PostgreSQL, but **hosted Supabase** (`DATABASE_URL` → `*.pooler.supabase.com`), accessed directly via `pgx` (no Supabase JS SDK / Supabase Auth in use) | Because access is already plain Postgres over `pgx`, moving to self-hosted Postgres should mostly be a connection-string change, not a rewrite. RLS policies (`supabase/migrations/007_rls_policies.sql`) are standard Postgres RLS and will work on self-hosted Postgres too |
| Vector search | Not found in migrations/code yet | pgvector not yet introduced |
| Cache / Queue | Redis already used by all three backend services in `docker-compose.yml` | Matches target already |
| Object storage | Not found | MinIO/R2 not yet introduced |
| Email | `.env.example` has `RESEND_API_KEY` / `RESEND_FROM_EMAIL`; OTP flow in `auth.go` generates OTPs, delivery path not confirmed in this pass | Likely close to target, needs verification that Resend is actually called for OTP delivery |
| Background jobs | No Celery; `backend/execution` (Go) may be filling this role | Needs a decision, not a default "add Celery" |
| Monitoring / Logging / Error tracking | None present (no Prometheus, Grafana, Loki, or Sentry config found) | Fully greenfield |
| CI/CD | Not inspected in this pass | TBD |
| Containerization | `docker-compose.yml` already covers gateway, agent, execution, redis, frontend | Matches target for dev; no Caddy/Nginx reverse proxy yet, no k8s |

## Open decisions before migrating (need your call, not an assumption)

1. **Go gateway vs. FastAPI gateway.** The gateway is already a working, self-hosted, JWT-based auth service in Go/Fiber — functionally aligned with the "self-hosted auth" principle even though it's not FastAPI. Rewriting it in FastAPI is a large, high-risk effort for a service that already meets the vendor-independence goal. Worth deciding explicitly: keep Go (update the stack table to reflect reality) vs. rewrite in FastAPI (for one-language-backend consistency).
2. **`backend/execution` (Go).** Doesn't map to anything in the target table. Is it meant to become a Celery worker, stay as a Go service, or something else?
3. **Supabase-hosted Postgres → self-hosted Postgres.** Low technical risk (plain `pgx`/SQL, no Supabase-specific SDK features in use), but it's an infra/ops decision (where does the DB get hosted — your own VPS/Docker volume, and what's the backup strategy) rather than a code change.
4. **Firebase env vars.** Confirm these are genuinely dead (no plan to use them for the future Flutter app) before deleting from `.env.example`/`.env`.

## Suggested migration order (once decisions above are made)

1. Delete unused Firebase env vars (zero risk — nothing references them).
2. Swap bcrypt → Argon2id in `auth_helpers.go`; add refresh-token rotation, device/session tracking to the existing auth flow (extends what's already there, doesn't replace it).
3. Point `DATABASE_URL` at a self-hosted Postgres instance (add a `postgres` service to `docker-compose.yml`); re-run `supabase/migrations/*.sql` against it; confirm RLS policies still behave as expected outside Supabase's dashboard tooling.
4. Add `pgvector` extension + schema once vector search is actually needed.
5. Introduce MinIO in `docker-compose.yml` when object storage is first needed (e.g. voice recordings, user avatars).
6. Add Prometheus + Grafana + Loki + Sentry once there's something worth observing in a deployed environment (not needed for local dev).
7. Flutter mobile app is a separate, large workstream — scope it independently when ready to start.

## Non-goals of this doc

This is a planning/reference document only. No auth code, env files, docker-compose, or migrations were changed as part of writing it.
