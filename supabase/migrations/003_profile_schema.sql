-- Profile Extensions for ARI Users
-- Adds fields for Identity & Access / Account Page

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS custom_gender TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'User';

-- Create an integrations table to handle toggles on the account page
CREATE TABLE IF NOT EXISTS user_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    integration_id TEXT NOT NULL, -- e.g. 'whatsapp', 'youtube'
    connected BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, integration_id)
);
