-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Bot Tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Creates tables for Telegram bot users and downloads tracking.
-- Run this migration after sql-7-*.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- BOT USERS TABLE
CREATE TABLE IF NOT EXISTS bot_users (
    id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    language_code TEXT DEFAULT 'en',
    is_banned BOOLEAN DEFAULT false,
    is_admin BOOLEAN DEFAULT false,
    api_key_id VARCHAR(20) REFERENCES api_keys(id) ON DELETE SET NULL,
    premium_expires_at TIMESTAMP WITH TIME ZONE,
    daily_downloads INT DEFAULT 0,
    last_download_reset TIMESTAMP WITH TIME ZONE,
    last_download_at TIMESTAMP WITH TIME ZONE,
    daily_reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- BOT DOWNLOADS TABLE
CREATE TABLE IF NOT EXISTS bot_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES bot_users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'pending',
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_bot_users_api_key ON bot_users(api_key_id);
CREATE INDEX IF NOT EXISTS idx_bot_downloads_user ON bot_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_downloads_created ON bot_downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_bot_downloads_platform ON bot_downloads(platform);
CREATE INDEX IF NOT EXISTS idx_bot_users_banned ON bot_users(is_banned) WHERE is_banned = true;

-- ROW LEVEL SECURITY
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_users_service" ON bot_users
    FOR ALL TO service_role USING (true);

CREATE POLICY "bot_downloads_service" ON bot_downloads
    FOR ALL TO service_role USING (true);

-- UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION bot_update_updated_at()
RETURNS TRIGGER AS 'BEGIN NEW.updated_at = NOW(); RETURN NEW; END;' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bot_users_updated_at ON bot_users;
CREATE TRIGGER update_bot_users_updated_at
    BEFORE UPDATE ON bot_users
    FOR EACH ROW EXECUTE FUNCTION bot_update_updated_at();

-- TABLE COMMENTS
COMMENT ON TABLE bot_users IS 'Telegram bot user records';
COMMENT ON TABLE bot_downloads IS 'Download history for Telegram bot users';
COMMENT ON COLUMN bot_users.id IS 'Telegram user ID (primary key)';
COMMENT ON COLUMN bot_users.api_key_id IS 'Optional link to premium API key';
COMMENT ON COLUMN bot_users.premium_expires_at IS 'Premium expiry date (NULL = no premium, far future = lifetime)';
COMMENT ON COLUMN bot_users.daily_downloads IS 'Number of downloads today (resets daily)';
COMMENT ON COLUMN bot_downloads.status IS 'Download status: pending, success, failed';
COMMENT ON COLUMN bot_downloads.is_premium IS 'Whether download was made with premium account';
