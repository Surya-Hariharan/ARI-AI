-- ============================================================
-- ARI Database Migration — 009: execution_logs schema/code reconciliation
-- ============================================================
-- backend/execution/main.go has always inserted
--   (id, task_id, device_id, status, metadata, created_at)
-- while 002_schema.sql declared only
--   (id, task_id, status, output, timestamp)
--
-- Every insert therefore failed, ExecuteWithRetry burned three attempts per call,
-- and GET /execution/status/:task_id returned 404 for every task ever submitted.
--
-- This migration adds the missing columns. The legacy `timestamp` column is kept
-- (it has a default and nothing reads it) and is dropped in the Phase 4 contract
-- step, once the worker rewrite has landed.
-- ============================================================

ALTER TABLE execution_logs
    ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS device_id  TEXT,
    ADD COLUMN IF NOT EXISTS metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Status lookups were sequential scans; task_id had no index at all.
CREATE INDEX IF NOT EXISTS idx_execution_logs_task
    ON execution_logs (task_id);

-- Supports the ownership predicate on GET /execution/status/:task_id.
CREATE INDEX IF NOT EXISTS idx_execution_logs_user
    ON execution_logs (user_id, created_at DESC);
