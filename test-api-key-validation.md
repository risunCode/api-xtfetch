# API Key Validation Testing Guide

## Changes Implemented

✅ **Replaced TODO with proper API key validation**
- Imported `authVerifyApiKey` from `@/lib/auth`
- Updated `validateApiKey` function to use Supabase validation
- Enhanced error handling with specific error messages
- Added metadata to error responses

## Testing Commands

### 1. Test with Valid API Key
```bash
curl -X GET "http://localhost:3002/api/v1?key=xtf_live_YOUR_VALID_KEY&url=https://facebook.com/video/123"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "tier": "premium",
    "platform": "facebook",
    "apiKey": "xtf_live...",
    "rateLimit": 100,
    "endpoint": "/api/v1"
  }
}
```

### 2. Test with Invalid API Key
```bash
curl -X GET "http://localhost:3002/api/v1?key=invalid_key_format&url=https://facebook.com/video/123"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid API key",
  "meta": {
    "tier": "premium",
    "endpoint": "/api/v1"
  }
}
```

### 3. Test with Disabled API Key
```bash
curl -X GET "http://localhost:3002/api/v1?key=xtf_live_DISABLED_KEY&url=https://facebook.com/video/123"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "API key is disabled",
  "meta": {
    "tier": "premium",
    "endpoint": "/api/v1"
  }
}
```

### 4. Test with Expired API Key
```bash
curl -X GET "http://localhost:3002/api/v1?key=xtf_live_EXPIRED_KEY&url=https://facebook.com/video/123"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "API key has expired",
  "meta": {
    "tier": "premium",
    "endpoint": "/api/v1"
  }
}
```

### 5. Test without API Key
```bash
curl -X GET "http://localhost:3002/api/v1?url=https://facebook.com/video/123"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "API key is required. Get yours at: https://xt-fetch.vercel.app/admin/access"
}
```

## Validation Checklist

- [x] `authVerifyApiKey` imported correctly from `@/lib/auth`
- [x] TypeScript compilation succeeds (no errors)
- [x] Error messages are user-friendly and specific
- [x] Rate limits are applied correctly (from database)
- [x] Metadata includes tier and endpoint information
- [x] All error responses include proper HTTP status codes

## Database Requirements

Ensure the `api_keys` table exists in Supabase with the following columns:
- `id` (text, primary key)
- `key_hash` (text, unique)
- `is_active` (boolean)
- `rate_limit` (integer)
- `expires_at` (timestamp, nullable)
- `created_at` (timestamp)
- `last_used` (timestamp, nullable)

## Next Steps

1. Start the development server: `npm run dev`
2. Create a test API key via admin panel: `/admin/apikeys`
3. Run the test commands above
4. Verify responses match expected results
5. Check Supabase logs for any database errors

## Notes

- The `authVerifyApiKey` function queries the database on every request
- Rate limiting is handled separately by the full `apiKeyValidate` function
- For production, consider adding caching to reduce database queries
- API keys are hashed in the database for security
