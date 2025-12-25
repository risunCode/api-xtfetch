/**
 * Telegram Bot Types
 * Type definitions for bot context and database models
 * 
 * NOTE: Grammy must be installed for these types to work:
 * npm install grammy
 */

import type { Context, SessionFlavor } from 'grammy';
import type { PlatformId } from '@/core/config';

// ============================================================================
// DATABASE MODELS
// ============================================================================

/** Bot user record in database */
export interface BotUser {
    id: number;                    // Telegram user ID (BIGINT primary key)
    username?: string;             // Telegram username
    first_name?: string;           // Telegram first name
    last_name?: string;            // Telegram last name
    language_code?: string;        // User's language
    is_banned: boolean;            // Whether user is banned
    ban_reason?: string;           // Reason for ban
    api_key_id?: string;           // Linked API key (premium user)
    premium_expires_at?: string;   // ISO timestamp when premium expires
    daily_downloads: number;       // Downloads today
    last_download_at?: string;     // ISO timestamp of last download
    last_download_reset?: string;  // ISO timestamp when daily count was reset
    total_downloads: number;       // Lifetime downloads
    created_at: string;            // ISO timestamp
    updated_at: string;            // ISO timestamp
}

// ============================================================================
// SESSION DATA
// ============================================================================

/** Session data stored per user */
export interface SessionData {
    /** Pending retry URL (for retry button) */
    pendingRetryUrl?: string;
    /** Last platform detected */
    lastPlatform?: PlatformId;
    /** Store scraper result for callback (quality selection) */
    pendingDownload?: {
        url: string;
        visitorId: string;
        platform: PlatformId;
        result: DownloadResult;
        userMsgId: number;
        timestamp: number;
    };
}

// ============================================================================
// CUSTOM CONTEXT
// ============================================================================

/** Extended context with user data and session */
export interface BotContext extends Context, SessionFlavor<SessionData> {
    /** Authenticated bot user from database */
    botUser?: BotUser;
    /** Whether user is premium (has API key or is admin) */
    isPremium?: boolean;
    /** Whether user is admin */
    isAdmin?: boolean;
    /** Rate limit info */
    rateLimit?: {
        remaining: number;
        resetAt?: Date;
        cooldownSeconds?: number;
    };
}

// ============================================================================
// CONTENT TYPE
// ============================================================================

/** Content type for smart media handling */
export type ContentType = 'video' | 'youtube' | 'photo_single' | 'photo_album';

/**
 * Detect content type from scraper result
 */
export function detectContentType(result: DownloadResult): ContentType {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const images = result.formats?.filter(f => f.type === 'image') || [];
    
    // YouTube always needs preview (conversion required)
    if (result.platform === 'youtube') {
        return 'youtube';
    }
    
    // Has video → send video directly
    if (videos.length > 0) {
        return 'video';
    }
    
    // Photos
    if (images.length > 1) {
        return 'photo_album';
    }
    
    return 'photo_single';
}

// ============================================================================
// CALLBACK DATA
// ============================================================================

/** Callback query data types */
export type CallbackAction = 
    | 'how_to_use'
    | 'contact_admin'
    | 'have_api_key'
    | 'retry_download'
    | 'cancel'
    | 'back_to_menu';

/** Parsed callback data */
export interface CallbackData {
    action: CallbackAction;
    payload?: string;
}

// ============================================================================
// DOWNLOAD RESULT
// ============================================================================

/** Result from internal scraper call */
export interface DownloadResult {
    success: boolean;
    platform?: PlatformId;
    title?: string;
    thumbnail?: string;
    author?: string;
    formats?: Array<{
        quality: string;
        type: 'video' | 'audio' | 'image';
        url: string;
        filesize?: number;
    }>;
    error?: string;
    errorCode?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Rate limit constants */
export const RATE_LIMITS = {
    /** Max downloads per reset period for free users */
    FREE_DOWNLOAD_LIMIT: 10,
    /** Reset period in hours for free users */
    FREE_RESET_HOURS: 6,
    /** Cooldown between downloads for free users (seconds) */
    FREE_COOLDOWN_SECONDS: 5,
    /** Premium users have no limits */
    PREMIUM_DOWNLOAD_LIMIT: Infinity,
    PREMIUM_COOLDOWN_SECONDS: 0,
} as const;

/** Bot messages */
export const BOT_MESSAGES = {
    PROCESSING: 'Processing...',
    SUCCESS: '',
    ERROR_GENERIC: 'Download failed.',
    ERROR_UNSUPPORTED: 'Unsupported link.',
    ERROR_RATE_LIMIT: 'Wait {seconds}s.',
    ERROR_LIMIT_REACHED: 'Limit reached ({limit}/{hours}h). Resets in {reset}.',
    ERROR_BANNED: 'Account suspended.',
    WELCOME: 'DownAria Bot\n\nPaste any video link.\n\nSupported: YouTube, Instagram, TikTok, X, Facebook, Weibo',
} as const;
