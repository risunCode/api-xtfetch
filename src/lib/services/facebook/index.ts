// index.ts - Types and exports for Facebook scraper

// Re-export from core types
export type { ScraperResult, ScraperOptions, ScraperData } from '@/core/scrapers/types';
export { ScraperErrorCode, createError } from '@/core/scrapers/types';

// Import base MediaFormat
import type { MediaFormat as BaseMediaFormat, EngagementStats } from '@/lib/types';

// Facebook-specific MediaFormat (extends base with storyIndex)
export interface MediaFormat extends Omit<BaseMediaFormat, 'type'> {
    type: 'video' | 'image';
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

export type FbContentType = 'video' | 'reel' | 'story' | 'post' | 'group' | 'photo';

// Exports
export { scrapeFacebook, platformMatches } from './scraper';
export { getCdnInfo, isRegionalCdn, isUsCdn, optimizeUrls } from './cdn';
export { extractContent, detectIssue } from './extractor';
