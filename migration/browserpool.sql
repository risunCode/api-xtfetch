-- ═══════════════════════════════════════════════════════════════════════════════
-- USER AGENT POOL TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS useragent_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL DEFAULT 'all',  -- 'all', 'facebook', 'instagram', etc.
    user_agent TEXT NOT NULL,
    device_type VARCHAR(20) NOT NULL DEFAULT 'desktop',  -- 'desktop', 'mobile'
    browser VARCHAR(50),  -- 'chrome', 'firefox', 'safari', 'edge'
    version VARCHAR(20),  -- browser version
    os VARCHAR(50),  -- 'windows', 'macos', 'linux', 'ios', 'android'
    enabled BOOLEAN DEFAULT true,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rotation query
CREATE INDEX IF NOT EXISTS idx_useragent_pool_rotation 
ON useragent_pool (platform, device_type, enabled, last_used_at NULLS FIRST);

-- RPC function to increment use count
CREATE OR REPLACE FUNCTION increment_ua_use_count(ua_string TEXT)
RETURNS void AS $$
BEGIN
    UPDATE useragent_pool 
    SET use_count = use_count + 1, 
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE user_agent = ua_string;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BROWSER PROFILES TABLE (Anti-Ban System)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS browser_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL DEFAULT 'all',  -- 'all', 'facebook', 'instagram', etc.
    label VARCHAR(100),  -- 'Chrome 143 Windows', 'Firefox 134 macOS'
    user_agent TEXT NOT NULL,
    sec_ch_ua TEXT,  -- '"Google Chrome";v="143", "Chromium";v="143"'
    sec_ch_ua_platform VARCHAR(50),  -- '"Windows"', '"macOS"'
    sec_ch_ua_mobile VARCHAR(10) DEFAULT '?0',  -- '?0' or '?1'
    accept_language VARCHAR(100) DEFAULT 'en-US,en;q=0.9',
    browser VARCHAR(50),  -- 'chrome', 'firefox', 'safari', 'edge'
    device_type VARCHAR(20) DEFAULT 'desktop',  -- 'desktop', 'mobile', 'tablet'
    os VARCHAR(50),  -- 'windows', 'macos', 'linux', 'ios', 'android'
    is_chromium BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 10,  -- Higher = more likely to be selected
    enabled BOOLEAN DEFAULT true,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rotation query
CREATE INDEX IF NOT EXISTS idx_browser_profiles_rotation 
ON browser_profiles (platform, enabled, priority DESC, last_used_at NULLS FIRST);

-- RPC functions for browser profiles
CREATE OR REPLACE FUNCTION increment_profile_use(profile_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE browser_profiles 
    SET use_count = use_count + 1, 
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = profile_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_profile_success(profile_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE browser_profiles 
    SET success_count = success_count + 1,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = profile_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_profile_error(profile_id UUID, error_msg TEXT)
RETURNS void AS $$
BEGIN
    UPDATE browser_profiles 
    SET error_count = error_count + 1,
        last_error = error_msg,
        updated_at = NOW()
    WHERE id = profile_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA - User Agents (Latest Dec 2024)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO useragent_pool (platform, user_agent, device_type, browser, version, os) VALUES
-- Chrome Desktop
('all', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'desktop', 'chrome', '131', 'windows'),
('all', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'desktop', 'chrome', '131', 'macos'),
('all', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'desktop', 'chrome', '131', 'linux'),
-- Firefox Desktop
('all', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0', 'desktop', 'firefox', '134', 'windows'),
('all', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0', 'desktop', 'firefox', '134', 'macos'),
-- Safari Desktop
('all', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15', 'desktop', 'safari', '18.2', 'macos'),
-- Edge Desktop
('all', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'desktop', 'edge', '131', 'windows'),
-- Mobile Chrome
('all', 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'mobile', 'chrome', '131', 'android'),
('tiktok', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'mobile', 'chrome', '131', 'android'),
-- Mobile Safari
('all', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1', 'mobile', 'safari', '18.2', 'ios'),
('tiktok', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1', 'mobile', 'safari', '18.2', 'ios');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA - Browser Profiles (Anti-Ban)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO browser_profiles (platform, label, user_agent, sec_ch_ua, sec_ch_ua_platform, sec_ch_ua_mobile, accept_language, browser, device_type, os, is_chromium, priority) VALUES
-- Chrome Windows (High Priority)
('all', 'Chrome 131 Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"Windows"', '?0', 'en-US,en;q=0.9', 'chrome', 'desktop', 'windows', true, 20),
-- Chrome macOS
('all', 'Chrome 131 macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"macOS"', '?0', 'en-US,en;q=0.9', 'chrome', 'desktop', 'macos', true, 15),
-- Edge Windows
('all', 'Edge 131 Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"Windows"', '?0', 'en-US,en;q=0.9', 'edge', 'desktop', 'windows', true, 10),
-- Firefox (Non-Chromium, lower priority for FB/IG)
('all', 'Firefox 134 Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0', NULL, NULL, '?0', 'en-US,en;q=0.5', 'firefox', 'desktop', 'windows', false, 5),
-- Safari macOS (Non-Chromium)
('all', 'Safari 18.2 macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15', NULL, NULL, '?0', 'en-US,en;q=0.9', 'safari', 'desktop', 'macos', false, 5),
-- Instagram-specific (Chromium required)
('instagram', 'Chrome 131 Windows (IG)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"Windows"', '?0', 'en-US,en;q=0.9', 'chrome', 'desktop', 'windows', true, 25),
-- Facebook-specific (Chromium required)
('facebook', 'Chrome 131 Windows (FB)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"Windows"', '?0', 'en-US,en;q=0.9', 'chrome', 'desktop', 'windows', true, 25),
-- TikTok Mobile
('tiktok', 'Chrome Mobile Android', 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', '"Android"', '?1', 'en-US,en;q=0.9', 'chrome', 'mobile', 'android', true, 20);
