-- ============================================================================
-- XTFetch Manual Script: Give Admin Role
-- Version: January 2025
-- Purpose: Promote a user to admin role by email
-- ============================================================================

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================
-- 1. Replace 'admin@example.com' with the actual user's email
-- 2. Run this script in Supabase SQL Editor
-- 3. Verify the change with the SELECT query at the bottom
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Option 1: Set admin by EMAIL
-- ----------------------------------------------------------------------------
UPDATE users 
SET role = 'admin', updated_at = NOW()
WHERE email = 'admin@example.com';

-- ----------------------------------------------------------------------------
-- Option 2: Set admin by USER ID (UUID)
-- Uncomment and use if you have the user's UUID
-- ----------------------------------------------------------------------------
-- UPDATE users 
-- SET role = 'admin', updated_at = NOW()
-- WHERE id = '00000000-0000-0000-0000-000000000000';

-- ----------------------------------------------------------------------------
-- Option 3: Set admin by USERNAME
-- Uncomment and use if you have the username
-- ----------------------------------------------------------------------------
-- UPDATE users 
-- SET role = 'admin', updated_at = NOW()
-- WHERE username = 'adminuser';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check all admins
SELECT id, email, username, role, status, first_joined, last_seen
FROM users
WHERE role = 'admin'
ORDER BY first_joined;

-- Check specific user by email
SELECT id, email, username, role, status, first_joined, last_seen
FROM users
WHERE email = 'admin@example.com';

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- To demote an admin back to user:
-- UPDATE users SET role = 'user', updated_at = NOW() WHERE email = 'admin@example.com';

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================
