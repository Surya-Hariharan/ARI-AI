-- ============================================================
-- ARI Database Seed — Initial Development Seed Data
-- ============================================================

INSERT INTO users (id, email, full_name, role, email_verified) VALUES 
('11111111-1111-1111-1111-111111111111', 'test_user@example.com', 'ARI Demo User', 'User', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO devices (id, user_id, device_name, capabilities) VALUES 
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Pixel 8 Pro', '{"supports_voice": true, "supports_screen": true}')
ON CONFLICT DO NOTHING;

INSERT INTO user_preferences (user_id, key, value, category) VALUES
('11111111-1111-1111-1111-111111111111', 'theme', 'dark', 'ui'),
('11111111-1111-1111-1111-111111111111', 'voice_speed', '1.0', 'voice')
ON CONFLICT (user_id, key) DO NOTHING;
