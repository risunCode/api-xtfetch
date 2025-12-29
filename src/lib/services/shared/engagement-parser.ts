/**
 * Engagement Parser Helper
 * Shared engagement stats parsing logic for all platform scrapers
 */

import type { PlatformId, EngagementStats } from '@/lib/types';

/**
 * Mapping interface for extracting engagement stats from JSON data
 */
export interface EngagementMapping {
    likes?: string;
    comments?: string;
    shares?: string;
    views?: string;
    plays?: string;
    saves?: string;
    bookmarks?: string;
    replies?: string;
}

/**
 * Platform-specific regex patterns for extracting engagement from HTML/JSON strings
 */
const PLATFORM_PATTERNS: Record<PlatformId, Record<keyof EngagementStats, RegExp[]>> = {
    facebook: {
        likes: [
            /"reaction_count":\{"count":(\d+)/,
            /"like_count":(\d+)/,
        ],
        comments: [
            /"comment_count":(\d+)/,
            /"comments":\{"total_count":(\d+)/,
        ],
        shares: [
            /"share_count":(\d+)/,
        ],
        views: [
            /"video_view_count":(\d+)/,
        ],
        plays: [],
        saves: [],
        bookmarks: [],
        replies: [],
    },
    instagram: {
        likes: [
            /"edge_media_preview_like":\{"count":(\d+)/,
            /"like_count":(\d+)/,
            /"likeCount":(\d+)/,
            /"edge_liked_by":\{"count":(\d+)/,
        ],
        comments: [
            /"edge_media_to_comment":\{"count":(\d+)/,
            /"comment_count":(\d+)/,
            /"commentCount":(\d+)/,
            // HTML fallback: <span class="...">72</span> after Comment SVG
            /Comment<\/title><\/svg><\/div><span[^>]*>(\d+)<\/span>/,
        ],
        shares: [],
        views: [
            /"video_view_count":(\d+)/,
        ],
        plays: [
            /"play_count":(\d+)/,
            /"playCount":(\d+)/,
            /"video_play_count":(\d+)/,
        ],
        saves: [
            /"save_count":(\d+)/,
            /"saveCount":(\d+)/,
        ],
        bookmarks: [],
        replies: [],
    },
    twitter: {
        likes: [
            /"favorite_count":(\d+)/,
        ],
        comments: [
            /"reply_count":(\d+)/,
        ],
        shares: [
            /"retweet_count":(\d+)/,
        ],
        views: [
            /"views_count":(\d+)/,
            /"view_count":(\d+)/,
        ],
        plays: [],
        saves: [],
        bookmarks: [
            /"bookmark_count":(\d+)/,
        ],
        replies: [
            /"reply_count":(\d+)/,
        ],
    },
    tiktok: {
        likes: [
            /"digg_count":(\d+)/,
            /"diggCount":(\d+)/,
        ],
        comments: [
            /"comment_count":(\d+)/,
            /"commentCount":(\d+)/,
        ],
        shares: [
            /"share_count":(\d+)/,
            /"shareCount":(\d+)/,
        ],
        views: [
            /"play_count":(\d+)/,
            /"playCount":(\d+)/,
        ],
        plays: [
            /"play_count":(\d+)/,
            /"playCount":(\d+)/,
        ],
        saves: [
            /"collect_count":(\d+)/,
            /"collectCount":(\d+)/,
        ],
        bookmarks: [
            /"collect_count":(\d+)/,
            /"collectCount":(\d+)/,
        ],
        replies: [],
    },
    weibo: {
        likes: [
            /"attitudes_count":(\d+)/,
        ],
        comments: [
            /"comments_count":(\d+)/,
        ],
        shares: [
            /"reposts_count":(\d+)/,
        ],
        views: [
            /"play_count":(\d+)/,
        ],
        plays: [
            /"play_count":(\d+)/,
        ],
        saves: [],
        bookmarks: [],
        replies: [],
    },
    youtube: {
        likes: [
            /"likeCount":"(\d+)"/,
            /"likes":(\d+)/,
        ],
        comments: [
            /"commentCount":"(\d+)"/,
        ],
        shares: [],
        views: [
            /"viewCount":"(\d+)"/,
            /"view_count":(\d+)/,
        ],
        plays: [],
        saves: [],
        bookmarks: [],
        replies: [],
    },
};

/**
 * Platform-specific JSON field mappings for structured data
 */
const PLATFORM_JSON_MAPPINGS: Record<PlatformId, EngagementMapping> = {
    facebook: {
        likes: 'reaction_count',
        comments: 'comment_count',
        shares: 'share_count',
        views: 'video_view_count',
    },
    instagram: {
        likes: 'like_count',
        comments: 'comment_count',
        views: 'video_view_count',
        plays: 'play_count',
        saves: 'save_count',
    },
    twitter: {
        likes: 'favorite_count',
        comments: 'reply_count',
        shares: 'retweet_count',
        views: 'views_count',
        bookmarks: 'bookmark_count',
        replies: 'reply_count',
    },
    tiktok: {
        likes: 'digg_count',
        comments: 'comment_count',
        shares: 'share_count',
        views: 'play_count',
        plays: 'play_count',
        saves: 'collect_count',
        bookmarks: 'collect_count',
    },
    weibo: {
        likes: 'attitudes_count',
        comments: 'comments_count',
        shares: 'reposts_count',
        views: 'play_count',
        plays: 'play_count',
    },
    youtube: {
        likes: 'likeCount',
        comments: 'commentCount',
        views: 'viewCount',
    },
};

/**
 * Safely parse a value to number
 */
function safeParseNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    
    if (typeof value === 'number' && !isNaN(value)) {
        return value;
    }
    
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    
    return undefined;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    
    return current;
}

/**
 * Parse engagement stats from a data object using a custom mapping
 */
export function parseEngagement(
    data: Record<string, unknown>,
    mapping: EngagementMapping
): EngagementStats {
    const result: EngagementStats = {};
    
    const fields: (keyof EngagementStats)[] = ['likes', 'comments', 'shares', 'views', 'plays', 'saves', 'bookmarks', 'replies'];
    
    for (const field of fields) {
        const sourceField = mapping[field as keyof EngagementMapping];
        if (sourceField) {
            const value = getNestedValue(data, sourceField);
            const parsed = safeParseNumber(value);
            if (parsed !== undefined) {
                result[field] = parsed;
            }
        }
    }
    
    return result;
}

/**
 * Parse engagement stats from HTML/JSON string using platform-specific regex patterns
 */
export function parseEngagementFromHtml(
    html: string,
    platform: PlatformId
): EngagementStats {
    const result: EngagementStats = {};
    const patterns = PLATFORM_PATTERNS[platform];
    
    if (!patterns) {
        return result;
    }
    
    const fields: (keyof EngagementStats)[] = ['likes', 'comments', 'shares', 'views', 'plays', 'saves', 'bookmarks', 'replies'];
    
    for (const field of fields) {
        const fieldPatterns = patterns[field];
        if (!fieldPatterns || fieldPatterns.length === 0) {
            continue;
        }
        
        for (const pattern of fieldPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const parsed = safeParseNumber(match[1]);
                if (parsed !== undefined) {
                    result[field] = parsed;
                    break;
                }
            }
        }
    }
    
    return result;
}

/**
 * Parse engagement stats from structured JSON data using platform-specific field mappings
 */
export function parseEngagementFromJson(
    data: Record<string, unknown>,
    platform: PlatformId
): EngagementStats {
    const mapping = PLATFORM_JSON_MAPPINGS[platform];
    
    if (!mapping) {
        return {};
    }
    
    return parseEngagement(data, mapping);
}

/**
 * Merge multiple engagement stats objects, preferring non-undefined values
 */
export function mergeEngagementStats(stats: EngagementStats[]): EngagementStats {
    const result: EngagementStats = {};
    
    for (const stat of stats) {
        if (stat.likes !== undefined) result.likes = stat.likes;
        if (stat.comments !== undefined) result.comments = stat.comments;
        if (stat.shares !== undefined) result.shares = stat.shares;
        if (stat.views !== undefined) result.views = stat.views;
        if (stat.plays !== undefined) result.plays = stat.plays;
        if (stat.saves !== undefined) result.saves = stat.saves;
        if (stat.bookmarks !== undefined) result.bookmarks = stat.bookmarks;
        if (stat.replies !== undefined) result.replies = stat.replies;
    }
    
    return result;
}

/**
 * Check if engagement stats object has any defined values
 */
export function hasEngagementStats(stats: EngagementStats): boolean {
    return (
        stats.likes !== undefined ||
        stats.comments !== undefined ||
        stats.shares !== undefined ||
        stats.views !== undefined ||
        stats.plays !== undefined ||
        stats.saves !== undefined ||
        stats.bookmarks !== undefined ||
        stats.replies !== undefined
    );
}

/**
 * Clean engagement stats by removing fields with value 0 or undefined
 * Only includes fields that have actual values > 0
 */
export function cleanEngagementStats(stats: EngagementStats): EngagementStats {
    const result: EngagementStats = {};
    
    if (stats.likes !== undefined && stats.likes > 0) result.likes = stats.likes;
    if (stats.comments !== undefined && stats.comments > 0) result.comments = stats.comments;
    if (stats.shares !== undefined && stats.shares > 0) result.shares = stats.shares;
    if (stats.views !== undefined && stats.views > 0) result.views = stats.views;
    if (stats.plays !== undefined && stats.plays > 0) result.plays = stats.plays;
    if (stats.saves !== undefined && stats.saves > 0) result.saves = stats.saves;
    if (stats.bookmarks !== undefined && stats.bookmarks > 0) result.bookmarks = stats.bookmarks;
    if (stats.replies !== undefined && stats.replies > 0) result.replies = stats.replies;
    
    return result;
}

/**
 * Get the default JSON field mapping for a platform
 */
export function getPlatformMapping(platform: PlatformId): EngagementMapping {
    return { ...PLATFORM_JSON_MAPPINGS[platform] };
}
