-- ARI Database Reset Script (Development Use Only)
-- This script truncates all core user-related data tables.

-- Disable triggers temporarily to avoid issues during truncation
SET session_replication_role = 'replica';

TRUNCATE TABLE user_sessions CASCADE;
TRUNCATE TABLE otp_codes CASCADE;
TRUNCATE TABLE user_integrations CASCADE;
TRUNCATE TABLE execution_logs CASCADE;
TRUNCATE TABLE users CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Tip: Use the following command to reset all auto-incrementing IDs if necessary
-- ALTER SEQUENCE users_id_seq RESTART WITH 1;
