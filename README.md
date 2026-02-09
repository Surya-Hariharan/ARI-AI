# ARI - Privacy-First Mobile AI Assistant

## Overview

ARI is a privacy-first mobile AI assistant built with Expo (React Native) and an Express.js backend. The core architectural principle is a strict separation between intelligence and authority - the Companion Core (voice activation) can only REQUEST actions, while the Control App (master node) DECIDES whether to allow them.

## Security Model

- **Zero-Trust**: The mobile app is never trusted; all sensitive decisions happen server-side
- **Bounded Listening**: Audio capture only after explicit user action with max 5-second duration
- **No Hardcoded Secrets**: All secrets are environment variables

## Project Structure

```
├── app/                    # Frontend (Expo/React Native)
│   ├── (control)/          # Control App - Master Node (tabs)
│   └── activate.tsx        # Companion Core - Voice activation
├── server/                 # Backend (Express.js)
│   ├── routes/             # API routes
│   ├── security/           # JWT, policy enforcement
│   └── templates/          # HTML templates
├── lib/                    # Shared libraries
│   ├── api-client.ts       # API client
│   ├── ari-context.tsx     # React Context for state
│   └── query-client.ts     # TanStack Query setup
├── shared/
│   └── schema.ts           # Drizzle ORM database schema
└── scripts/
    └── build.js            # Static build script
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Expo CLI (`npm install -g expo-cli`)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your database URL and other settings
```

### Development

```bash
# Start the backend server
npm run server:dev

# Start Expo development server (in another terminal)
npm run expo:dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run server:dev` | Start backend in development mode |
| `npm run expo:dev` | Start Expo development server |
| `npm run server:prod` | Start backend in production mode |
| `npm run db:push` | Push database schema changes |
| `npm run lint` | Run ESLint |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `EXPO_PUBLIC_DOMAIN` | Public domain for API (e.g., `localhost:5000`) | Yes |
| `PORT` | Server port (default: 5000) | No |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | No |

## API Endpoints

- `GET /api/health` - Health check (public)
- `POST /api/trigger` - Voice trigger endpoint (authenticated)

## Architecture

### Frontend (Expo/React Native)

**Two-Module Design:**
1. **Control App** (`app/(control)/`) - Acts as root of trust with tab navigation
2. **Companion Core** (`app/activate.tsx`) - Voice activation with visual glow overlay

**Stack:**
- React Native with Expo SDK 54
- expo-router for file-based navigation
- TanStack Query for server state
- react-native-reanimated for animations

### Backend (Express.js)

- Express 5.x with TypeScript
- JWT validation and policy enforcement
- Drizzle ORM with PostgreSQL

## License

Private
