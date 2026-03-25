-- Authentication Schema Migration for ARI
-- Extends users table and adds OTP + session management

-- ============================================
-- 1. Extend existing users table
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Index on email for fast lookups during login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- 2. OTP verification codes
-- ============================================
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('signup', 'forgot_password')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Composite index for OTP lookups
CREATE INDEX IF NOT EXISTS idx_otp_user_code ON otp_codes(user_id, code);
-- Index for cleanup of expired OTPs
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

-- ============================================
-- 3. User sessions (for auto-sign-in / cache)
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on token for fast session validation
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
-- Index to find all sessions for a user
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

-- ============================================
-- 4. Auto-update updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
