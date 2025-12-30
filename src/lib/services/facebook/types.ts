// types.ts - Shared types for Facebook hybrid scraper

// Re-export from core types
export type { ScraperResult, ScraperOptions, ScraperData } from '@/core/scrapers/types';
export { ScraperErrorCode, createError } from '@/core/scrapers/types';

// Import base MediaFormat
import type { MediaFormat as BaseMediaFormat, EngagementStats } from '@/lib/types';

// Facebook-specific MediaFormat (extends base with storyIndex)
export interface MediaFormat extends Omit<BaseMediaFormat, 'type'> {
    type: 'video' | 'image' | 'audio';
    hasMuxedAudio?: boolean;
    storyIndex?: number;  // For grouping HD/SD variants of same story
    imageIndex?: number;  // For multi-image posts (0-based)
    itemId?: string;      // For frontend carousel grouping (img-0, story-1, etc)
    _priority?: number;   // Internal sorting priority
}

export interface FbMetadata {
    author?: string;
    title?: string;
    description?: string;
    timestamp?: string;
    engagement?: EngagementStats;
    groupName?: string;  // For group posts
}

// Content types
export type FbContentType = 'video' | 'reel' | 'story' | 'post' | 'group' | 'photo' | 'watch' | 'unknown';

// Engine types
export type EngineType = 'ytdlp' | 'risuncode';

// Route decision
export interface RouteDecision {
    primaryEngine: EngineType;
    fallbackEngine: EngineType | null;
    reason: string;
}

// URL resolution result
export interface ResolveResult {
    originalUrl: string;
    resolvedUrl: string;
    contentType: FbContentType;
    contentId: string | null;
    needsCookie: boolean;
}

// Engine result (internal)
export interface EngineResult {
    success: boolean;
    errorCode?: string;
    shouldFallback: boolean;
}

// Fallback-eligible error codes
export const FALLBACK_ERRORS = [
    'NO_VIDEO',           // yt-dlp: photo post
    'NO_MEDIA',           // yt-dlp: no media found
    'UNSUPPORTED_URL',    // yt-dlp: stories (raw error)
    'UNSUPPORTED_CONTENT', // yt-dlp: mapped error code
    'PARSE_ERROR',        // yt-dlp: extraction failed
    'UNKNOWN',            // Unknown errors - try fallback
    'LOGIN_REQUIRED',     // Might work with different engine
    'COOKIE_REQUIRED',    // Might work with different engine
];
