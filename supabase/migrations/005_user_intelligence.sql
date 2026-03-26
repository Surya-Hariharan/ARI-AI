-- 005_user_intelligence.sql
-- This migration adds tables for the "Identity Layer" and "Memory Layer" (Short-term)

-- 1. User Goals: Tracking what the user is trying to achieve
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    goal_text TEXT NOT NULL,
    target_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. User Preferences: Storing behavioral and system preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    UNIQUE(user_id, key)
);

-- 3. Interaction Logs: Feeding the Reasoning Engine and Memory Engine
CREATE TABLE IF NOT EXISTS interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    intent TEXT,
    device_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS (Assuming existing policies follow similar user_id checks)
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

-- Simple policies (Can be refined later)
CREATE POLICY "Users can only see their own goals" ON user_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only see their own logs" ON interaction_logs FOR ALL USING (auth.uid() = user_id);
