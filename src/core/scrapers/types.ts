/**
 * Scraper Types - Core Domain Types
 * Central type definitions for all platform scrapers
 */

import type { MediaFormat, UnifiedEngagement } from '@/lib/types';

export type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';

export enum ScraperErrorCode {
    INVALID_URL = 'INVALID_URL',
    UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM',
    COOKIE_REQUIRED = 'COOKIE_REQUIRED',
    COOKIE_EXPIRED = 'COOKIE_EXPIRED',
    COOKIE_INVALID = 'COOKIE_INVALID',
    COOKIE_BANNED = 'COOKIE_BANNED',
    NOT_FOUND = 'NOT_FOUND',
    PRIVATE_CONTENT = 'PRIVATE_CONTENT',
    AGE_RESTRICTED = 'AGE_RESTRICTED',
    NO_MEDIA = 'NO_MEDIA',
    DELETED = 'DELETED',
    CONTENT_REMOVED = 'CONTENT_REMOVED',
    GEO_BLOCKED = 'GEO_BLOCKED',
    TIMEOUT = 'TIMEOUT',
    RATE_LIMITED = 'RATE_LIMITED',
    BLOCKED = 'BLOCKED',
    NETWORK_ERROR = 'NETWORK_ERROR',
    API_ERROR = 'API_ERROR',
    PARSE_ERROR = 'PARSE_ERROR',
    CHECKPOINT_REQUIRED = 'CHECKPOINT_REQUIRED',
    UNKNOWN = 'UNKNOWN',
}

export const ERROR_MESSAGES: Record<ScraperErrorCode, string> = {
    [ScraperErrorCode.INVALID_URL]: 'Invalid URL format',
    [ScraperErrorCode.UNSUPPORTED_PLATFORM]: 'This platform is not supported',
    [ScraperErrorCode.COOKIE_REQUIRED]: 'This content requires login. Please provide a cookie.',
    [ScraperErrorCode.COOKIE_EXPIRED]: 'Your cookie has expired. Please update it.',
    [ScraperErrorCode.COOKIE_INVALID]: 'Invalid cookie format',
    [ScraperErrorCode.COOKIE_BANNED]: 'This account/cookie has been banned or restricted.',
    [ScraperErrorCode.NOT_FOUND]: 'Content not found. The post may have been deleted.',
    [ScraperErrorCode.PRIVATE_CONTENT]: 'This content is private',
    [ScraperErrorCode.AGE_RESTRICTED]: 'This content is age-restricted. Please provide a cookie.',
    [ScraperErrorCode.NO_MEDIA]: 'No downloadable media found',
    [ScraperErrorCode.DELETED]: 'This content has been deleted',
    [ScraperErrorCode.CONTENT_REMOVED]: 'This content was removed by the user or platform.',
    [ScraperErrorCode.GEO_BLOCKED]: 'This content is not available in your region.',
    [ScraperErrorCode.TIMEOUT]: 'Request timed out. Please try again.',
    [ScraperErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment.',
    [ScraperErrorCode.BLOCKED]: 'Request was blocked by the platform',
    [ScraperErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ScraperErrorCode.API_ERROR]: 'Platform API error',
    [ScraperErrorCode.PARSE_ERROR]: 'Failed to parse response',
    [ScraperErrorCode.CHECKPOINT_REQUIRED]: 'Account verification required. Please check your account.',
    [ScraperErrorCode.UNKNOWN]: 'An unexpected error occurred',
};

export interface ScraperData {
    title: string;
    thumbnail: string;
    author: string;
    authorName?: string;
    formats: MediaFormat[];
    url: string;
    description?: string;
    duration?: string;
    views?: string;
    postedAt?: string;
    engagement?: UnifiedEngagement;
    usedCookie?: boolean;
    type?: 'video' | 'image' | 'slideshow' | 'story' | 'mixed';
}

export interface ScraperResult {
    success: boolean;
    data?: ScraperData;
    error?: string;
    errorCode?: ScraperErrorCode;
    cached?: boolean;
}

export interface ScraperOptions {
    cookie?: string;
    hd?: boolean;
    timeout?: number;
    skipCache?: boolean;
}

export type ScraperFn = (url: string, options?: ScraperOptions) => Promise<ScraperResult>;

export function createError(code: ScraperErrorCode, customMessage?: string): {
    success: false;
    error: string;
    errorCode: ScraperErrorCode;
} {
    return {
        success: false,
        error: customMessage || ERROR_MESSAGES[code],
        errorCode: code,
    };
}

export function detectErrorCode(error: unknown): ScraperErrorCode {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (lower.includes('timeout') || lower.includes('aborted')) return ScraperErrorCode.TIMEOUT;
    if (lower.includes('rate limit') || lower.includes('429')) return ScraperErrorCode.RATE_LIMITED;
    if (lower.includes('cookie') && lower.includes('required')) return ScraperErrorCode.COOKIE_REQUIRED;
    if (lower.includes('cookie') && lower.includes('expired')) return ScraperErrorCode.COOKIE_EXPIRED;
    if (lower.includes('login') || lower.includes('auth')) return ScraperErrorCode.COOKIE_REQUIRED;
    if (lower.includes('private')) return ScraperErrorCode.PRIVATE_CONTENT;
    if (lower.includes('not found') || lower.includes('404')) return ScraperErrorCode.NOT_FOUND;
    if (lower.includes('deleted')) return ScraperErrorCode.DELETED;
    if (lower.includes('age') && lower.includes('restrict')) return ScraperErrorCode.AGE_RESTRICTED;
    if (lower.includes('checkpoint')) return ScraperErrorCode.CHECKPOINT_REQUIRED;
    if (lower.includes('blocked') || lower.includes('403')) return ScraperErrorCode.BLOCKED;
    if (lower.includes('network') || lower.includes('fetch')) return ScraperErrorCode.NETWORK_ERROR;

    return ScraperErrorCode.UNKNOWN;
}

export function isRetryable(code: ScraperErrorCode): boolean {
    return [
        ScraperErrorCode.TIMEOUT,
        ScraperErrorCode.NETWORK_ERROR,
        ScraperErrorCode.API_ERROR,
    ].includes(code);
}
