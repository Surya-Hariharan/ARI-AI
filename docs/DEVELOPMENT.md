# ARI Developer Guide

Welcome to the ARI platform! This guide will help you rapidly develop and iterate on the system.

## 🚀 Hot-Reloading Architecture

We've configured the entire workspace so you **never have to manually restart servers**. Simply run the stack and start editing files locally in Windows/VSCode. The Docker containers will watch your edits and reflect changes instantly.

### Running the Stack
Ensure you have Docker Desktop installed, then run from the root directory:

```bash
docker compose up --build
```

### How live editing works in each service:

1. **Gateway (`backend/gateway`) & Execution Worker (`backend/execution`)**
   - **Tool**: `air` (Go live-reloading)
   - **How it works**: The Docker containers mount your local directories as Volumes to `/app` inside the container. Whenever you save a `.go` file locally, `air` immediately intercepts the save, forcefully recompiles the new binary, and re-launches the service automatically.
   
2. **Agent Service (`backend/agent`)**
   - **Tool**: `uvicorn --reload`
   - **How it works**: Same volume mapping mechanism. When you edit any `.py` file, FastAPI automatically reboots its worker threads, updating your endpoints seamlessly!

3. **Frontend (`frontend`)**
   - **Tool**: `vite` (HMR - Hot Module Replacement)
   - **How it works**: `vite` strictly watches the mounted `./frontend` directory and pushes updates directly into your browser window without wiping your active page state.

## 🗄️ Database Setup & Changes
If you need to change your database layer schemas or credentials:
- Open `.env` at the root.
- Change `DATABASE_URL` (for postgres connection pools) or `SUPABASE_KEY` (for HTTP fetching).
- To apply database migrations:
  ```bash
  cd supabase/scripts
  npm install
  node run_migrations.js
  ```
- When changing `.env` variables, restart the Docker Compose stack to load new configs:
  ```bash
  docker compose down
  docker compose up --build
  ```

Happy Coding! 💡

## Repository Hygiene Policy

To keep deployable branches production-focused, do not commit transient development artifacts.

1. Remove test/demo scaffolding files before shipping runtime changes.
2. Do not commit Python cache artifacts such as `__pycache__/` and `*.pyc`.
3. Do not commit temporary Go build outputs under `tmp/`.
4. Keep Docker build contexts clean by excluding test/spec/demo files from images.

Recommended local cleanup command from repo root:

```bash
# PowerShell
Remove-Item -Recurse -Force backend/agent/__pycache__, backend/gateway/tmp, backend/execution/tmp -ErrorAction SilentlyContinue
```

## Runtime Security And Compatibility Flags

The runtime enforces strict defaults outside development.

1. `ARI_ENV`: environment name (`development`, `dev`, `local`, `test` are treated as non-production).
2. `ARI_REQUIRE_ENCRYPTION_KEY`: optional override (`true`/`false`) for key policy.
3. `ARI_MEMORY_ENCRYPTION_KEY`: required in non-development unless policy override disables enforcement.
4. `ARI_VOICEPRINT_ENCRYPTION_KEY`: preferred voiceprint key; falls back to `ARI_MEMORY_ENCRYPTION_KEY` when set.
5. `ARI_ENABLE_LEGACY_PLAN_ENDPOINT`: defaults to `false`; when disabled, `/plan` returns `410` and clients should use `/voice/runtime/process`.

In development only, a deterministic fallback voiceprint key is used when no key is configured.
