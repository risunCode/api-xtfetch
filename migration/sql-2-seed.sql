-- ============================================================================
-- XTFetch Database Full Seed Script v3
-- Run this AFTER sql-1-reset.sql
-- Last Updated: December 2025
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- TYPES
-- ═══════════════════════════════════════════════════════════════
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- ═══════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(50) UNIQUE,
    display_name VARCHAR(100),
    role user_role DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    is_frozen BOOLEAN DEFAULT false,
    referral_code VARCHAR(20) UNIQUE,
    referred_by UUID REFERENCES users(id),
    total_referrals INTEGER DEFAULT 0,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    id VARCHAR(20) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_preview VARCHAR(30) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    rate_limit INTEGER DEFAULT 60,
    total_requests BIGINT DEFAULT 0,
    success_count BIGINT DEFAULT 0,
    error_count BIGINT DEFAULT 0,
    last_used TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE downloads (
    id BIGSERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    quality VARCHAR(20) DEFAULT 'unknown',
    source VARCHAR(20) DEFAULT 'web',
    country VARCHAR(5) DEFAULT 'XX',
    success BOOLEAN DEFAULT true,
    error_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE errors (
    id BIGSERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    source VARCHAR(20) DEFAULT 'web',
    country VARCHAR(5) DEFAULT 'XX',
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_config (
    id VARCHAR(50) PRIMARY KEY,
    enabled BOOLEAN DEFAULT true,
    method VARCHAR(100),
    rate_limit INTEGER DEFAULT 10,
    cache_time INTEGER DEFAULT 300,
    disabled_message TEXT,
    maintenance_mode BOOLEAN DEFAULT false,
    maintenance_type VARCHAR(10) DEFAULT 'off',
    maintenance_message TEXT,
    api_key_required BOOLEAN DEFAULT true,
    playground_enabled BOOLEAN DEFAULT true,
    playground_rate_limit INTEGER DEFAULT 5,
    stats JSONB DEFAULT '{"totalRequests":0,"successCount":0,"errorCount":0,"avgResponseTime":0}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE global_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE special_referrals (
    code VARCHAR(20) PRIMARY KEY,
    role_grant user_role NOT NULL,
    used_by UUID REFERENCES users(id),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'info',
    pages TEXT[] DEFAULT ARRAY['home'],
    enabled BOOLEAN DEFAULT true,
    show_once BOOLEAN DEFAULT false,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- COOKIE POOL
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE admin_cookie_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    cookie TEXT NOT NULL,
    label TEXT,
    user_id TEXT,
    status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'cooldown', 'expired', 'disabled')),
    last_used_at TIMESTAMPTZ,
    use_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_error TEXT,
    cooldown_until TIMESTAMPTZ,
    max_uses_per_hour INT DEFAULT 60,
    enabled BOOLEAN DEFAULT true,
    note TEXT,
    last_health_check_at TIMESTAMPTZ,
    health_check_result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE push_notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT,
    url TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    sent_by TEXT,
    total_sent INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════
-- PLAYGROUND EXAMPLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE playground_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- BROWSER PROFILES (replaces useragent_pool)
-- ═══════════════════════════════════════════════════════════════

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
    browser TEXT NOT NULL DEFAULT 'chrome',
    device_type TEXT DEFAULT 'desktop',
    os TEXT,
    is_chromium BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 5,
    use_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_device_type CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
    CONSTRAINT valid_browser CHECK (browser IN ('chrome', 'firefox', 'safari', 'edge', 'opera', 'other'))
);

-- ═══════════════════════════════════════════════════════════════
-- SYSTEM CONFIG (centralized settings)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE system_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    cache_ttl_config INT DEFAULT 30000,
    cache_ttl_apikeys INT DEFAULT 10000,
    cache_ttl_cookies INT DEFAULT 300000,
    cache_ttl_useragents INT DEFAULT 300000,
    cache_ttl_playground_url INT DEFAULT 120000,
    http_timeout INT DEFAULT 15000,
    http_max_redirects INT DEFAULT 10,
    scraper_timeout_facebook INT DEFAULT 10000,
    scraper_timeout_instagram INT DEFAULT 15000,
    scraper_timeout_twitter INT DEFAULT 15000,
    scraper_timeout_tiktok INT DEFAULT 10000,
    scraper_timeout_weibo INT DEFAULT 15000,
    scraper_timeout_youtube INT DEFAULT 20000,
    scraper_max_retries INT DEFAULT 2,
    scraper_retry_delay INT DEFAULT 1000,
    cookie_cooldown_minutes INT DEFAULT 30,
    cookie_max_uses_default INT DEFAULT 100,
    rate_limit_public INT DEFAULT 15,
    rate_limit_api_key INT DEFAULT 100,
    rate_limit_auth INT DEFAULT 10,
    rate_limit_admin INT DEFAULT 60,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- ADMIN ALERTS CONFIG
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE admin_alerts_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_url TEXT,
    enabled BOOLEAN DEFAULT true,
    alert_error_spike BOOLEAN DEFAULT true,
    alert_cookie_low BOOLEAN DEFAULT true,
    alert_platform_down BOOLEAN DEFAULT true,
    error_spike_threshold INT DEFAULT 10,
    error_spike_window INT DEFAULT 5,
    cookie_low_threshold INT DEFAULT 2,
    platform_down_threshold INT DEFAULT 5,
    cooldown_minutes INT DEFAULT 15,
    last_alert_at TIMESTAMPTZ,
    last_alert_type TEXT,
    health_check_enabled BOOLEAN DEFAULT true,
    health_check_interval INT DEFAULT 6,
    last_health_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX idx_downloads_platform ON downloads(platform);
CREATE INDEX idx_downloads_created ON downloads(created_at DESC);
CREATE INDEX idx_downloads_success ON downloads(success);
CREATE INDEX idx_errors_platform ON errors(platform);
CREATE INDEX idx_errors_created ON errors(created_at DESC);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_cookie_pool_rotation ON admin_cookie_pool(platform, enabled, status, cooldown_until, last_used_at);
CREATE INDEX idx_cookie_pool_platform ON admin_cookie_pool(platform);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_push_history_sent_at ON push_notification_history(sent_at DESC);
CREATE INDEX idx_playground_examples_platform ON playground_examples(platform);
CREATE INDEX idx_browser_profiles_platform ON browser_profiles(platform);
CREATE INDEX idx_browser_profiles_enabled ON browser_profiles(enabled);
CREATE INDEX idx_browser_profiles_rotation ON browser_profiles(platform, enabled, priority DESC, last_used_at ASC NULLS FIRST);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_cookie_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE playground_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "users_select" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "apikeys_owner" ON api_keys FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "apikeys_anon_select" ON api_keys FOR SELECT TO anon USING (enabled = true);
CREATE POLICY "downloads_all" ON downloads FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "errors_all" ON errors FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "config_select" ON service_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "config_write" ON service_config FOR ALL TO authenticated USING (true);
CREATE POLICY "settings_all" ON global_settings FOR ALL TO anon, authenticated USING (true);
CREATE POLICY "referrals_select" ON special_referrals FOR SELECT TO anon, authenticated USING (used_by IS NULL);
CREATE POLICY "referrals_update" ON special_referrals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "announcements_select" ON announcements FOR SELECT TO anon, authenticated USING (enabled = true);
CREATE POLICY "announcements_write" ON announcements FOR ALL TO authenticated USING (true);
CREATE POLICY "cookie_pool_all" ON admin_cookie_pool FOR ALL USING (true);
CREATE POLICY "push_subs_all" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "push_history_all" ON push_notification_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "playground_examples_all" ON playground_examples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "browser_profiles_all" ON browser_profiles FOR ALL USING (true);
CREATE POLICY "system_config_read" ON system_config FOR SELECT USING (true);
CREATE POLICY "system_config_write" ON system_config FOR ALL USING (true);
CREATE POLICY "admin_alerts_config_all" ON admin_alerts_config FOR ALL USING (true);


-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $
BEGIN
    INSERT INTO public.users (id, email, username, referral_code)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'username',
        'XTF' || upper(substr(md5(random()::text), 1, 8))
    );
    RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION process_referral(user_id UUID, ref_code VARCHAR)
RETURNS BOOLEAN AS $
DECLARE
    special_role user_role;
    referrer UUID;
BEGIN
    SELECT role_grant INTO special_role FROM special_referrals WHERE code = ref_code AND used_by IS NULL;
    IF special_role IS NOT NULL THEN
        UPDATE special_referrals SET used_by = user_id, used_at = NOW() WHERE code = ref_code;
        UPDATE users SET role = special_role WHERE id = user_id;
        RETURN true;
    END IF;
    SELECT id INTO referrer FROM users WHERE referral_code = ref_code;
    IF referrer IS NOT NULL THEN
        UPDATE users SET referred_by = referrer WHERE id = user_id;
        UPDATE users SET total_referrals = total_referrals + 1 WHERE id = referrer;
        RETURN true;
    END IF;
    RETURN false;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_api_key_success(key_id VARCHAR)
RETURNS VOID AS $
BEGIN
    UPDATE api_keys SET total_requests = total_requests + 1, success_count = success_count + 1, last_used = NOW() WHERE id = key_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_api_key_error(key_id VARCHAR)
RETURNS VOID AS $
BEGIN
    UPDATE api_keys SET total_requests = total_requests + 1, error_count = error_count + 1, last_used = NOW() WHERE id = key_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_cookie_pool_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_expired_cooldowns()
RETURNS void AS $
BEGIN
    UPDATE admin_cookie_pool SET status = 'healthy', cooldown_until = NULL
    WHERE status = 'cooldown' AND cooldown_until IS NOT NULL AND cooldown_until < NOW();
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_push_subscriptions()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM push_subscriptions 
    WHERE is_active = false 
       OR (last_used_at IS NOT NULL AND last_used_at < NOW() - INTERVAL '90 days')
       OR (last_used_at IS NULL AND created_at < NOW() - INTERVAL '90 days');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_browser_profiles_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_profile_use(profile_id UUID)
RETURNS void AS $
BEGIN
    UPDATE browser_profiles SET use_count = use_count + 1, last_used_at = NOW() WHERE id = profile_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_profile_success(profile_id UUID)
RETURNS void AS $
BEGIN
    UPDATE browser_profiles SET success_count = success_count + 1, last_error = NULL WHERE id = profile_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_profile_error(profile_id UUID, error_msg TEXT)
RETURNS void AS $
BEGIN
    UPDATE browser_profiles SET error_count = error_count + 1, last_error = error_msg WHERE id = profile_id;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_system_config_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_admin_alerts_timestamp()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER trigger_cookie_pool_updated
    BEFORE UPDATE ON admin_cookie_pool
    FOR EACH ROW EXECUTE FUNCTION update_cookie_pool_timestamp();

CREATE TRIGGER trigger_browser_profiles_updated
    BEFORE UPDATE ON browser_profiles
    FOR EACH ROW EXECUTE FUNCTION update_browser_profiles_timestamp();

CREATE TRIGGER trigger_system_config_updated
    BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_system_config_timestamp();

CREATE TRIGGER trigger_admin_alerts_updated
    BEFORE UPDATE ON admin_alerts_config
    FOR EACH ROW EXECUTE FUNCTION update_admin_alerts_timestamp();

-- ═══════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════

GRANT SELECT ON cookie_pool_stats TO authenticated;
GRANT SELECT ON cookie_pool_stats TO anon;
GRANT SELECT ON browser_profiles_stats TO authenticated;
GRANT SELECT ON browser_profiles_stats TO anon;
GRANT SELECT ON system_config TO authenticated;
GRANT SELECT ON system_config TO anon;
GRANT EXECUTE ON FUNCTION reset_expired_cooldowns() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_expired_cooldowns() TO anon;
GRANT EXECUTE ON FUNCTION increment_profile_use(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_profile_use(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_profile_success(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_profile_success(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_profile_error(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_profile_error(UUID, TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════

-- Service Config (Global + Platforms)
INSERT INTO service_config (id, enabled, method, rate_limit, cache_time, maintenance_mode, maintenance_type, maintenance_message, api_key_required, playground_enabled, playground_rate_limit) VALUES
    ('global', true, NULL, 60, 300, false, 'off', '🔧 XTFetch is under maintenance. Please try again later.', true, true, 5);

INSERT INTO service_config (id, enabled, method, rate_limit, cache_time, maintenance_mode, disabled_message) VALUES
    ('facebook', true, 'HTML Scraping', 10, 300, false, NULL),
    ('instagram', true, 'GraphQL API', 15, 300, false, NULL),
    ('twitter', true, 'Syndication + GraphQL', 20, 300, false, NULL),
    ('tiktok', true, 'TikWM API', 15, 300, false, NULL),
    ('youtube', true, 'External API', 10, 600, false, NULL),
    ('weibo', true, 'Mobile API', 10, 300, false, NULL),
    ('douyin', false, 'TikWM API', 10, 300, false, 'Douyin service is currently offline.');

-- Global Settings
INSERT INTO global_settings (key, value) VALUES
    ('site_name', 'XTFetch'),
    ('site_description', 'Social Media Video Downloader'),
    ('referral_enabled', 'true'),
    ('referral_bonus', '0'),
    ('discord_invite', ''),
    ('telegram_channel', ''),
    ('github_repo', ''),
    ('discord_webhook_url', ''),
    ('discord_notify_enabled', 'false'),
    ('discord_embed_enabled', 'true'),
    ('discord_template', '**Platform:** [platform]
**Quality:** [quality]
**Title:** [title]

[media]

🔗 [embed_links]'),
    ('discord_embed', '{"title":"🎬 New Download","description":"","color":"#5865F2","authorName":"XTFetch","authorIcon":"/icon.png","thumbnail":"","image":"","footerText":"XTFetch API Engine","footerIcon":"/icon.png","fields":[]}'),
    ('logging_enabled', 'true'),
    ('cache_ttl', '259200'),
    ('update_prompt_enabled', 'true'),
    ('update_prompt_mode', 'always'),
    ('update_prompt_delay_seconds', '0'),
    ('update_prompt_dismissable', 'true'),
    ('update_prompt_custom_message', ''),
    ('maintenance_details', ''),
    ('maintenance_estimated_end', ''),
    ('maintenance_content', ''),
    ('maintenance_last_updated', '');

-- Special Referrals
INSERT INTO special_referrals (code, role_grant) VALUES ('XTFADMIN001', 'admin');

-- Default Announcement
INSERT INTO announcements (title, message, type, pages, enabled) VALUES 
    ('Welcome to XTFetch!', 'Download videos from social media without watermark. Paste any URL to get started!', 'info', ARRAY['home'], true);

-- Playground Examples
INSERT INTO playground_examples (platform, name, url) VALUES
    ('facebook', 'Facebook Video', 'https://www.facebook.com/watch/?v=123456789'),
    ('instagram', 'Instagram Reel', 'https://www.instagram.com/reel/ABC123/'),
    ('twitter', 'Twitter Video', 'https://twitter.com/user/status/123456789'),
    ('tiktok', 'TikTok Video', 'https://www.tiktok.com/@user/video/123456789'),
    ('youtube', 'YouTube Video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ('weibo', 'Weibo Video', 'https://weibo.com/tv/show/123456789');

-- System Config (default)
INSERT INTO system_config (id) VALUES ('default');

-- Admin Alerts Config (default)
INSERT INTO admin_alerts_config (id) VALUES ('00000000-0000-0000-0000-000000000001');


-- Browser Profiles (default)
INSERT INTO browser_profiles (platform, label, user_agent, sec_ch_ua, sec_ch_ua_platform, browser, device_type, os, is_chromium, priority) VALUES
-- Chrome Windows (High Priority)
('all', 'Chrome 143 Windows', 
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 10),

-- Chrome Mac
('all', 'Chrome 143 macOS',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"macOS"', 'chrome', 'desktop', 'macos', true, 10),

-- Firefox Windows
('all', 'Firefox 134 Windows',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
 NULL, NULL, 'firefox', 'desktop', 'windows', false, 5),

-- Safari Mac
('all', 'Safari 18.2 macOS',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
 NULL, NULL, 'safari', 'desktop', 'macos', false, 5),

-- Edge Windows
('all', 'Edge 143 Windows',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
 '"Microsoft Edge";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'edge', 'desktop', 'windows', true, 8),

-- Mobile Safari iOS
('all', 'Safari iOS 18',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
 NULL, NULL, 'safari', 'mobile', 'ios', false, 3),

-- Mobile Chrome Android
('all', 'Chrome Android 143',
 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Android"', 'chrome', 'mobile', 'android', true, 3),

-- Facebook specific
('facebook', 'Chrome 143 Facebook',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 15),

-- Instagram specific
('instagram', 'Chrome 143 Instagram',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 15),

-- TikTok specific (Mobile preferred)
('tiktok', 'Safari iOS TikTok',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
 NULL, NULL, 'safari', 'mobile', 'ios', false, 15),

-- Twitter specific
('twitter', 'Chrome 143 Twitter',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 12),

-- Weibo specific (Desktop required)
('weibo', 'Chrome 143 Weibo',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 15);

-- ═══════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════

COMMENT ON TABLE admin_cookie_pool IS 'Cookie pool for rotation with health tracking';
COMMENT ON TABLE push_subscriptions IS 'PWA push notification subscriptions';
COMMENT ON TABLE browser_profiles IS 'Browser profiles for header rotation to avoid detection';
COMMENT ON TABLE system_config IS 'Centralized system configuration - replaces hardcoded values';
COMMENT ON TABLE admin_alerts_config IS 'Configuration for admin Discord alerts and cookie health checks';
COMMENT ON COLUMN service_config.maintenance_type IS 'Maintenance type: off, api (block API only), full (redirect all)';
