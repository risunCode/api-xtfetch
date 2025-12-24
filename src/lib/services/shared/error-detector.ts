/**
 * Error Detector Helper
 * Shared error detection logic for scrapers
 * Detects common error patterns from HTTP responses and HTML content
 */

import { ScraperErrorCode } from '@/core/scrapers/types';
import type { PlatformId } from '@/lib/types';

/**
 * Error pattern definition
 */
export interface ErrorPattern {
    patterns: string[];
    errorCode: ScraperErrorCode;
    message: string;
}

/**
 * Common error patterns across all platforms
 */
export const COMMON_ERROR_PATTERNS: ErrorPattern[] = [
    {
        patterns: ['You must be 18', 'age-restricted', 'AdultContentWarning', '"is_adult_content":true'],
        errorCode: ScraperErrorCode.AGE_RESTRICTED,
        message: 'Content is age-restricted'
    },
    {
        patterns: ['content isn\'t available', 'may be broken', 'no longer available', 'Sorry, this content'],
        errorCode: ScraperErrorCode.PRIVATE_CONTENT,
        message: 'Content is private or deleted'
    },
    {
        patterns: ['login', 'Log In', 'sign in', 'Sign In'],
        errorCode: ScraperErrorCode.COOKIE_REQUIRED,
        message: 'Login required'
    },
    {
        patterns: ['checkpoint', 'security check', 'verify your identity'],
        errorCode: ScraperErrorCode.CHECKPOINT_REQUIRED,
        message: 'Security checkpoint required'
    },
    {
        patterns: ['rate limit', 'too many requests', 'slow down'],
        errorCode: ScraperErrorCode.RATE_LIMITED,
        message: 'Rate limited'
    }
];

/**
 * Platform-specific error patterns
 */
export const PLATFORM_ERROR_PATTERNS: Partial<Record<PlatformId, ErrorPattern[]>> = {
    facebook: [
        {
            patterns: ['This video is no longer available', 'This content is no longer available'],
            errorCode: ScraperErrorCode.NOT_FOUND,
            message: 'Video removed'
        },
        {
            patterns: ['This video may have been removed', 'Video unavailable'],
            errorCode: ScraperErrorCode.DELETED,
            message: 'Video deleted'
        },
        {
            patterns: ['This video is private'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Video is private'
        }
    ],
    instagram: [
        {
            patterns: ['Page Not Found', 'Sorry, this page isn\'t available'],
            errorCode: ScraperErrorCode.NOT_FOUND,
            message: 'Post not found'
        },
        {
            patterns: ['This Account is Private'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Account is private'
        }
    ],
    twitter: [
        {
            patterns: ['This Tweet is from a suspended account', 'Account suspended'],
            errorCode: ScraperErrorCode.BLOCKED,
            message: 'Account suspended'
        },
        {
            patterns: ['This Tweet was deleted', 'Tweet unavailable'],
            errorCode: ScraperErrorCode.DELETED,
            message: 'Tweet deleted'
        },
        {
            patterns: ['protected Tweets', 'These Tweets are protected'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Account is protected'
        }
    ],
    tiktok: [
        {
            patterns: ['Video is unavailable', 'Couldn\'t find this video'],
            errorCode: ScraperErrorCode.NOT_FOUND,
            message: 'Video not found'
        },
        {
            patterns: ['This video is private', 'private video'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Video is private'
        },
        {
            patterns: ['video is under review', 'under review'],
            errorCode: ScraperErrorCode.BLOCKED,
            message: 'Video under review'
        }
    ],
    youtube: [
        {
            patterns: ['Video unavailable', 'This video is unavailable'],
            errorCode: ScraperErrorCode.NOT_FOUND,
            message: 'Video unavailable'
        },
        {
            patterns: ['This video is private', 'Private video'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Video is private'
        },
        {
            patterns: ['Sign in to confirm your age', 'age-restricted'],
            errorCode: ScraperErrorCode.AGE_RESTRICTED,
            message: 'Age verification required'
        },
        {
            patterns: ['not available in your country', 'blocked in your country'],
            errorCode: ScraperErrorCode.GEO_BLOCKED,
            message: 'Video geo-blocked'
        }
    ],
    weibo: [
        {
            patterns: ['该微博不存在', '微博已被删除', 'weibo does not exist'],
            errorCode: ScraperErrorCode.NOT_FOUND,
            message: 'Weibo not found'
        },
        {
            patterns: ['仅自己可见', '仅粉丝可见'],
            errorCode: ScraperErrorCode.PRIVATE_CONTENT,
            message: 'Weibo is private'
        }
    ]
};

/**
 * Check if content matches any pattern (case-insensitive)
 */
function matchesPattern(content: string, patterns: string[]): boolean {
    const lowerContent = content.toLowerCase();
    return patterns.some(pattern => lowerContent.includes(pattern.toLowerCase()));
}

/**
 * Detect error from HTTP status code
 */
function detectErrorFromStatus(status: number): ScraperErrorCode | null {
    if (status === 401 || status === 403) {
        return ScraperErrorCode.COOKIE_EXPIRED;
    }
    if (status === 404) {
        return ScraperErrorCode.NOT_FOUND;
    }
    if (status === 429) {
        return ScraperErrorCode.RATE_LIMITED;
    }
    if (status >= 500) {
        return ScraperErrorCode.API_ERROR;
    }
    return null;
}

/**
 * Detect error from content patterns
 */
function detectErrorFromContent(
    content: string,
    patterns: ErrorPattern[]
): ScraperErrorCode | null {
    for (const errorPattern of patterns) {
        if (matchesPattern(content, errorPattern.patterns)) {
            return errorPattern.errorCode;
        }
    }
    return null;
}

/**
 * Main error detection function
 */
export function detectError(
    status: number,
    html: string,
    extraPatterns?: ErrorPattern[]
): ScraperErrorCode | null {
    // 1. Check HTTP status first
    const statusError = detectErrorFromStatus(status);
    if (statusError) {
        return statusError;
    }

    // 2. Check common patterns
    const commonError = detectErrorFromContent(html, COMMON_ERROR_PATTERNS);
    if (commonError) {
        return commonError;
    }

    // 3. Check extra patterns if provided
    if (extraPatterns && extraPatterns.length > 0) {
        const extraError = detectErrorFromContent(html, extraPatterns);
        if (extraError) {
            return extraError;
        }
    }

    return null;
}

/**
 * Helper function to detect error from response object
 */
export function detectErrorFromResponse(
    response: { status: number; data: string },
    platform?: PlatformId
): ScraperErrorCode | null {
    const platformPatterns = platform ? PLATFORM_ERROR_PATTERNS[platform] : undefined;
    return detectError(response.status, response.data, platformPatterns);
}

/**
 * Get error message for a detected error code
 */
export function getErrorMessage(
    errorCode: ScraperErrorCode,
    platform?: PlatformId
): string {
    // Check platform-specific patterns first
    if (platform) {
        const platformPatterns = PLATFORM_ERROR_PATTERNS[platform];
        if (platformPatterns) {
            const pattern = platformPatterns.find(p => p.errorCode === errorCode);
            if (pattern) {
                return pattern.message;
            }
        }
    }

    // Check common patterns
    const commonPattern = COMMON_ERROR_PATTERNS.find(p => p.errorCode === errorCode);
    if (commonPattern) {
        return commonPattern.message;
    }

    // Default messages for status-based errors
    switch (errorCode) {
        case ScraperErrorCode.COOKIE_EXPIRED:
            return 'Authentication expired';
        case ScraperErrorCode.NOT_FOUND:
            return 'Content not found';
        case ScraperErrorCode.RATE_LIMITED:
            return 'Rate limited';
        case ScraperErrorCode.API_ERROR:
            return 'Server error';
        default:
            return 'Unknown error';
    }
}
