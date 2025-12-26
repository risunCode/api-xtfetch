-- ============================================================================
-- Remove Redundant maintenance Column from service_config
-- 
-- Best Practice:
-- - Global maintenance → system_config.service_global.maintenanceType
-- - Per-platform on/off → service_config.enabled
-- - maintenance column is redundant and confusing
-- ============================================================================

-- Drop the redundant maintenance column
ALTER TABLE service_config DROP COLUMN IF EXISTS maintenance;
ALTER TABLE service_config DROP COLUMN IF EXISTS maintenance_message;

-- Verify structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'service_config' 
ORDER BY ordinal_position;
