-- Voice Enrollment Schema for ARI
-- Adds support for storing personalized voice embeddings (voiceprints)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS voice_embedding BYTEA,
  ADD COLUMN IF NOT EXISTS is_voice_enrolled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_enrolled_at TIMESTAMP WITH TIME ZONE;

-- Index to quickly find enrolled users
CREATE INDEX IF NOT EXISTS idx_users_voice_enrolled ON users(is_voice_enrolled) WHERE is_voice_enrolled = true;
