# ARI - Privacy-First Mobile AI Assistant

## Overview

ARI is a privacy-first mobile AI assistant with InterceptX security simulation. Built with Expo (React Native) and Express.js backend. Core principle: strict separation between intelligence and authority.

## Security Model

- **Zero-Trust**: Mobile app never trusted; all decisions server-side
- **InterceptX**: Fingerprint-bound sessions with cryptographic audit logging
- **Bounded Listening**: Audio capture only after explicit user action (max 5s)

## Project Structure

```
├── app/                    # Frontend (Expo/React Native)
│   ├── (control)/          # Control App - Master Node (tabs)
│   └── activate.tsx        # Companion Core - Voice activation
├── backend/                # Backend (Express.js)
│   ├── api/                # API route handlers
│   │   ├── sessionsApi.ts  # Session management
│   │   ├── auditApi.ts     # Audit log access
│   │   └── simulationApi.ts# Security simulation
│   ├── security/           # Security modules
│   │   ├── fingerprint.ts  # Device fingerprinting
│   │   ├── crypto.ts       # Cryptographic operations
│   │   └── audit.ts        # Tamper-evident logging
│   ├── simulation/         # Attack simulation engine
│   │   ├── hijackSimulation.ts
│   │   └── replaySimulation.ts
│   └── utils/              # Utilities
├── components/             # Shared UI components
├── lib/                    # Frontend libraries
├── shared/                 # Shared types/schema
└── scripts/                # Build scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Expo CLI (`npm install -g expo-cli`)

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your settings
```

### Development

```bash
# Start backend server
npm run backend:dev

# Start Expo (another terminal)
npm run expo:dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run backend:dev` | Start backend in development mode |
| `npm run expo:dev` | Start Expo development server |
| `npm run backend:prod` | Start backend in production mode |
| `npm run db:push` | Push database schema changes |

## API Endpoints

| Endpoint | Description | Auth |
|----------|-------------|------|
| `GET /api/health` | Health check | Public |
| `POST /api/sessions` | Create session | Fingerprint |
| `POST /api/sessions/:id/validate` | Validate session | Fingerprint |
| `GET /api/audit/logs` | Query audit logs | Admin |
| `POST /api/simulation/hijack` | Run hijack simulation | Admin |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `EXPO_PUBLIC_DOMAIN` | Public API domain | Yes |
| `SESSION_SECRET` | HMAC signing secret | Yes (prod) |
| `PORT` | Server port (default: 5000) | No |
| `CORS_ORIGINS` | Allowed CORS origins | No |

## License

Private
