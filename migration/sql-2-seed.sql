-- ============================================================================
-- XTFetch Database Seed Script
-- Version: January 2025
-- Purpose: Complete database schema creation from scratch
-- ============================================================================

-- ============================================================================
-- SECTION A: ENUMS (7 total)
-- ============================================================================

-- 1. User role enum
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- 2. User status enum
CREATE TYPE user_status AS ENUM ('active', 'frozen', 'banned');

-- 3. Cookie health status enum
CREATE TYPE cookie_status AS ENUM ('healthy', 'cooldown', 'expired', 'disabled');

-- 4. API key type enum
CREATE TYPE api_key_type AS ENUM ('public', 'private');

-- 5. AI provider enum
CREATE TYPE ai_provider AS ENUM ('gemini', 'openai', 'anthropic', 'other');

-- 6. Browser type enum
CREATE TYPE browser_type AS ENUM ('chrome', 'firefox', 'safari', 'edge', 'opera', 'other');

-- 7. Device type enum
CREATE TYPE device_type AS ENUM ('desktop', 'mobile', 'tablet');

-- ============================================================================
-- SECTION B: TABLES (11 total)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE 1: users - Core user entity
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'user',
    status user_status NOT NULL DEFAULT 'active',
    referral_code VARCHAR(20) NOT NULL UNIQUE,
    referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
    total_referrals INTEGER NOT NULL DEFAULT 0,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_joined TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Core user entity linked to Supabase Auth';

-- ----------------------------------------------------------------------------
-- TABLE 2: api_keys - API key management
-- ----------------------------------------------------------------------------
CREATE TABLE api_keys (
    id VARCHAR(20) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_preview VARCHAR(30) NOT NULL,
    key_type api_key_type NOT NULL DEFAULT 'public',
    enabled BOOLEAN NOT NULL DEFAULT true,
    rate_limit INTEGER NOT NULL DEFAULT 60,
    total_requests BIGINT NOT NULL DEFAULT 0,
    success_count BIGINT NOT NULL DEFAULT 0,
    error_count BIGINT NOT NULL DEFAULT 0,
    last_used TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_keys IS 'User API keys for premium access';

-- ----------------------------------------------------------------------------
-- TABLE 3: admin_cookie_pool - Cookie rotation pool
-- ----------------------------------------------------------------------------
CREATE TABLE admin_cookie_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    cookie TEXT NOT NULL,
    label TEXT,
    user_id TEXT,
    status cookie_status NOT NULL DEFAULT 'healthy',
    enabled BOOLEAN NOT NULL DEFAULT true,
    use_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    cooldown_until TIMESTAMPTZ,
    max_uses_per_hour INTEGER NOT NULL DEFAULT 60,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_cookie_pool IS 'Cookie pool for platform scraping with rotation';

-- ----------------------------------------------------------------------------
-- TABLE 4: browser_profiles - User agent pool
-- ----------------------------------------------------------------------------
CREATE TABLE browser_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL DEFAULT 'all',
    label TEXT NOT NULL,
    note TEXT,
    user_agent TEXT NOT NULL,
    sec_ch_ua TEXT,
    sec_ch_ua_platform TEXT,
    sec_ch_ua_mobile TEXT DEFAULT '?0',
    accept_language TEXT DEFAULT 'en-US,en;q=0.9',
    browser browser_type NOT NULL DEFAULT 'chrome',
    device_type device_type NOT NULL DEFAULT 'desktop',
    os TEXT,
    is_chromium BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 5,
    use_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE browser_profiles IS 'User agent profiles for anti-detection';

-- ----------------------------------------------------------------------------
-- TABLE 5: ai_api_keys - Multi-provider AI keys
-- ----------------------------------------------------------------------------
CREATE TABLE ai_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider ai_provider NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    use_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    rate_limit_reset TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_api_keys IS 'AI provider API keys (Gemini, OpenAI, etc.)';

-- ----------------------------------------------------------------------------
-- TABLE 6: special_referrals - Admin-created referral codes
-- ----------------------------------------------------------------------------
CREATE TABLE special_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'user',
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    note TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE special_referrals IS 'Admin-created special referral codes';

-- ----------------------------------------------------------------------------
-- TABLE 7: download_stats - Analytics (with country, source)
-- ----------------------------------------------------------------------------
CREATE TABLE download_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    platform TEXT NOT NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'XX',
    source VARCHAR(20) NOT NULL DEFAULT 'web',
    total_requests BIGINT NOT NULL DEFAULT 0,
    success_count BIGINT NOT NULL DEFAULT 0,
    error_count BIGINT NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    api_requests BIGINT NOT NULL DEFAULT 0,
    public_requests BIGINT NOT NULL DEFAULT 0,
    avg_response_time INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(date, platform, country, source)
);

COMMENT ON TABLE download_stats IS 'Aggregated download statistics per day/platform/country/source';

-- ----------------------------------------------------------------------------
-- TABLE 8: error_logs - Error monitoring (with error_type)
-- ----------------------------------------------------------------------------
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    platform TEXT,
    error_type VARCHAR(50),
    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    request_url TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id VARCHAR(20) REFERENCES api_keys(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE error_logs IS 'Error logs for monitoring and debugging';

-- ----------------------------------------------------------------------------
-- TABLE 9: alert_config - Admin alerts (singleton pattern)
-- ----------------------------------------------------------------------------
CREATE TABLE alert_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_error_spike BOOLEAN NOT NULL DEFAULT false,
    alert_cookie_low BOOLEAN NOT NULL DEFAULT false,
    alert_platform_down BOOLEAN NOT NULL DEFAULT false,
    alert_rate_limit BOOLEAN NOT NULL DEFAULT false,
    error_spike_threshold INTEGER NOT NULL DEFAULT 50,
    error_spike_window INTEGER NOT NULL DEFAULT 5,
    cookie_low_threshold INTEGER NOT NULL DEFAULT 3,
    platform_down_threshold INTEGER NOT NULL DEFAULT 5,
    rate_limit_threshold INTEGER NOT NULL DEFAULT 100,
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    last_alert_at TIMESTAMPTZ,
    last_alert_type VARCHAR(50),
    notify_email BOOLEAN NOT NULL DEFAULT false,
    notify_discord BOOLEAN NOT NULL DEFAULT false,
    discord_webhook_url TEXT,
    email_recipients TEXT[],
    health_check_enabled BOOLEAN NOT NULL DEFAULT true,
    health_check_interval INTEGER NOT NULL DEFAULT 5,
    last_health_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alert_config IS 'Singleton table for admin alert configuration';

-- ----------------------------------------------------------------------------
-- TABLE 10: service_config - Platform control
-- Note: Global maintenance is in system_config.service_global.maintenanceType
-- This table is for per-platform settings only (enabled, rate_limit, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE service_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    rate_limit INTEGER NOT NULL DEFAULT 60,
    require_cookie BOOLEAN NOT NULL DEFAULT false,
    require_auth BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 5,
    last_check TIMESTAMPTZ,
    health_status TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE service_config IS 'Per-platform service configuration (global maintenance in system_config)';

-- ----------------------------------------------------------------------------
-- TABLE 11: system_config - Global settings (JSONB key-value)
-- ----------------------------------------------------------------------------
CREATE TABLE system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE system_config IS 'Global system configuration key-value store';

-- ============================================================================
-- SECTION C: INDEXES
-- ============================================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral ON users(referral_code);
CREATE INDEX idx_users_referred_by ON users(referred_by);
CREATE INDEX idx_users_role ON users(role) WHERE role = 'admin';
CREATE INDEX idx_users_status ON users(status);

-- API Keys indexes
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_enabled ON api_keys(enabled) WHERE enabled = true;

-- Cookie Pool indexes
CREATE INDEX idx_cookie_pool_platform ON admin_cookie_pool(platform);
CREATE INDEX idx_cookie_pool_status ON admin_cookie_pool(status);
CREATE INDEX idx_cookie_pool_rotation ON admin_cookie_pool(platform, enabled, status, cooldown_until, last_used_at);

-- Browser Profiles indexes
CREATE INDEX idx_browser_profiles_platform ON browser_profiles(platform);
CREATE INDEX idx_browser_profiles_rotation ON browser_profiles(platform, enabled, priority DESC, last_used_at ASC NULLS FIRST);

-- AI Keys indexes
CREATE INDEX idx_ai_keys_provider ON ai_api_keys(provider);
CREATE INDEX idx_ai_keys_enabled ON ai_api_keys(enabled) WHERE enabled = true;

-- Special Referrals indexes
CREATE INDEX idx_special_referrals_code ON special_referrals(code) WHERE is_active = true;

-- Download Stats indexes
CREATE INDEX idx_download_stats_date ON download_stats(date DESC);
CREATE INDEX idx_download_stats_platform ON download_stats(platform, date DESC);
CREATE INDEX idx_download_stats_country ON download_stats(country, date DESC);
CREATE INDEX idx_download_stats_source ON download_stats(source, date DESC);

-- Error Logs indexes
CREATE INDEX idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX idx_error_logs_platform ON error_logs(platform, timestamp DESC);
CREATE INDEX idx_error_logs_type ON error_logs(error_type, timestamp DESC);
CREATE INDEX idx_error_logs_unresolved ON error_logs(resolved, timestamp DESC) WHERE resolved = false;

-- Service Config indexes
CREATE INDEX idx_service_config_platform ON service_config(platform);
CREATE INDEX idx_service_config_enabled ON service_config(enabled) WHERE enabled = true;

-- ============================================================================
-- SECTION D: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_cookie_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Users RLS Policies
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_service" ON users FOR ALL TO service_role USING (true);

-- API Keys RLS Policies
CREATE POLICY "apikeys_owner_select" ON api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "apikeys_owner_insert" ON api_keys FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "apikeys_owner_update" ON api_keys FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "apikeys_owner_delete" ON api_keys FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "apikeys_service" ON api_keys FOR ALL TO service_role USING (true);

-- Admin-only tables (Service role only)
CREATE POLICY "cookie_pool_service" ON admin_cookie_pool FOR ALL TO service_role USING (true);
CREATE POLICY "browser_profiles_service" ON browser_profiles FOR ALL TO service_role USING (true);
CREATE POLICY "ai_keys_service" ON ai_api_keys FOR ALL TO service_role USING (true);
CREATE POLICY "error_logs_service" ON error_logs FOR ALL TO service_role USING (true);
CREATE POLICY "alert_config_service" ON alert_config FOR ALL TO service_role USING (true);
CREATE POLICY "system_config_service" ON system_config FOR ALL TO service_role USING (true);

-- Public read tables
CREATE POLICY "special_referrals_select" ON special_referrals FOR SELECT USING (true);
CREATE POLICY "special_referrals_service" ON special_referrals FOR ALL TO service_role USING (true);

CREATE POLICY "download_stats_select" ON download_stats FOR SELECT USING (true);
CREATE POLICY "download_stats_service" ON download_stats FOR ALL TO service_role USING (true);

CREATE POLICY "service_config_select" ON service_config FOR SELECT USING (true);
CREATE POLICY "service_config_service" ON service_config FOR ALL TO service_role USING (true);


-- ============================================================================
-- SECTION E: FUNCTIONS
-- ============================================================================

-- Function: update_timestamp()
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: handle_new_user()
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, referral_code, first_joined, last_seen)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        'XTF' || upper(substr(md5(random()::text), 1, 8)),
        NOW(),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: increment_api_key_success()
CREATE OR REPLACE FUNCTION increment_api_key_success(key_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE api_keys 
    SET total_requests = total_requests + 1, 
        success_count = success_count + 1, 
        last_used = NOW() 
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: increment_api_key_error()
CREATE OR REPLACE FUNCTION increment_api_key_error(key_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE api_keys 
    SET total_requests = total_requests + 1, 
        error_count = error_count + 1, 
        last_used = NOW() 
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: reset_expired_cooldowns()
CREATE OR REPLACE FUNCTION reset_expired_cooldowns()
RETURNS void AS $$
BEGIN
    UPDATE admin_cookie_pool 
    SET status = 'healthy', cooldown_until = NULL
    WHERE status = 'cooldown' 
      AND cooldown_until IS NOT NULL 
      AND cooldown_until < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: validate_special_referral()
CREATE OR REPLACE FUNCTION validate_special_referral(ref_code VARCHAR)
RETURNS TABLE(is_valid BOOLEAN, assigned_role user_role, error_msg TEXT) AS $$
DECLARE
    ref_record RECORD;
BEGIN
    SELECT * INTO ref_record FROM special_referrals WHERE code = ref_code AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Invalid referral code'::TEXT;
        RETURN;
    END IF;
    
    IF ref_record.expires_at IS NOT NULL AND ref_record.expires_at < NOW() THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Referral code has expired'::TEXT;
        RETURN;
    END IF;
    
    IF ref_record.max_uses IS NOT NULL AND ref_record.current_uses >= ref_record.max_uses THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Referral code has reached max uses'::TEXT;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT true, ref_record.role, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: use_special_referral()
CREATE OR REPLACE FUNCTION use_special_referral(ref_code VARCHAR)
RETURNS user_role AS $$
DECLARE
    ref_record RECORD;
BEGIN
    SELECT * INTO ref_record FROM special_referrals WHERE code = ref_code AND is_active = true FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN 'user'::user_role; 
    END IF;
    
    UPDATE special_referrals SET current_uses = current_uses + 1 WHERE id = ref_record.id;
    
    IF ref_record.max_uses IS NOT NULL AND (ref_record.current_uses + 1) >= ref_record.max_uses THEN
        UPDATE special_referrals SET is_active = false WHERE id = ref_record.id;
    END IF;
    
    RETURN ref_record.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: record_download_stat()
CREATE OR REPLACE FUNCTION record_download_stat(
    p_platform TEXT,
    p_country VARCHAR(2) DEFAULT 'XX',
    p_source VARCHAR(20) DEFAULT 'web',
    p_success BOOLEAN DEFAULT true,
    p_response_time INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO download_stats (date, platform, country, source, total_requests, success_count, error_count, avg_response_time)
    VALUES (
        CURRENT_DATE,
        p_platform,
        COALESCE(p_country, 'XX'),
        COALESCE(p_source, 'web'),
        1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        p_response_time
    )
    ON CONFLICT (date, platform, country, source)
    DO UPDATE SET
        total_requests = download_stats.total_requests + 1,
        success_count = download_stats.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
        error_count = download_stats.error_count + CASE WHEN p_success THEN 0 ELSE 1 END,
        avg_response_time = CASE 
            WHEN p_response_time IS NOT NULL THEN 
                COALESCE((download_stats.avg_response_time * download_stats.total_requests + p_response_time) / (download_stats.total_requests + 1), p_response_time)
            ELSE download_stats.avg_response_time
        END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: record_error_log()
CREATE OR REPLACE FUNCTION record_error_log(
    p_platform TEXT,
    p_error_type TEXT,
    p_error_code TEXT,
    p_error_message TEXT,
    p_error_stack TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_api_key_id VARCHAR(20) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO error_logs (
        platform, error_type, error_code, error_message, error_stack,
        user_id, api_key_id, ip_address, user_agent, request_url
    )
    VALUES (
        p_platform, p_error_type, p_error_code, p_error_message, p_error_stack,
        p_user_id, p_api_key_id, p_ip_address, p_user_agent, p_request_url
    )
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION F: TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_users_updated 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_cookie_pool_updated 
    BEFORE UPDATE ON admin_cookie_pool 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_browser_profiles_updated 
    BEFORE UPDATE ON browser_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_ai_keys_updated 
    BEFORE UPDATE ON ai_api_keys 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_download_stats_updated 
    BEFORE UPDATE ON download_stats 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_alert_config_updated 
    BEFORE UPDATE ON alert_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_service_config_updated 
    BEFORE UPDATE ON service_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_system_config_updated 
    BEFORE UPDATE ON system_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger for new user creation from auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- SECTION G: VIEWS (5 total)
-- ============================================================================

-- View 1: cookie_pool_stats
CREATE OR REPLACE VIEW cookie_pool_stats AS
SELECT 
    platform,
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE enabled = true)::int as enabled_count,
    COUNT(*) FILTER (WHERE status = 'healthy' AND enabled = true)::int as healthy_count,
    COUNT(*) FILTER (WHERE status = 'cooldown')::int as cooldown_count,
    COUNT(*) FILTER (WHERE status = 'expired')::int as expired_count,
    COUNT(*) FILTER (WHERE enabled = false)::int as disabled_count,
    COALESCE(SUM(use_count), 0)::bigint as total_uses,
    COALESCE(SUM(success_count), 0)::bigint as total_success,
    COALESCE(SUM(error_count), 0)::bigint as total_errors
FROM admin_cookie_pool
GROUP BY platform;

-- View 2: browser_profiles_stats
CREATE OR REPLACE VIEW browser_profiles_stats AS
SELECT 
    platform,
    browser,
    device_type,
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE enabled = true)::int as enabled_count,
    COALESCE(SUM(use_count), 0)::bigint as total_uses,
    COALESCE(SUM(success_count), 0)::bigint as total_success,
    COALESCE(SUM(error_count), 0)::bigint as total_errors
FROM browser_profiles
GROUP BY platform, browser, device_type;

-- View 3: daily_download_summary
CREATE OR REPLACE VIEW daily_download_summary AS
SELECT 
    date,
    SUM(total_requests)::bigint as total_requests,
    SUM(success_count)::bigint as total_success,
    SUM(error_count)::bigint as total_errors,
    ROUND(SUM(success_count)::numeric / NULLIF(SUM(total_requests), 0) * 100, 2) as success_rate,
    SUM(unique_users)::int as unique_users
FROM download_stats
GROUP BY date
ORDER BY date DESC;

-- View 4: download_stats_summary
CREATE OR REPLACE VIEW download_stats_summary AS
SELECT 
    platform,
    SUM(total_requests)::bigint as total_requests,
    SUM(success_count)::bigint as total_success,
    SUM(error_count)::bigint as total_errors,
    ROUND(SUM(success_count)::numeric / NULLIF(SUM(total_requests), 0) * 100, 2) as success_rate,
    ROUND(AVG(avg_response_time), 0)::int as avg_response_time
FROM download_stats
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY platform;

-- View 5: error_logs_summary
CREATE OR REPLACE VIEW error_logs_summary AS
SELECT 
    platform,
    error_type,
    COUNT(*)::int as error_count,
    COUNT(DISTINCT error_code)::int as unique_errors,
    MAX(timestamp) as last_error_at
FROM error_logs
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY platform, error_type
ORDER BY error_count DESC;

-- ============================================================================
-- SECTION H: DEFAULT DATA
-- ============================================================================

-- Insert default alert_config (singleton row)
INSERT INTO alert_config (
    id, alert_error_spike, alert_cookie_low, alert_platform_down, alert_rate_limit,
    error_spike_threshold, error_spike_window, cookie_low_threshold, platform_down_threshold,
    rate_limit_threshold, cooldown_minutes, notify_email, notify_discord,
    health_check_enabled, health_check_interval
) VALUES (
    gen_random_uuid(), false, false, false, false,
    50, 5, 3, 5, 100, 30, false, false, true, 5
);

-- Insert default service_config for all platforms
-- Note: No maintenance column - global maintenance is in system_config.service_global
INSERT INTO service_config (platform, enabled, rate_limit, require_cookie, require_auth, priority, health_status) VALUES
    ('facebook', true, 60, true, false, 5, 'unknown'),
    ('instagram', true, 60, true, false, 5, 'unknown'),
    ('twitter', true, 60, false, false, 5, 'unknown'),
    ('tiktok', true, 60, false, false, 5, 'unknown'),
    ('weibo', true, 60, false, false, 5, 'unknown'),
    ('youtube', true, 60, false, false, 5, 'unknown');

-- Insert default system_config settings (JSONB format)
-- service_global: Main config used by serviceConfigLoad() and serviceConfigSaveGlobal()
INSERT INTO system_config (key, value, description) VALUES
    ('service_global', '{"maintenanceMode":false,"maintenanceType":"off","maintenanceMessage":"🔧 DownAria is under maintenance. Please try again later.","globalRateLimit":10,"playgroundEnabled":true,"playgroundRateLimit":3,"geminiRateLimit":60,"geminiRateWindow":1,"apiKeyRequired":false,"lastUpdated":"2025-01-01T00:00:00.000Z"}', 'Global service configuration');

-- ============================================================================
-- SECTION I: GRANTS
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant permissions to anon
GRANT SELECT ON users TO anon;
GRANT SELECT ON special_referrals TO anon;
GRANT SELECT ON download_stats TO anon;
GRANT SELECT ON service_config TO anon;
GRANT SELECT ON cookie_pool_stats TO anon;
GRANT SELECT ON browser_profiles_stats TO anon;
GRANT SELECT ON daily_download_summary TO anon;
GRANT SELECT ON download_stats_summary TO anon;
GRANT SELECT ON error_logs_summary TO anon;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO authenticated;
GRANT SELECT ON special_referrals TO authenticated;
GRANT SELECT ON download_stats TO authenticated;
GRANT SELECT ON service_config TO authenticated;
GRANT SELECT ON cookie_pool_stats TO authenticated;
GRANT SELECT ON browser_profiles_stats TO authenticated;
GRANT SELECT ON daily_download_summary TO authenticated;
GRANT SELECT ON download_stats_summary TO authenticated;
GRANT SELECT ON error_logs_summary TO authenticated;

-- Grant full permissions to service_role
GRANT ALL ON users TO service_role;
GRANT ALL ON api_keys TO service_role;
GRANT ALL ON admin_cookie_pool TO service_role;
GRANT ALL ON browser_profiles TO service_role;
GRANT ALL ON ai_api_keys TO service_role;
GRANT ALL ON special_referrals TO service_role;
GRANT ALL ON download_stats TO service_role;
GRANT ALL ON error_logs TO service_role;
GRANT ALL ON alert_config TO service_role;
GRANT ALL ON service_config TO service_role;
GRANT ALL ON system_config TO service_role;

-- Grant view access to service_role
GRANT SELECT ON cookie_pool_stats TO service_role;
GRANT SELECT ON browser_profiles_stats TO service_role;
GRANT SELECT ON daily_download_summary TO service_role;
GRANT SELECT ON download_stats_summary TO service_role;
GRANT SELECT ON error_logs_summary TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION update_timestamp() TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION increment_api_key_success(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION increment_api_key_error(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION reset_expired_cooldowns() TO service_role;
GRANT EXECUTE ON FUNCTION validate_special_referral(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION validate_special_referral(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION use_special_referral(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION record_download_stat(TEXT, VARCHAR, VARCHAR, BOOLEAN, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION record_error_log(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, VARCHAR, INET, TEXT, TEXT) TO service_role;

-- ============================================================================
-- SECTION J: BOT TABLES (Telegram Bot)
-- ============================================================================

-- BOT USERS TABLE
CREATE TABLE IF NOT EXISTS bot_users (
    id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    language_code TEXT DEFAULT 'en',
    is_banned BOOLEAN DEFAULT false,
    is_admin BOOLEAN DEFAULT false,
    api_key_id VARCHAR(20) REFERENCES api_keys(id) ON DELETE SET NULL,
    premium_expires_at TIMESTAMPTZ,
    daily_downloads INT DEFAULT 0,
    last_download_reset TIMESTAMPTZ,
    daily_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE bot_users IS 'Telegram bot user records';
COMMENT ON COLUMN bot_users.id IS 'Telegram user ID (primary key)';
COMMENT ON COLUMN bot_users.api_key_id IS 'Optional link to premium API key';
COMMENT ON COLUMN bot_users.premium_expires_at IS 'Premium expiry date (NULL = no premium)';
COMMENT ON COLUMN bot_users.daily_downloads IS 'Number of downloads today (resets daily)';
COMMENT ON COLUMN bot_users.daily_reset_at IS 'Timestamp when daily downloads were last reset';

-- BOT DOWNLOADS TABLE
CREATE TABLE IF NOT EXISTS bot_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES bot_users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'pending',
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE bot_downloads IS 'Download history for Telegram bot users';
COMMENT ON COLUMN bot_downloads.status IS 'Download status: pending, success, failed';
COMMENT ON COLUMN bot_downloads.is_premium IS 'Whether download was made with premium account';

-- BOT INDEXES
CREATE INDEX IF NOT EXISTS idx_bot_users_api_key ON bot_users(api_key_id);
CREATE INDEX IF NOT EXISTS idx_bot_users_banned ON bot_users(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_bot_downloads_user ON bot_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_downloads_created ON bot_downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_bot_downloads_platform ON bot_downloads(platform);

-- BOT RLS
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_users_service" ON bot_users FOR ALL TO service_role USING (true);
CREATE POLICY "bot_downloads_service" ON bot_downloads FOR ALL TO service_role USING (true);

-- BOT TRIGGER
CREATE TRIGGER trigger_bot_users_updated
    BEFORE UPDATE ON bot_users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- BOT GRANTS
GRANT ALL ON bot_users TO service_role;
GRANT ALL ON bot_downloads TO service_role;

-- ============================================================================
-- END OF SEED SCRIPT
-- ============================================================================
