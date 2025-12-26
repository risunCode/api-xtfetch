-- ============================================================================
-- Migration: Add tier column to admin_cookie_pool
-- Date: December 2024
-- Purpose: Support public/private cookie tiers for bot vs API usage
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add tier column with default 'public'
ALTER TABLE admin_cookie_pool 
ADD COLUMN IF NOT EXISTS tier VARCHAR(10) NOT NULL DEFAULT 'public';

-- 2. Add check constraint for valid tier values (safe - skip if exists)
DO $$ 
BEGIN
    ALTER TABLE admin_cookie_pool 
    ADD CONSTRAINT check_tier_values CHECK (tier IN ('public', 'private'));
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint check_tier_values already exists, skipping';
END $$;

-- 3. Update index for rotation to include tier
DROP INDEX IF EXISTS idx_cookie_pool_rotation;
CREATE INDEX idx_cookie_pool_rotation ON admin_cookie_pool(platform, tier, enabled, status, cooldown_until, last_used_at);

-- 4. Update cookie_pool_stats view to include tier
DROP VIEW IF EXISTS cookie_pool_stats;
CREATE OR REPLACE VIEW cookie_pool_stats AS
SELECT 
    platform,
    tier,
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
GROUP BY platform, tier;

-- 5. Grant permissions
GRANT SELECT ON cookie_pool_stats TO anon;
GRANT SELECT ON cookie_pool_stats TO authenticated;

-- ============================================================================
-- VERIFICATION: Run this to check migration success
-- ============================================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'admin_cookie_pool' AND column_name = 'tier';
