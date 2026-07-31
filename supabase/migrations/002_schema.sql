-- ============================================================
-- ARI Database Migration — 002: Core Table Schema
-- Strict top-down hierarchy (Zero Circular Dependencies)
-- ============================================================

-- 1. Users table (Central identity entity)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL DEFAULT '',
    full_name TEXT,
    avatar_url TEXT,
    gender TEXT,
    custom_gender TEXT,
    role TEXT NOT NULL DEFAULT 'User',
    voice_embedding BYTEA,
    is_voice_enrolled BOOLEAN NOT NULL DEFAULT false,
    voice_enrolled_at TIMESTAMPTZ,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Connected Devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    capabilities JSONB,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Device Permissions State table
CREATE TABLE IF NOT EXISTS permissions_state (
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    permission_type TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (device_id, permission_type)
);

-- 4. User Integrations table
CREATE TABLE IF NOT EXISTS user_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    integration_id TEXT NOT NULL,
    connected BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, integration_id)
);

-- 5. OTP Verification Codes table
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('signup', 'forgot_password')),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. User Sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Agent Memory Layer table
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_fact TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Execution Logs table
CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. User Goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    goal_text TEXT NOT NULL,
    target_date TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. User Preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    UNIQUE(user_id, key)
);

-- 11. Interaction Logs table
CREATE TABLE IF NOT EXISTS interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    intent TEXT,
    device_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Voice Sessions table
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    state TEXT NOT NULL DEFAULT 'IDLE',
    wake_confidence REAL,
    speaker_verified BOOLEAN,
    speaker_score REAL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    end_to_end_latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (state IN ('IDLE', 'WAKE_DETECTED', 'VERIFYING', 'LISTENING', 'PROCESSING', 'RESPONDING', 'FAILED'))
);

-- 13. Voice Turns table
CREATE TABLE IF NOT EXISTS voice_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    turn_index INTEGER NOT NULL,
    asr_transcript TEXT,
    asr_confidence REAL,
    intent TEXT,
    intent_confidence REAL,
    entities JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_name TEXT,
    action_status TEXT,
    response_text TEXT,
    ambient_noise_db REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, turn_index)
);

-- 14. Voice Events table
CREATE TABLE IF NOT EXISTS voice_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ts_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. User Voice Profiles table
CREATE TABLE IF NOT EXISTS user_voice_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    embedding BYTEA,
    embedding_dim INTEGER,
    wake_phrase TEXT NOT NULL DEFAULT 'Hey Ari',
    wake_threshold REAL NOT NULL DEFAULT 0.62,
    speaker_threshold REAL NOT NULL DEFAULT 0.75,
    preferred_tts_rate REAL NOT NULL DEFAULT 1.0,
    response_formality TEXT NOT NULL DEFAULT 'neutral',
    hotwords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    model_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (response_formality IN ('casual', 'neutral', 'formal'))
);

-- 16. Low Confidence Events table
CREATE TABLE IF NOT EXISTS low_confidence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES voice_sessions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    asr_confidence REAL,
    intent_confidence REAL,
    top_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    fallback_type TEXT NOT NULL,
    transcript TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Model Update Jobs table
CREATE TABLE IF NOT EXISTS model_update_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);
