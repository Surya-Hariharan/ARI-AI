# ARI Free-Tier Infrastructure & Technology Stack

This document defines the zero-cost / free-tier open-source infrastructure blueprint for building, deploying, and maintaining the ARI ecosystem.

---

## 🛠️ Technology Stack & Service Matrix

| Section | Free Tier Recommendation | Status / License | Notes |
| :--- | :--- | :--- | :--- |
| **Mobile App** | **Flutter** | ✅ Completely Free & Open Source | Multi-platform client for Android/iOS with native overlay support |
| **Backend API** | **FastAPI** | ✅ Free & Open Source | Asynchronous high-performance Python framework |
| **Authentication** | **Better Auth** | ✅ Free & Open Source | Self-hosted authentication engine with JWT & OAuth |
| **OAuth Providers** | **Google, GitHub** | ✅ Free | Standard OAuth2 authentication providers |
| **Database** | **PostgreSQL** | ✅ Free & Open Source | Relational database (Supabase / Self-hosted) |
| **ORM & Migrations** | **SQLAlchemy + Alembic** | ✅ Free | Declarative ORM & database version control |
| **Vector Database** | **pgvector** | ✅ Free & Open Source | Vector similarity search inside PostgreSQL |
| **Cache & Queue** | **Redis** | ✅ Free & Open Source | In-memory pub/sub, caching, and task queue broker |
| **Object Storage** | **Cloudflare R2** | ✅ Generous Free Tier | S3-compatible zero-egress blob storage |
| **Transactional Email** | **Resend** | ✅ Free Tier | OTP, verification, and password resets |
| **Marketing Email** | **MailerLite** | ✅ Free Tier | Newsletter & broadcast management |
| **Push Notifications** | **Firebase Cloud Messaging (FCM)** | ✅ Free | Multi-platform background push notifications |
| **Crash Reporting** | **Firebase Crashlytics** | ✅ Free | Real-time crash diagnostics and symbolication |
| **Analytics** | **PostHog** | ✅ Free Tier / Self-Hostable | Product analytics, event tracking, & session recording |
| **Error Tracking** | **Sentry** | ✅ Free Developer Tier | Production exception monitoring and stack tracing |
| **Background Jobs** | **Celery + Redis** | ✅ Free | Distributed task processing engine |
| **API Documentation** | **FastAPI OpenAPI (Swagger/Redoc)**| ✅ Free | Auto-generated interactive API docs |
| **Containerization** | **Docker** | ✅ Free | Containerized deployments for microservices |
| **CI/CD** | **GitHub Actions** | ✅ Free | Automated build, test, and release pipelines |
| **Monitoring** | **Prometheus + Grafana** | ✅ Free & Open Source | System metrics, telemetry dashboards, & alerts |
| **Speech-to-Text (STT)** | **OpenAI Whisper (Local)** | ✅ Free (Local Execution) | Low-latency offline audio transcription |
| **Text-to-Speech (TTS)** | **Android / iOS Native TTS** | ✅ Free | On-device zero-latency speech synthesis |
| **Local AI Models** | **Ollama** | ✅ Free | Local LLM execution (Llama 3, Mistral, Gemma) |
| **Secrets & Keys** | **OS Keychain / Keystore** | ✅ Free | On-device hardware-backed key storage |

---

## 🏗️ Architecture Blueprint

```text
[ Client (Flutter / Web) ]
        │
        ▼ (HTTPS / WSS)
┌────────────────────────────────────────────────────────┐
│  FastAPI Backend (Self-Hosted Docker)                   │
│  • OpenAPI Specification                               │
│  • Better Auth (JWT & OAuth)                           │
│  • SQLAlchemy + Alembic ORM                            │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  PostgreSQL + pgvector       │  │  Redis Cache & Celery Broker │
│  • Core Data & Vector Search │  │  • Session Cache & Job Queue │
└──────────────────────────────┘  └──────────────────────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  Cloudflare R2 Storage       │  │  OpenAI Whisper / Ollama     │
│  • Object Storage (Zero-Cost)│  │  • Local STT & Local LLMs    │
└──────────────────────────────┘  └──────────────────────────────┘
```
