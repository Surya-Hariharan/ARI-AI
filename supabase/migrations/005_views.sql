-- ============================================================
-- ARI Database Migration — 005: Analytical Views
-- ============================================================

-- Active User Sessions View
CREATE OR REPLACE VIEW active_user_sessions_view AS
SELECT 
    s.id AS session_id,
    s.user_id,
    u.email,
    u.full_name,
    s.device_info,
    s.created_at,
    s.expires_at
FROM user_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.expires_at > NOW();

-- Voice Session Telemetry Summary View
CREATE OR REPLACE VIEW voice_telemetry_summary_view AS
SELECT
    vs.id AS session_id,
    vs.user_id,
    vs.state,
    vs.wake_confidence,
    vs.end_to_end_latency_ms,
    vs.started_at,
    COUNT(vt.id) AS turn_count,
    AVG(vt.asr_confidence) AS avg_asr_confidence
FROM voice_sessions vs
LEFT JOIN voice_turns vt ON vt.session_id = vs.id
GROUP BY vs.id, vs.user_id, vs.state, vs.wake_confidence, vs.end_to_end_latency_ms, vs.started_at;
