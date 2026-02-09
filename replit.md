# ARI - Privacy-First Mobile AI Assistant

## Overview

ARI is a privacy-first mobile AI assistant built with Expo (React Native) and an Express.js backend. The core architectural principle is a strict separation between intelligence and authority - the Companion Core (voice activation) can only REQUEST actions, while the Control App (master node) DECIDES whether to allow them.

The system enforces a zero-trust security model where:
- The mobile app is never trusted
- All sensitive decisions happen server-side
- Audio capture only occurs after explicit user action with bounded duration
- No secrets are hardcoded anywhere

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture (Expo/React Native)

**Two-Module Design Pattern:**
1. **Control App (Master Node)** - Located in `app/(control)/`
   - Acts as root of trust
   - Tab-based navigation with 5 screens: Dashboard, Permissions, Voice Profile, Audit Log, Settings
   - Enforces all permissions, policies, and security
   - Manages kill switch, capability toggles, and audit logging
   - Uses React Context (`lib/ari-context.tsx`) for centralized state management

2. **Companion Core (Slave Node)** - Located in `app/activate.tsx`
   - Voice activation interface with visual glow overlay
   - Can only REQUEST actions, never execute directly
   - Audio capture bounded to 5 seconds maximum
   - Audio kept in memory only, never persisted to disk

**State Management:**
- React Context + AsyncStorage for persistence
- TanStack Query for server state management
- Capability-based permission system with audit logging

**UI Stack:**
- React Native with Expo SDK 54
- expo-router for file-based navigation
- react-native-reanimated for animations
- expo-linear-gradient, expo-blur for visual effects
- Inter font family via @expo-google-fonts

### Backend Architecture (Express.js)

**Server Structure:**
- Express 5.x with TypeScript
- Routes in `server/routes/` with feature-based organization
- Security modules in `server/security/`

**API Endpoints:**
- `GET /api/health` - Public health check for monitoring
- `POST /api/trigger` - Authenticated trigger endpoint for voice activation

**Security Layers:**
1. JWT validation (`server/security/jwt.ts`) - Mock implementation for scaffold
2. Policy enforcement (`server/security/policy.ts`) - Evaluates trigger events against rules
3. Rate limiting and replay attack prevention via timestamp validation

### Database Layer

**ORM:** Drizzle ORM with PostgreSQL dialect
- Schema defined in `shared/schema.ts`
- Currently includes users table with id, username, password
- Migrations output to `./migrations/`

**Storage:**
- `server/storage.ts` provides `IStorage` interface with MemStorage implementation
- Designed for easy swap to PostgreSQL when database is provisioned

### Security Design Patterns

**Bounded Listening:**
- Audio capture only after explicit user action
- Maximum 5-second recording duration
- Audio never saved to disk, immediate cleanup

**Zero-Trust Model:**
- Client is never trusted for security decisions
- All capability checks happen server-side
- Device ID tracked per-device for audit purposes

**Kill Switch:**
- Master toggle that completely disables all ARI functionality
- Located in Settings screen, persisted via AsyncStorage

## External Dependencies

### Third-Party Services
- **PostgreSQL** - Database (configured via DATABASE_URL environment variable)
- **Expo Services** - Build and development tooling

### Key NPM Packages
- **expo** (~54.0.27) - Core framework
- **expo-av** / **expo-audio** - Audio recording with microphone permissions
- **drizzle-orm** + **drizzle-zod** - Database ORM and validation
- **@tanstack/react-query** - Server state management
- **express** (^5.0.1) - Backend HTTP server
- **pg** - PostgreSQL client

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN` - Public domain for API communication
- `REPLIT_DEV_DOMAIN` - Development domain (Replit-specific)

### Platform Permissions
- **iOS:** `NSMicrophoneUsageDescription` for voice commands
- **Android:** `android.permission.RECORD_AUDIO` for voice commands