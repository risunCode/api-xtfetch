-- ============================================================================
-- Cleanup Legacy system_config Rows
-- Run this ONCE to remove old key-value rows and keep only service_global
-- ============================================================================

-- Delete legacy rows (these are no longer used)
DELETE FROM system_config WHERE key IN (
    'scraper_timeout',
    'scraper_max_retries', 
    'rate_limit_window',
    'rate_limit_max',
    'maintenance_mode',
    'registration_enabled',
    'api_key_default_rate_limit',
    'cookie_cooldown_minutes',
    'max_file_size_mb',
    'proxy_enabled'
);

-- Ensure service_global exists with proper JSONB structure
INSERT INTO system_config (key, value, description, updated_at)
VALUES (
    'service_global',
    '{"maintenanceMode":false,"maintenanceType":"off","maintenanceMessage":"🔧 XTFetch is under maintenance. Please try again later.","globalRateLimit":15,"playgroundEnabled":true,"playgroundRateLimit":5,"geminiRateLimit":60,"geminiRateWindow":1,"apiKeyRequired":false}',
    'Global service configuration',
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Verify cleanup
SELECT key, description FROM system_config ORDER BY key;
