# ARI Free-Tier Infrastructure & Authentication Framework

This document defines the zero-cost / free-tier open-source infrastructure blueprint and authentication matrix for building, deploying, and maintaining the ARI ecosystem.

---

## 🔐 Authentication & Identity Responsibility Matrix

| Responsibility | Recommended Tool | Free-Tier Advantage & Architecture |
| :--- | :--- | :--- |
| **Authentication Core** | **Firebase Authentication** | ✅ Generous free tier, seamless Flutter & Web integration, built-in email/password, OAuth2, and session token verification |
| **OTP & Verification Email Delivery** | **Resend** | ✅ Excellent transactional email API with a high-deliverability free tier for custom-branded OTP emails |
| **OAuth Providers** | **Google, GitHub, Apple** | ✅ Natively supported by Firebase Authentication & Gateway JWT validation |
| **Password Reset Emails** | **Firebase Auth (Built-in) / Resend** | ✅ Built-in for rapid setup, or custom via Resend for full brand control |

---

## 🛠️ Complete Technology Stack & Service Matrix

| Section | Recommended Tool | License / Tier | Why / Architectural Role |
| :--- | :--- | :--- | :--- |
| **Mobile Client** | **Flutter** | ✅ Free & Open Source | Native Android/iOS client with background mic listening & window overlay support |
| **Frontend Dashboard** | **React 18 + Vite** | ✅ Free & Open Source | Apple-inspired glassmorphic UI for live session monitoring & voice fine-tuning |
| **Backend API** | **FastAPI (Python)** | ✅ Free & Open Source | High-performance asynchronous AI orchestration engine |
| **API Gateway** | **Go (Fiber)** | ✅ Free & Open Source | High-concurrency WebSockets, rate limiting, and JWT token validation |
| **Authentication** | **Firebase Auth / Better Auth** | ✅ Free Tier | Hybrid multi-provider auth supporting OAuth, OTP, and JWT tokens |
| **OAuth Providers** | **Google, GitHub, Apple** | ✅ Free | Standard OAuth2 federated single sign-on |
| **Database** | **PostgreSQL** | ✅ Free & Open Source | Relational database hosted via Supabase / Docker |
| **ORM & Versioning** | **SQLAlchemy + Alembic** | ✅ Free & Open Source | Python ORM & schema migration management |
| **Vector Database** | **pgvector** | ✅ Free & Open Source | Integrated vector similarity search inside PostgreSQL |
| **Cache & Task Queue** | **Redis** | ✅ Free & Open Source | High-speed pub/sub message broker & session store |
| **Object Storage** | **Cloudflare R2** | ✅ Generous Free Tier | S3-compatible zero-egress blob storage for audio & models |
| **OTP / Verification** | **Resend** | ✅ Free Tier | High-deliverability transactional email service |
| **Push Notifications** | **Firebase Cloud Messaging (FCM)** | ✅ Free | Real-time multi-platform background push notifications |
| **Crash Diagnostics** | **Firebase Crashlytics** | ✅ Free | Real-time crash diagnostics and symbolication |
| **Analytics** | **PostHog** | ✅ Free Tier / Self-Hostable | Event tracking, funnel analysis, and telemetry dashboard |
| **Error Tracking** | **Sentry** | ✅ Free Developer Tier | Production exception capture and stack tracing |
| **Background Jobs** | **Celery + Redis** | ✅ Free | Asynchronous distributed worker processing |
| **API Documentation** | **FastAPI OpenAPI** | ✅ Free | Auto-generated interactive Swagger & Redoc documentation |
| **Containerization** | **Docker & Docker Compose** | ✅ Free | Unified microservice orchestration spec |
| **CI/CD** | **GitHub Actions** | ✅ Free | Automated linting, testing, and container deployment pipelines |
| **Monitoring** | **Prometheus + Grafana** | ✅ Free & Open Source | System metrics, latency tracking, & service health alerts |
| **Speech-to-Text (STT)** | **OpenAI Whisper (Local)** | ✅ Free (Local Execution) | Offline low-latency speech transcription |
| **Text-to-Speech (TTS)** | **Native TTS / Piper** | ✅ Free | Zero-cost speech synthesis |
| **Local AI Models** | **Ollama** | ✅ Free | On-device / local LLM execution (Llama 3, Mistral, Gemma) |
| **Secrets & Keys** | **OS Keychain / Keystore** | ✅ Free | On-device hardware-backed key storage |

---

## 🏗️ End-to-End Authentication & Service Flow

```text
[ User / Flutter App / Web UI ]
        │
        ▼ (Authenticate via Firebase / Resend OTP)
┌────────────────────────────────────────────────────────┐
│  API Gateway (Go Fiber)                                │
│  • Firebase Token Verification & JWT Session Signer    │
│  • Rate Limiting & WebSockets Ingestion                │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               ▼ (Redis Pub/Sub)         ▼ (HTTP API)
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  FastAPI Agent Service       │  │  Go Execution Worker         │
│  • Whisper ASR & NLU Intent  │  │  • Asynchronous Background   │
│  • Multi-step LLM Planning   │  │    Job Processor             │
│  • Resend Email Integration  │  │                              │
└──────────────┬───────────────┘  └──────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase) + pgvector                      │
│  • Users, Sessions, Devices, Voice Profiles, Telemetry │
└────────────────────────────────────────────────────────┘
```
