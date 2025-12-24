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
        bookmarks: [],
        replies: [],
    },
    instagram: {
        likes: [
            /"edge_media_preview_like":\{"count":(\d+)/,
            /"like_count":(\d+)/,
        ],
        comments: [
            /"edge_media_to_comment":\{"count":(\d+)/,
            /"comment_count":(\d+)/,
        ],
        shares: [],
        views: [
            /"video_view_count":(\d+)/,
            /"play_count":(\d+)/,
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
        views: 'play_count',
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
        bookmarks: 'collect_count',
    },
    weibo: {
        likes: 'attitudes_count',
        comments: 'comments_count',
        shares: 'reposts_count',
        views: 'play_count',
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
    
    const fields: (keyof EngagementStats)[] = ['likes', 'comments', 'shares', 'views', 'bookmarks', 'replies'];
    
    for (const field of fields) {
        const sourceField = mapping[field];
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
    
    const fields: (keyof EngagementStats)[] = ['likes', 'comments', 'shares', 'views', 'bookmarks', 'replies'];
    
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
        stats.bookmarks !== undefined ||
        stats.replies !== undefined
    );
}

/**
 * Get the default JSON field mapping for a platform
 */
export function getPlatformMapping(platform: PlatformId): EngagementMapping {
    return { ...PLATFORM_JSON_MAPPINGS[platform] };
}
