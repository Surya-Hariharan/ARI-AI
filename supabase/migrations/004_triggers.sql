-- ============================================================
-- ARI Database Migration — 004: Automated Triggers
-- ============================================================

-- Trigger for users table updated_at column
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for voice_sessions table updated_at column
DROP TRIGGER IF EXISTS voice_sessions_touch_updated_at ON voice_sessions;
CREATE TRIGGER voice_sessions_touch_updated_at
    BEFORE UPDATE ON voice_sessions
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at_column();

-- Trigger for user_voice_profiles table updated_at column
DROP TRIGGER IF EXISTS user_voice_profiles_touch_updated_at ON user_voice_profiles;
CREATE TRIGGER user_voice_profiles_touch_updated_at
    BEFORE UPDATE ON user_voice_profiles
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at_column();
