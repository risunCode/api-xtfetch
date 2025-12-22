-- ============================================================================
-- XTFetch Database Reset Script v3
-- Run this FIRST to clean up existing tables
-- Last Updated: December 2025
-- ============================================================================

-- Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trigger_cookie_pool_updated ON admin_cookie_pool;
DROP TRIGGER IF EXISTS trigger_useragent_pool_updated ON useragent_pool;
DROP TRIGGER IF EXISTS trigger_browser_profiles_updated ON browser_profiles;
DROP TRIGGER IF EXISTS trigger_system_config_updated ON system_config;
DROP TRIGGER IF EXISTS trigger_admin_alerts_updated ON admin_alerts_config;

-- Drop views
DROP VIEW IF EXISTS cookie_pool_stats CASCADE;
DROP VIEW IF EXISTS useragent_pool_stats CASCADE;
DROP VIEW IF EXISTS browser_profiles_stats CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS generate_referral_code() CASCADE;
DROP FUNCTION IF EXISTS process_referral(UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS increment_api_key_success(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS increment_api_key_error(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS update_cookie_pool_timestamp() CASCADE;
DROP FUNCTION IF EXISTS reset_expired_cooldowns() CASCADE;
DROP FUNCTION IF EXISTS cleanup_push_subscriptions() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_cache() CASCADE;
DROP FUNCTION IF EXISTS update_useragent_pool_timestamp() CASCADE;
DROP FUNCTION IF EXISTS increment_ua_use_count(TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_browser_profiles_timestamp() CASCADE;
DROP FUNCTION IF EXISTS increment_profile_use(UUID) CASCADE;
DROP FUNCTION IF EXISTS mark_profile_success(UUID) CASCADE;
DROP FUNCTION IF EXISTS mark_profile_error(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_system_config_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_admin_alerts_timestamp() CASCADE;

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS push_notification_history CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS admin_cookie_pool CASCADE;
DROP TABLE IF EXISTS admin_alerts_config CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS special_referrals CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS admin_cookies CASCADE;
DROP TABLE IF EXISTS service_config CASCADE;
DROP TABLE IF EXISTS global_settings CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
DROP TABLE IF EXISTS downloads CASCADE;
DROP TABLE IF EXISTS errors CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS playground_examples CASCADE;
DROP TABLE IF EXISTS useragent_pool CASCADE;
DROP TABLE IF EXISTS browser_profiles CASCADE;

-- Drop api_cache if exists (migrated to Redis)
DROP TABLE IF EXISTS api_cache CASCADE;

-- Drop types
DROP TYPE IF EXISTS user_role CASCADE;

-- Clean auth users (optional - uncomment if needed)
-- DELETE FROM auth.users;
