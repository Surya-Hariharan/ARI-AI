-- ============================================================
-- ARI Database Migration — 007: Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on intelligence and memory tables
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on voice pipeline tables
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_confidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_update_jobs ENABLE ROW LEVEL SECURITY;

-- 1. User Goals RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see their own goals') THEN
        CREATE POLICY "Users can only see their own goals" ON user_goals FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- 2. User Preferences RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see their own preferences') THEN
        CREATE POLICY "Users can only see their own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- 3. Interaction Logs RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see their own logs') THEN
        CREATE POLICY "Users can only see their own logs" ON interaction_logs FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- 4. Voice Sessions RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice sessions') THEN
        CREATE POLICY "Users can access their own voice sessions" ON voice_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 5. Voice Turns RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice turns') THEN
        CREATE POLICY "Users can access their own voice turns" ON voice_turns FOR ALL USING (
            EXISTS (SELECT 1 FROM voice_sessions vs WHERE vs.id = voice_turns.session_id AND vs.user_id = auth.uid())
        ) WITH CHECK (
            EXISTS (SELECT 1 FROM voice_sessions vs WHERE vs.id = voice_turns.session_id AND vs.user_id = auth.uid())
        );
    END IF;
END $$;

-- 6. Voice Events RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice events') THEN
        CREATE POLICY "Users can access their own voice events" ON voice_events FOR ALL USING (
            EXISTS (SELECT 1 FROM voice_sessions vs WHERE vs.id = voice_events.session_id AND vs.user_id = auth.uid())
        ) WITH CHECK (
            EXISTS (SELECT 1 FROM voice_sessions vs WHERE vs.id = voice_events.session_id AND vs.user_id = auth.uid())
        );
    END IF;
END $$;

-- 7. User Voice Profile RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own voice profile') THEN
        CREATE POLICY "Users can access their own voice profile" ON user_voice_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 8. Low Confidence Events RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own low confidence events') THEN
        CREATE POLICY "Users can access their own low confidence events" ON low_confidence_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 9. Model Update Jobs RLS Policy
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their own model jobs') THEN
        CREATE POLICY "Users can access their own model jobs" ON model_update_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
