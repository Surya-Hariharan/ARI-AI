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
