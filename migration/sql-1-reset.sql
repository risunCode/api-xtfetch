    -- ============================================================================
    -- XTFetch Database Reset Script
    -- Version: January 2025
    -- Purpose: Complete database reset - drops ALL objects
    -- WARNING: This will DELETE ALL DATA! Use with caution!
    -- ============================================================================

    -- ============================================================================
    -- STEP 1: DROP ALL VIEWS
    -- ============================================================================

    DROP VIEW IF EXISTS cookie_pool_stats CASCADE;
    DROP VIEW IF EXISTS browser_profiles_stats CASCADE;
    DROP VIEW IF EXISTS daily_download_summary CASCADE;
    DROP VIEW IF EXISTS download_stats_summary CASCADE;
    DROP VIEW IF EXISTS error_logs_summary CASCADE;
    DROP VIEW IF EXISTS platform_health CASCADE;
    DROP VIEW IF EXISTS error_rate_24h CASCADE;

    -- ============================================================================
    -- STEP 2: DROP ALL TRIGGERS
    -- ============================================================================

    DROP TRIGGER IF EXISTS trigger_users_updated ON users;
    DROP TRIGGER IF EXISTS trigger_api_keys_updated ON api_keys;
    DROP TRIGGER IF EXISTS trigger_cookie_pool_updated ON admin_cookie_pool;
    DROP TRIGGER IF EXISTS trigger_browser_profiles_updated ON browser_profiles;
    DROP TRIGGER IF EXISTS trigger_ai_keys_updated ON ai_api_keys;
    DROP TRIGGER IF EXISTS trigger_download_stats_updated ON download_stats;
    DROP TRIGGER IF EXISTS trigger_error_logs_updated ON error_logs;
    DROP TRIGGER IF EXISTS trigger_alert_config_updated ON alert_config;
    DROP TRIGGER IF EXISTS trigger_service_config_updated ON service_config;
    DROP TRIGGER IF EXISTS trigger_system_config_updated ON system_config;
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

    -- ============================================================================
    -- STEP 3: DROP ALL FUNCTIONS
    -- ============================================================================

    DROP FUNCTION IF EXISTS update_timestamp() CASCADE;
    DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
    DROP FUNCTION IF EXISTS increment_api_key_success(VARCHAR) CASCADE;
    DROP FUNCTION IF EXISTS increment_api_key_error(VARCHAR) CASCADE;
    DROP FUNCTION IF EXISTS reset_expired_cooldowns() CASCADE;
    DROP FUNCTION IF EXISTS validate_special_referral(VARCHAR) CASCADE;
    DROP FUNCTION IF EXISTS use_special_referral(VARCHAR) CASCADE;
    DROP FUNCTION IF EXISTS record_download_stat(TEXT, VARCHAR, VARCHAR, BOOLEAN, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS record_error_log(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, VARCHAR, INET, TEXT, TEXT) CASCADE;

    -- ============================================================================
    -- STEP 4: DROP ALL TABLES (in correct order due to foreign keys)
    -- ============================================================================

    -- Tables with foreign key dependencies first
    DROP TABLE IF EXISTS error_logs CASCADE;
    DROP TABLE IF EXISTS api_keys CASCADE;
    DROP TABLE IF EXISTS special_referrals CASCADE;

    -- Main tables
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS admin_cookie_pool CASCADE;
    DROP TABLE IF EXISTS browser_profiles CASCADE;
    DROP TABLE IF EXISTS ai_api_keys CASCADE;
    DROP TABLE IF EXISTS download_stats CASCADE;
    DROP TABLE IF EXISTS alert_config CASCADE;
    DROP TABLE IF EXISTS service_config CASCADE;
    DROP TABLE IF EXISTS system_config CASCADE;

    -- ============================================================================
    -- STEP 5: DROP ALL CUSTOM TYPES/ENUMS
    -- ============================================================================

    DROP TYPE IF EXISTS user_role CASCADE;
    DROP TYPE IF EXISTS user_status CASCADE;
    DROP TYPE IF EXISTS cookie_status CASCADE;
    DROP TYPE IF EXISTS api_key_type CASCADE;
    DROP TYPE IF EXISTS ai_provider CASCADE;
    DROP TYPE IF EXISTS browser_type CASCADE;
    DROP TYPE IF EXISTS device_type CASCADE;
    DROP TYPE IF EXISTS alert_type CASCADE;

    -- ============================================================================
    -- VERIFICATION
    -- ============================================================================

    -- You can run these queries to verify everything is dropped:
    -- SELECT * FROM pg_type WHERE typname IN ('user_role', 'user_status', 'cookie_status', 'api_key_type', 'ai_provider', 'browser_type', 'device_type', 'alert_type');
    -- SELECT * FROM pg_tables WHERE schemaname = 'public';
    -- SELECT * FROM pg_views WHERE schemaname = 'public';

    -- ============================================================================
    -- END OF RESET SCRIPT
    -- ============================================================================
