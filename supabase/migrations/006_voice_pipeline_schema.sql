-- 006_voice_pipeline_schema.sql
-- Voice pipeline, session telemetry, and personalization foundations.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE TABLE IF NOT EXISTS voice_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ts_ms BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_started_at ON voice_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_turns_session_turn ON voice_turns(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_voice_events_session_created ON voice_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_low_confidence_events_user_created ON low_confidence_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_update_jobs_user_status ON model_update_jobs(user_id, status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at_column'
    ) THEN
        CREATE FUNCTION touch_updated_at_column()
        RETURNS TRIGGER AS $FN$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $FN$ LANGUAGE plpgsql;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'voice_sessions_touch_updated_at'
    ) THEN
        CREATE TRIGGER voice_sessions_touch_updated_at
        BEFORE UPDATE ON voice_sessions
        FOR EACH ROW
        EXECUTE FUNCTION touch_updated_at_column();
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'user_voice_profiles_touch_updated_at'
    ) THEN
        CREATE TRIGGER user_voice_profiles_touch_updated_at
        BEFORE UPDATE ON user_voice_profiles
        FOR EACH ROW
        EXECUTE FUNCTION touch_updated_at_column();
    END IF;
END
$$;

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_confidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_update_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice sessions'
    ) THEN
        CREATE POLICY "Users can access their own voice sessions"
        ON voice_sessions
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice turns'
    ) THEN
        CREATE POLICY "Users can access their own voice turns"
        ON voice_turns
        FOR ALL
        USING (
            EXISTS (
                SELECT 1 FROM voice_sessions vs
                WHERE vs.id = voice_turns.session_id
                  AND vs.user_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM voice_sessions vs
                WHERE vs.id = voice_turns.session_id
                  AND vs.user_id = auth.uid()
            )
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice events'
    ) THEN
        CREATE POLICY "Users can access their own voice events"
        ON voice_events
        FOR ALL
        USING (
            EXISTS (
                SELECT 1 FROM voice_sessions vs
                WHERE vs.id = voice_events.session_id
                  AND vs.user_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM voice_sessions vs
                WHERE vs.id = voice_events.session_id
                  AND vs.user_id = auth.uid()
            )
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice profile'
    ) THEN
        CREATE POLICY "Users can access their own voice profile"
        ON user_voice_profiles
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own low confidence events'
    ) THEN
        CREATE POLICY "Users can access their own low confidence events"
        ON low_confidence_events
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own model jobs'
    ) THEN
        CREATE POLICY "Users can access their own model jobs"
        ON model_update_jobs
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;
