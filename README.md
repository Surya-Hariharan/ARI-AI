# ARI System

<div align="center">
  <h3>An Advanced AI Control Interface & Automation Platform</h3>
  <p>Premium UI • Multi-Service Architecture • OTP Auth • Intelligent Agents</p>
</div>

---

## 🌟 Overview

**ARI (Autonomous Reasoning Interface)** is a modern, production-ready platform designed for AI orchestration and intelligent task execution. It features a luxury Apple-inspired frontend and a robust, highly scalable multi-service backend.

With ARI, users can interact with intelligent agents, manage their workflows, monitor pipelines, and securely authenticate via an advanced OTP-based system.

---

## 🏗️ Architecture & Tech Stack

ARI relies on a distributed architecture to handle UI, business logic, asynchronous task execution, and AI capabilities.

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Vanilla CSS with modern Glassmorphism & Custom Tailwind
- **Features**: Time-aware greetings, luxury dark theme, seamless transitions, responsive layouts.

### Backend Services
- **API Gateway (Go / Fiber)**: Handles authentication, JWT session management, JWT validation, and routes requests to corresponding services.
- **Execution Service (Go)**: Manages and processes backend tasks asynchronously.
- **AI Agent (Python / FastAPI)**: The cognitive core, managing AI orchestration, LLM interactions, and reasoning.

### Infrastructure & Databases
- **Database**: Supabase (PostgreSQL) — robust schema with `uuid-ossp` and performance indexing.
- **Cache / Message Broker**: Redis — powers real-time communication between the Gateway, Execution, and Agent services.
- **Deployment**: Fully containerized using `docker-compose`.

---

## ✨ Key Features

- **Luxury Authentication Flow**: 
  - OTP-based email verification using secure SMTP templates.
  - Graceful "Forgot Password" flow with auto-generated strong passwords.
  - JWT token-based auto-sign-in with localStorage caching.
  - Time-aware, Apple-inspired glassmorphic UI (`blur(40px)`).

- **Multi-Service Micro-Architecture**: 
  - Seamless inter-process communication backed by Redis.
  - Separation of concerns between API routing, Heavy execution, and AI intelligence.

- **Developer Friendly**: 
  - Centralized `.env` configurations.
  - Docker Compose orchestrated deployment requiring a minimal setup process.

---

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js (v18+) and npm
- Go (1.20+)
- A Supabase Project (PostgreSQL)

### 1. Environment Configuration

Clone the repository and set up your environment variables based on the template:

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase connection strings, JWT secret, and SMTP credentials (e.g., Gmail App Password).

### 2. Database Setup

Ensure your Supabase project is running, then apply the database migrations in order:

```bash
cd supabase/migrations
npm install
node run_migrations.js
```
*(This sets up the `users`, `otp_codes`, `user_sessions`, and other necessary tables).*

### 3. Running via Docker (Backend + Frontend)

Start the entire stack (Gateway, Agent, Execution, Redis, Frontend) with a single command:

```bash
docker-compose up --build
```

- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:8080
- **Python Agent**: http://localhost:8000

### 4. Running Frontend Locally (Development Mode)

If you prefer hot-reloading for UI changes:

```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Project Structure

```text
ARI/
├── backend/
│   ├── agent_python/     # FastAPI Python service for AI reasoning
│   ├── execution_go/     # Go service for heavy task execution 
│   └── gateway_go/       # Go Fiber API gateway (Auth, routing)
├── frontend/             # React/Vite UI application
├── supabase/             # Database migrations & schemas
├── infra/                # Infrastructure configurations
├── shared/               # Shared protobufs / schemas
├── docs/                 # Supporting documentation
├── docker-compose.yml    # Main orchestration file
└── .env.example          # Environment variable template
```

---

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
