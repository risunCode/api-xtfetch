-- ============================================================================
-- Manual: Give Admin Role to User
-- Run this AFTER user has registered
-- ============================================================================

-- Option 1: By email
UPDATE users SET role = 'admin' WHERE email = 'risuncode@gmail.com';

-- Option 2: By username
UPDATE users SET role = 'admin' WHERE username = 'risuncode';

-- Option 3: By user ID (get from Supabase Auth dashboard)
-- UPDATE users SET role = 'admin' WHERE id = 'your-uuid-here';

-- Verify the change
SELECT id, email, username, role, created_at FROM users WHERE email = 'risuncode@gmail.com';
