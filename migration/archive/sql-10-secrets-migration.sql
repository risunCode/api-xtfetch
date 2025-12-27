-- ═══════════════════════════════════════════════════════════════════════════════
-- SECRETS MIGRATION: ENV to Supabase
-- Version: December 2025
-- Purpose: Move sensitive secrets from .env to database for security
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- WHY: Pentest revealed RCE could dump all env vars via `env | base64`
-- SOLUTION: Store secrets in DB, only SERVICE_ROLE_KEY remains in .env
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- Insert secrets into system_config
-- Using ON CONFLICT to handle re-runs safely
INSERT INTO system_config (key, value, description) VALUES
('secrets', '{
  "encryption_key": "YOUR_ENCRYPTION_KEY_HERE",
  "jwt_secret": "YOUR_JWT_SECRET_HERE",
  "api_secret_key": "YOUR_API_SECRET_KEY_HERE",
  "admin_secret_key": "YOUR_ADMIN_SECRET_KEY_HERE",
  "upstash_redis_rest_url": "YOUR_UPSTASH_REDIS_REST_URL_HERE",
  "upstash_redis_rest_token": "YOUR_UPSTASH_REDIS_REST_TOKEN_HERE",
  "upstash_redis_url": "YOUR_UPSTASH_REDIS_URL_HERE",
  "vapid_public_key": "YOUR_VAPID_PUBLIC_KEY_HERE",
  "vapid_private_key": "YOUR_VAPID_PRIVATE_KEY_HERE",
  "vapid_subject": "YOUR_VAPID_SUBJECT_HERE",
  "telegram_bot_token": "YOUR_TELEGRAM_BOT_TOKEN_HERE",
  "telegram_webhook_secret": "YOUR_TELEGRAM_WEBHOOK_SECRET_HERE",
  "telegram_admin_ids": "YOUR_TELEGRAM_ADMIN_IDS_HERE",
  "telegram_bot_username": "YOUR_TELEGRAM_BOT_USERNAME_HERE",
  "telegram_admin_username": "YOUR_TELEGRAM_ADMIN_USERNAME_HERE",
  "discord_webhook_url": "YOUR_DISCORD_WEBHOOK_URL_HERE"
}', 'Sensitive application secrets - DO NOT expose via API')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value, 
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Run this to verify secrets are stored (shows keys only, not values)
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT key, jsonb_object_keys(value) as secret_keys 
-- FROM system_config 
-- WHERE key = 'secrets';

-- ═══════════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECKLIST
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. [x] Run this SQL in Supabase SQL Editor (with real values)
-- 2. [ ] Implement secrets loader in backend (src/lib/secrets.ts)
-- 3. [ ] Update all process.env.* usages to use getSecret()
-- 4. [ ] Test locally with secrets from DB
-- 5. [ ] Deploy backend with updated code
-- 6. [ ] Remove secrets from Railway/Vercel env vars
-- 7. [ ] Update .env to minimal version
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- SECRETS REFERENCE (what each key is for)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- encryption_key        : Cookie encryption (32 char hex)
-- jwt_secret            : JWT token signing (64 char hex)
-- api_secret_key        : API authentication
-- admin_secret_key      : Admin panel authentication
-- upstash_redis_rest_url: Redis REST API URL
-- upstash_redis_rest_token: Redis REST API token
-- upstash_redis_url     : Redis connection URL (for BullMQ)
-- vapid_public_key      : Web push public key
-- vapid_private_key     : Web push private key
-- vapid_subject         : Web push contact email
-- telegram_bot_token    : Telegram bot API token
-- telegram_webhook_secret: Telegram webhook verification
-- telegram_admin_ids    : Comma-separated admin Telegram IDs
-- telegram_bot_username : Bot username (without @)
-- telegram_admin_username: Admin contact username
-- discord_webhook_url   : Discord notification webhook
--
-- ═══════════════════════════════════════════════════════════════════════════════
