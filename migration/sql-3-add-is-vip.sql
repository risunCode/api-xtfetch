-- Migration: Add is_vip column for VIP tier (non-API users)
-- Date: December 30, 2025
-- Related: BOT_REFACTOR_PLAN.md - User Tier System
-- 
-- Purpose:
-- - Add is_vip boolean column to bot_users table
-- - VIP users get 15 req/2 min rate limit (vs Free: 8/day)
-- - VVIP users are identified by api_key_id (existing column)
--
-- Tier Logic:
-- - Free: is_vip = false AND api_key_id IS NULL
-- - VIP:  is_vip = true AND api_key_id IS NULL
-- - VVIP: api_key_id IS NOT NULL (is_vip ignored)

-- Add is_vip column
ALTER TABLE public.bot_users 
ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false;

-- Optional: Migrate users who had premium_expires_at set (legacy VIP)
-- Uncomment if you want to auto-migrate legacy premium users
-- UPDATE public.bot_users 
-- SET is_vip = true 
-- WHERE premium_expires_at IS NOT NULL 
--   AND premium_expires_at > NOW()
--   AND api_key_id IS NULL;

-- Add index for faster tier lookups
CREATE INDEX IF NOT EXISTS idx_bot_users_is_vip 
ON public.bot_users(is_vip) 
WHERE is_vip = true;

CREATE INDEX IF NOT EXISTS idx_bot_users_api_key 
ON public.bot_users(api_key_id) 
WHERE api_key_id IS NOT NULL;

-- Verify column was added
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'bot_users' AND column_name = 'is_vip';
