/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUTH - Unified Authentication & API Key Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Barrel export for auth module.
 * 
 * @module lib/auth
 */

// Session verification
export {
    authVerifySession,
    authVerifyAdminSession,
    authVerifyAdminToken,
    authVerifyApiKey,
    type AuthResult,
    type UserRole,
} from './session';

// API key management
export {
    apiKeyCreate,
    apiKeyGet,
    apiKeyGetAll,
    apiKeyUpdate,
    apiKeyDelete,
    apiKeyRegenerate,
    apiKeyValidate,
    apiKeyRecordUsage,
    apiKeyExtract,
    type ApiKey,
    type ApiKeyType,
    type ApiKeyValidation,
    type ApiKeyValidateResult,
} from './apikeys';
