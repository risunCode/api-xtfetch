-- ═══════════════════════════════════════════════════════════════════════════════
-- DROP BROWSERPOOL TABLES AND FUNCTIONS
-- Execute this SQL in Supabase SQL Editor to remove browserpool system
-- Date: December 2024
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop views first (depends on tables)
DROP VIEW IF EXISTS browser_profiles_stats CASCADE;
DROP VIEW IF EXISTS useragent_pool_stats CASCADE;

-- Drop functions (RPC)
DROP FUNCTION IF EXISTS increment_ua_use_count(TEXT);
DROP FUNCTION IF EXISTS increment_profile_use(UUID);
DROP FUNCTION IF EXISTS mark_profile_success(UUID);
DROP FUNCTION IF EXISTS mark_profile_error(UUID, TEXT);

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_browser_profiles_updated ON browser_profiles;
DROP TRIGGER IF EXISTS trigger_useragent_pool_updated ON useragent_pool;

-- Drop tables
DROP TABLE IF EXISTS browser_profiles CASCADE;
DROP TABLE IF EXISTS useragent_pool CASCADE;

-- Optional: Drop enums if not used elsewhere
-- DROP TYPE IF EXISTS browser_type CASCADE;
-- DROP TYPE IF EXISTS device_type CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run this to verify the tables are dropped:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('browser_profiles', 'useragent_pool');
-- Should return 0 rows if successful
