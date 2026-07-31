# ARI — Autonomous Reasoning Interface & Voice Assistant

<div align="center">
  <h3>Siri-Like Instant Voice Activation • Multi-Service Micro-Architecture • Fine-Tuning Control Suite</h3>
  <p>Real-Time Wakeword Engine • Low-Latency Voice Pipeline • Custom Voice Enrollment • Modern WebGL Dashboard</p>
</div>

---

## 🌟 Overview

**ARI (Autonomous Reasoning Interface)** is a high-performance, open-source AI voice assistant and agentic orchestration platform. Designed for Siri-like instant hands-free activation, ARI listens continuously for custom trigger words (*"Hey Ari"*), verifies the speaker's voiceprint in real-time, transcribes audio via local Whisper ASR, and executes multi-step LLM reasoning plans.

The system features an Apple-inspired Web UI dashboard for **logging**, **real-time session monitoring**, **voice profile enrollment**, and **fine-tuning** assistant sensitivity thresholds.

---

## 🏗️ Core Architecture & Microservices

```text
[ Hands-Free Mic / Web Client ]
               │
               ▼ (Hands-free Wakeword Detection: "Hey Ari")
┌────────────────────────────────────────────────────────┐
│  API Gateway (Go Fiber) — Port 8080                    │
│  • Real-time Audio Stream Ingestion & WebSockets      │
│  • JWT Auth & Device Session Management                │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               ▼ (Redis Pub/Sub)         ▼ (HTTP API)
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  Voice Agent Service (Python) │  │  Execution Worker (Go)       │
│  • DSP Noise Suppression     │  │  • Asynchronous Task Runner  │
│  • Speaker Verification (SIV)│  │  • System & API Integrations │
│  • Whisper ASR & Intent LLM  │  │  • Device Action Execution   │
│  • Multi-step Reasoning Plan │  │                              │
│  • Neural TTS Synthesis      │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘
```

---

## 📁 Repository Directory Structure

```text
ARI/
├── backend/
│   ├── agent/                      # Python FastAPI Cognitive Reasoning Engine
│   │   ├── wake_engine.py          # Hands-free Wakeword Detector ("Hey Ari")
│   │   ├── wake_engine_enhanced.py # High-precision Production Wakeword Engine
│   │   ├── dsp_engine.py           # Digital Signal Processing (Noise & Echo Cancellation)
│   │   ├── siv_service.py          # Speaker Identification & Voiceprint Verification
│   │   ├── asr_engine.py           # Automatic Speech Recognition (Whisper STT)
│   │   ├── intent_engine.py        # Intent Router & NLU Classifier
│   │   ├── planner_engine.py       # Multi-step LLM Task Planning & Reasoning
│   │   ├── rag_engine.py           # Retrieval-Augmented Memory Engine
│   │   ├── tts_engine.py           # Zero-latency Neural Text-to-Speech
│   │   ├── mood_engine.py          # Voice Tone, Formality & Persona Controller
│   │   └── main.py                 # FastAPI Application Server Entrypoint
│   ├── execution/                  # Go Asynchronous Task Runner
│   └── gateway/                    # Go Fiber API Gateway (WebSockets, Auth, OTP)
├── frontend/                       # React 18 + Vite + TypeScript Web Dashboard
│   ├── src/
│   │   ├── api/                    # Typed API Client & Gateway Wrappers
│   │   ├── app/
│   │   │   ├── components/         # WebGL SideRays, Navigation & Glass UI Components
│   │   │   ├── context/            # Auth & Voice Session React Context
│   │   │   ├── pages/
│   │   │   │   ├── AuthPage.tsx    # Luxury Authentication & Timezone Greetings
│   │   │   │   ├── VoiceSetup.tsx  # Voice Assistant Enrollment & Fine-Tuning Suite
│   │   │   │   ├── ControlDashboard.tsx # Live Voice Telemetry & Session Monitoring
│   │   │   │   ├── UserSecurity.tsx     # Device Permissions & Key Management
│   │   │   │   └── SystemOverview.tsx   # Latency & Microservice Health Metrics
│   │   │   └── App.tsx             # Application Router & Main Dashboard Layout
├── supabase/                       # Supabase / PostgreSQL Database Pipeline
│   ├── migrations/                 # Modular, non-circular migration scripts
│   │   ├── 001_extensions.sql      # PostgreSQL extensions (uuid-ossp, pgcrypto)
│   │   ├── 002_schema.sql          # Core tables (users, devices, voice_sessions, etc.)
│   │   ├── 003_functions.sql       # PL/pgSQL stored procedures
│   │   ├── 004_triggers.sql        # Automated timestamp update triggers
│   │   ├── 005_views.sql           # Active sessions & voice telemetry views
│   │   ├── 006_indexes.sql         # Performance indexes
│   │   └── 007_rls_policies.sql    # Tenant isolation Row Level Security
│   ├── scripts/                    # Migration execution runner (`run_migrations.js`)
│   └── seed/                       # Initial development seed data (`seed.sql`)
├── docs/                           # Architecture, API & Engineering Documentation
│   ├── README.md                   # Master Documentation Index
│   ├── DEVELOPMENT.md              # Local Development Setup & Migrations Guide
│   ├── guidelines.md               # Repository Hygiene & Engineering Standards
│   └── architecture/               # Architecture overviews & Free Tier Stack specs
├── shared/                         # Shared JSON schemas & cross-service types
├── docker-compose.yml              # Containerized multi-service deployment spec
└── .env.example                    # Environment variable configuration template
```

---

## ✨ Key Capabilities

1. **Siri-Like Instant Wakeword Activation**:
   - Continuous audio streaming with background noise suppression (DSP).
   - Instant activation on wake phrase detection (*"Hey Ari"*) with confidence gating.
   - Real-time speaker verification (SIV) to prevent unauthorized triggers.

2. **Fine-Tuning & Voice Profile Calibration**:
   - Custom voice enrollment interface ([VoiceSetup.tsx](file:///c:/Users/surya/OneDrive/Desktop/ARI/frontend/src/app/pages/VoiceSetup.tsx)).
   - Adjustable wake threshold (`wake_threshold`) and speaker verification threshold (`speaker_threshold`).
   - Fine-tune speech synthesis rate, voice formalness (`casual`, `neutral`, `formal`), and custom hotword lists.

3. **Live Telemetry & Execution Logs**:
   - Real-time turn-by-turn ASR confidence and intent breakdown.
   - End-to-end latency tracking across ASR, NLU, Planning, and TTS pipelines.
   - Low-confidence trigger capture and model retraining queue.

---

## 🚀 Getting Started

### 1. Environment Configuration

Clone the repository and copy the environment template:

```bash
cp .env.example .env
```

Fill in your Supabase connection strings, JWT secrets, and API credentials in `.env`.

### 2. Database Migrations

Apply the database migrations to your PostgreSQL / Supabase database:

```bash
cd supabase/scripts
npm install
node run_migrations.js
```

### 3. Docker Deployment

Launch all microservices (Gateway, Agent, Execution, Redis, Frontend) in Docker:

```bash
docker-compose up --build
```

- **Web Dashboard**: `http://localhost:5173`
- **API Gateway**: `http://localhost:8080`
- **Voice Agent Service**: `http://localhost:8000`

---

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](file:///c:/Users/surya/OneDrive/Desktop/ARI/LICENSE) for details.
