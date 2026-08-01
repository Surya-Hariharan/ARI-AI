-- ============================================================
-- ARI Database Migration — 008: Password Reset Tokens
-- ============================================================
-- Replaces the previous "generate a new password, email it, and return it in the
-- HTTP response" reset flow with single-use, hashed, expiring reset tokens.
--
-- Only the SHA-256 hash of a token is stored: a database read must not yield a
-- usable reset credential.
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  BYTEA NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_ip  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index: the hot set is only the small number of unconsumed tokens.
CREATE INDEX IF NOT EXISTS idx_prt_user_active
    ON password_reset_tokens (user_id) WHERE used_at IS NULL;

-- Supports the cleanup job that deletes expired tokens.
CREATE INDEX IF NOT EXISTS idx_prt_expires
    ON password_reset_tokens (expires_at) WHERE used_at IS NULL;
