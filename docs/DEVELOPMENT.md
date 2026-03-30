# ARI Developer Guide

Welcome to the ARI backend! This guide will help you rapidly develop and iterate on the code. 

## 🚀 Hot-Reloading Architecture

We've configured the entire workspace so you **never have to manually restart servers**. Simply run the stack and start editing files locally in Windows/VSCode. The Docker containers will watch your edits and reflect changes instantly.

### Running the Stack
Ensure you have Docker Desktop installed, then run from the root directory:

```bash
docker compose up --build
```

### How live editing works in each service:

1. **Gateway (`backend/gateway_go`) & Execution Worker (`backend/execution_go`)**
   - **Tool**: `air` (Go live-reloading)
   - **How it works**: The Docker containers mount your local directories as Volumes to `/app` inside the container. Whenever you save a `.go` file locally, `air` immediately intercepts the save, forcefully recompiles the new binary, and re-launches the service automatically.
   
2. **Agent Service (`backend/agent_python`)**
   - **Tool**: `uvicorn --reload`
   - **How it works**: Same volume mapping mechanism. When you edit any `.py` file, FastAPI automatically reboots its worker threads, updating your endpoints seamlessly!

3. **Frontend (`frontend`)**
   - **Tool**: `vite` (HMR - Hot Module Replacement)
   - **How it works**: `vite` strictly watches the mounted `./frontend` directory and pushes updates directly into your browser window without wiping your active page state.

## 🗄️ Database Changes
If you need to change your database layer schemas or credentials:
- Open the `.env` file at the root.
- Change `DATABASE_URL` (for postgres connection pools) or `SUPABASE_KEY` (for HTTP fetching).
- When changing `.env` variables, you **do** need to manually restart the docker compose stack to load the new config into the isolated container environments:
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
Remove-Item -Recurse -Force backend/agent_python/__pycache__, backend/gateway_go/tmp, backend/execution_go/tmp -ErrorAction SilentlyContinue
```

## Runtime Security And Compatibility Flags

The runtime now enforces stricter defaults outside development.

1. `ARI_ENV`: environment name (`development`, `dev`, `local`, `test` are treated as non-production).
2. `ARI_REQUIRE_ENCRYPTION_KEY`: optional override (`true`/`false`) for key policy.
3. `ARI_MEMORY_ENCRYPTION_KEY`: required in non-development unless policy override disables enforcement.
4. `ARI_VOICEPRINT_ENCRYPTION_KEY`: preferred voiceprint key; falls back to `ARI_MEMORY_ENCRYPTION_KEY` when set.
5. `ARI_ENABLE_LEGACY_PLAN_ENDPOINT`: defaults to `false`; when disabled, `/plan` returns `410` and clients should use `/voice/runtime/process`.

In development only, a deterministic fallback voiceprint key is used when no key is configured.

### Startup Health Check

On startup, the agent now performs a strict security configuration check.

1. In non-development mode (or when `ARI_REQUIRE_ENCRYPTION_KEY=true`), startup fails if `ARI_MEMORY_ENCRYPTION_KEY` is missing.
2. Voiceprint encryption must resolve through `ARI_VOICEPRINT_ENCRYPTION_KEY` or `ARI_MEMORY_ENCRYPTION_KEY`.
3. Failures are surfaced as startup exceptions before serving requests.

### Runtime Contract Utility

Use this utility to compare compatibility between `/voice/process` and `/voice/runtime/process`.

```bash
python backend/agent_python/runtime_contract_check.py --base-url http://localhost:8000
```
