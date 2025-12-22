-- Gemini API Keys Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gemini_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    use_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    rate_limit_reset TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for enabled keys lookup
CREATE INDEX IF NOT EXISTS idx_gemini_keys_enabled ON gemini_api_keys(enabled);

-- Function to increment use_count
CREATE OR REPLACE FUNCTION increment_gemini_use_count(key_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE gemini_api_keys 
    SET use_count = use_count + 1, updated_at = NOW()
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment error_count
CREATE OR REPLACE FUNCTION increment_gemini_error_count(key_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE gemini_api_keys 
    SET error_count = error_count + 1, updated_at = NOW()
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (admin only)
ALTER TABLE gemini_api_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role full access" ON gemini_api_keys
    FOR ALL
    USING (auth.role() = 'service_role');

-- Comment
COMMENT ON TABLE gemini_api_keys IS 'Stores Gemini API keys for AI chat feature with auto-rotation';
