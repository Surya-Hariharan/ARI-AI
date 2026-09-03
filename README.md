# ARI — Autonomous Reasoning Interface & Voice Assistant

<div align="center">
  <h3>Siri-Like Instant Voice Activation • Multi-Service Micro-Architecture • Fine-Tuning Control Suite</h3>
  <p>Real-Time Wakeword Engine • Low-Latency Voice Pipeline • Custom Voice Enrollment • Native Android Client</p>
</div>

---

## 🌟 Overview

**ARI (Autonomous Reasoning Interface)** is a high-performance, open-source AI voice assistant and agentic orchestration platform. Designed for Siri-like instant hands-free activation, ARI listens continuously for custom trigger words (*"Hey Ari"*), verifies the speaker's voiceprint in real-time, transcribes audio via local Whisper ASR, and executes multi-step LLM reasoning plans.

The system features a native Kotlin + Jetpack Compose Android client for **logging**, **real-time session monitoring**, **voice profile enrollment**, and **fine-tuning** assistant sensitivity thresholds.

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
├── android/                        # Kotlin + Jetpack Compose Android Client
│   ├── app/                        # Application module & entrypoint
│   ├── core/                       # Shared core modules (ui, security, storage, networking, oem, ...)
│   ├── feature/                    # Feature modules (onboarding, settings, ...)
│   ├── runtime/                    # Voice runtime, speech & wake-word engine modules
│   ├── overlay/                    # System overlay engine
│   └── ai/                         # On-device agents, memory & orchestration modules
├── docs/                           # Architecture, API & Engineering Documentation
│   ├── README.md                   # Master Documentation Index
│   ├── DEVELOPMENT.md              # Local Development Setup & Migrations Guide
│   ├── guidelines.md               # Repository Hygiene & Engineering Standards
│   └── architecture/               # Architecture overviews & Free Tier Stack specs
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
   - Custom voice enrollment interface in the Android client ([android/feature/onboarding](file:///c:/Users/surya/OneDrive/Desktop/ARI/android/feature/onboarding)).
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

### 2. Docker Deployment

Launch all backend microservices (Gateway, Agent, Execution, Redis) in Docker:

```bash
docker-compose up --build
```

- **API Gateway**: `http://localhost:8080`
- **Voice Agent Service**: `http://localhost:8000`

---

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](file:///c:/Users/surya/OneDrive/Desktop/ARI/LICENSE) for details.
