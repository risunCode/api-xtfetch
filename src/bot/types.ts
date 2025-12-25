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
    daily_downloads: number;       // Downloads today
    last_download_at?: string;     // ISO timestamp of last download
    downloads_reset_at?: string;   // ISO timestamp when daily count was reset
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
}

// ============================================================================
// CUSTOM CONTEXT
// ============================================================================

/** Extended context with user data and session */
export interface BotContext extends Context, SessionFlavor<SessionData> {
    /** Authenticated bot user from database */
    botUser?: BotUser;
    /** Whether user is premium (has API key) */
    isPremium?: boolean;
    /** Rate limit info */
    rateLimit?: {
        remaining: number;
        resetAt?: Date;
        cooldownSeconds?: number;
    };
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
    PROCESSING: '⏳ Processing your link...',
    SUCCESS: '✅ Here\'s your media!',
    ERROR_GENERIC: '❌ Failed to download. Please try again.',
    ERROR_UNSUPPORTED: '❌ Unsupported platform or invalid URL.',
    ERROR_RATE_LIMIT: '⏰ Please wait {seconds}s before your next download.',
    ERROR_LIMIT_REACHED: '📊 You\'ve reached your limit ({limit} downloads per {hours}h).\n\n⏰ Your limit will reset soon!\n💎 Upgrade to premium for unlimited downloads!',
    ERROR_BANNED: '🚫 Your account has been suspended.',
    WELCOME: '👋 Welcome to DownAria Bot!\n\nSend me any social media link and I\'ll download it for you.\n\nSupported platforms: YouTube, Instagram, TikTok, Twitter/X, Facebook, Weibo',
} as const;
