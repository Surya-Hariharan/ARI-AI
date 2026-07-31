-- ============================================================
-- ARI Database Migration — 006: Database Performance Indexes
-- ============================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_voice_enrolled ON users(is_voice_enrolled) WHERE is_voice_enrolled = true;

-- OTP verification codes indexes
CREATE INDEX IF NOT EXISTS idx_otp_user_code ON otp_codes(user_id, code);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

-- Voice sessions & pipeline indexes
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_started_at ON voice_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_turns_session_turn ON voice_turns(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_voice_events_session_created ON voice_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_low_confidence_events_user_created ON low_confidence_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_update_jobs_user_status ON model_update_jobs(user_id, status);
