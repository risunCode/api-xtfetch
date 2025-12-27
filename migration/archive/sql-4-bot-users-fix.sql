-- ============================================================================
-- Migration: Add missing columns to bot_users
-- Run this if bot_users table already exists but missing columns
-- ============================================================================

-- Add missing columns
ALTER TABLE bot_users 
ADD COLUMN IF NOT EXISTS total_downloads INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_download_at TIMESTAMPTZ;

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bot_users' 
ORDER BY ordinal_position;
