/**
 * Content Validator Helper
 * 
 * Provides carousel detection, content validation, and retry logic
 * for ensuring complete media extraction from social platforms.
 * 
 * @module content-validator
 */

import type { PlatformId, MediaFormat } from '@/lib/types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Metadata about carousel/multi-item content
 */
export interface CarouselMetadata {
    /** Expected number of items in the carousel */
    expectedCount: number;
    /** Type of content detected */
    contentType: 'carousel' | 'single' | 'unknown';
    /** Platform the content is from */
    platform: PlatformId;
}

/**
 * Result of content validation
 */
export interface ValidationResult {
    /** Whether the content passes basic validation */
    isValid: boolean;
    /** Whether all expected items were extracted */
    isComplete: boolean;
    /** Expected number of items (null if unknown) */
    expectedCount: number | null;
    /** Actual number of items extracted */
    actualCount: number;
    /** Number of missing items */
    missingItems: number;
    /** Confidence level of the validation */
    confidence: 'high' | 'medium' | 'low';
    /** Warning messages for potential issues */
    warnings: string[];
}

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Base delay in milliseconds */
    baseDelay: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier: number;
    /** Minimum completeness ratio (0-1) to accept without retry */
    minCompleteness: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelay: 300,
    backoffMultiplier: 1.5,
    minCompleteness: 0.8
};

/** Valid video file extensions */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.m3u8'];

/** Valid image file extensions */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

/** Valid audio file extensions */
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac'];

// ============================================================================
// CAROUSEL DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect carousel content from HTML based on platform
 * 
 * @param html - Raw HTML content to analyze
 * @param platform - Platform identifier
 * @returns CarouselMetadata with detection results
 */
export function detectCarousel(html: string, platform: PlatformId): CarouselMetadata {
    switch (platform) {
        case 'facebook':
            return detectFacebookCarousel(html);
        case 'instagram':
            return detectInstagramCarousel(html);
        case 'twitter':
            return detectTwitterCarousel(html);
        case 'tiktok':
            return detectTikTokCarousel(html);
        default:
            return {
                expectedCount: 1,
                contentType: 'unknown',
                platform
            };
    }
}

/**
 * Detect Facebook carousel from HTML
 */
export function detectFacebookCarousel(html: string): CarouselMetadata {
    const platform: PlatformId = 'facebook';
    
    // Pattern 1: all_subattachments.count in JSON data
    const subattachmentsMatch = html.match(/"all_subattachments"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
    if (subattachmentsMatch) {
        const count = parseInt(subattachmentsMatch[1], 10);
        return {
            expectedCount: count,
            contentType: count > 1 ? 'carousel' : 'single',
            platform
        };
    }

    // Pattern 2: subattachments array length
    const subattachmentsArrayMatch = html.match(/"subattachments"\s*:\s*\[\s*([^\]]+)\]/);
    if (subattachmentsArrayMatch) {
        const arrayContent = subattachmentsArrayMatch[1];
        const itemCount = (arrayContent.match(/\{/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: itemCount > 1 ? 'carousel' : 'single',
                platform
            };
        }
    }

    // Pattern 3: media_count field
    const mediaCountMatch = html.match(/"media_count"\s*:\s*(\d+)/);
    if (mediaCountMatch) {
        const count = parseInt(mediaCountMatch[1], 10);
        return {
            expectedCount: count,
            contentType: count > 1 ? 'carousel' : 'single',
            platform
        };
    }

    // Pattern 4: attached_media array
    const attachedMediaMatch = html.match(/"attached_media"\s*:\s*\[([^\]]*)\]/);
    if (attachedMediaMatch) {
        const arrayContent = attachedMediaMatch[1];
        const itemCount = (arrayContent.match(/"id"/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: itemCount > 1 ? 'carousel' : 'single',
                platform
            };
        }
    }

    return {
        expectedCount: 1,
        contentType: 'unknown',
        platform
    };
}

/**
 * Detect Instagram carousel from HTML
 */
export function detectInstagramCarousel(html: string): CarouselMetadata {
    const platform: PlatformId = 'instagram';

    // Pattern 1: GraphSidecar type (indicates carousel)
    const graphSidecarMatch = html.match(/"__typename"\s*:\s*"GraphSidecar"/);
    if (graphSidecarMatch) {
        const edgeCountMatch = html.match(/"edge_sidecar_to_children"\s*:\s*\{\s*"edges"\s*:\s*\[([^\]]+)\]/);
        if (edgeCountMatch) {
            const edgesContent = edgeCountMatch[1];
            const itemCount = (edgesContent.match(/"node"/g) || []).length;
            if (itemCount > 0) {
                return {
                    expectedCount: itemCount,
                    contentType: 'carousel',
                    platform
                };
            }
        }
    }

    // Pattern 2: carousel_media array (API response)
    const carouselMediaMatch = html.match(/"carousel_media"\s*:\s*\[([^\]]+)\]/);
    if (carouselMediaMatch) {
        const arrayContent = carouselMediaMatch[1];
        const itemCount = (arrayContent.match(/"pk"/g) || []).length || 
                          (arrayContent.match(/"id"/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: 'carousel',
                platform
            };
        }
    }

    // Pattern 3: carousel_media_count field
    const carouselCountMatch = html.match(/"carousel_media_count"\s*:\s*(\d+)/);
    if (carouselCountMatch) {
        const count = parseInt(carouselCountMatch[1], 10);
        return {
            expectedCount: count,
            contentType: count > 1 ? 'carousel' : 'single',
            platform
        };
    }

    // Pattern 4: sidecar_children (alternative naming)
    const sidecarChildrenMatch = html.match(/"sidecar_children"\s*:\s*\[([^\]]+)\]/);
    if (sidecarChildrenMatch) {
        const arrayContent = sidecarChildrenMatch[1];
        const itemCount = (arrayContent.match(/"pk"/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: 'carousel',
                platform
            };
        }
    }

    // Pattern 5: Check for GraphImage or GraphVideo (single item)
    const singleTypeMatch = html.match(/"__typename"\s*:\s*"(GraphImage|GraphVideo)"/);
    if (singleTypeMatch) {
        return {
            expectedCount: 1,
            contentType: 'single',
            platform
        };
    }

    return {
        expectedCount: 1,
        contentType: 'unknown',
        platform
    };
}

/**
 * Detect Twitter/X carousel (multiple images/videos in a tweet)
 */
function detectTwitterCarousel(html: string): CarouselMetadata {
    const platform: PlatformId = 'twitter';

    // Pattern 1: extended_entities.media array
    const mediaArrayMatch = html.match(/"extended_entities"\s*:\s*\{\s*"media"\s*:\s*\[([^\]]+)\]/);
    if (mediaArrayMatch) {
        const arrayContent = mediaArrayMatch[1];
        const itemCount = (arrayContent.match(/"id_str"/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: itemCount > 1 ? 'carousel' : 'single',
                platform
            };
        }
    }

    // Pattern 2: media_count in tweet data
    const mediaCountMatch = html.match(/"media_count"\s*:\s*(\d+)/);
    if (mediaCountMatch) {
        const count = parseInt(mediaCountMatch[1], 10);
        return {
            expectedCount: count,
            contentType: count > 1 ? 'carousel' : 'single',
            platform
        };
    }

    return {
        expectedCount: 1,
        contentType: 'unknown',
        platform
    };
}

/**
 * Detect TikTok carousel (photo mode posts)
 */
function detectTikTokCarousel(html: string): CarouselMetadata {
    const platform: PlatformId = 'tiktok';

    // Pattern 1: imagePost.images array (photo mode)
    const imagesMatch = html.match(/"imagePost"\s*:\s*\{\s*"images"\s*:\s*\[([^\]]+)\]/);
    if (imagesMatch) {
        const arrayContent = imagesMatch[1];
        const itemCount = (arrayContent.match(/"imageURL"/g) || []).length;
        if (itemCount > 0) {
            return {
                expectedCount: itemCount,
                contentType: 'carousel',
                platform
            };
        }
    }

    // Pattern 2: photo_count field
    const photoCountMatch = html.match(/"photo_count"\s*:\s*(\d+)/);
    if (photoCountMatch) {
        const count = parseInt(photoCountMatch[1], 10);
        return {
            expectedCount: count,
            contentType: count > 1 ? 'carousel' : 'single',
            platform
        };
    }

    return {
        expectedCount: 1,
        contentType: 'unknown',
        platform
    };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate extracted content against expected metadata
 */
export function validateContent(
    formats: MediaFormat[],
    metadata: CarouselMetadata
): ValidationResult {
    const warnings: string[] = [];
    const actualCount = countUniqueItems(formats);
    const expectedCount = metadata.expectedCount;
    
    const isComplete = actualCount >= expectedCount;
    const missingItems = Math.max(0, expectedCount - actualCount);
    
    const syntacticIssues = validateSyntactic(formats);
    warnings.push(...syntacticIssues);
    
    const semanticIssues = validateSemantic(formats);
    warnings.push(...semanticIssues);
    
    const confidence = calculateConfidence(metadata, actualCount, warnings.length);
    
    const isValid = formats.length > 0 && 
                    formats.every(f => isValidUrl(f.url)) &&
                    syntacticIssues.length === 0;

    return {
        isValid,
        isComplete,
        expectedCount: metadata.contentType === 'unknown' ? null : expectedCount,
        actualCount,
        missingItems,
        confidence,
        warnings
    };
}

/**
 * Count unique items in formats array
 */
function countUniqueItems(formats: MediaFormat[]): number {
    if (formats.length === 0) return 0;
    
    const itemIds = formats
        .map(f => f.itemId)
        .filter((id): id is string => id !== undefined);
    
    if (itemIds.length > 0) {
        return new Set(itemIds).size;
    }
    
    const uniqueUrls = new Set(formats.map(f => {
        try {
            const url = new URL(f.url);
            return url.pathname;
        } catch {
            return f.url;
        }
    }));
    
    return uniqueUrls.size;
}

/**
 * Validate URL format (syntactic validation)
 */
function validateSyntactic(formats: MediaFormat[]): string[] {
    const warnings: string[] = [];
    
    for (let i = 0; i < formats.length; i++) {
        const format = formats[i];
        
        if (!isValidUrl(format.url)) {
            warnings.push(`Format ${i + 1}: Invalid URL format`);
            continue;
        }
        
        if (format.url.includes('placeholder') || format.url.includes('blank')) {
            warnings.push(`Format ${i + 1}: URL appears to be a placeholder`);
        }
        
        if (!hasValidCdnPattern(format.url)) {
            warnings.push(`Format ${i + 1}: URL may not be a valid media CDN`);
        }
    }
    
    return warnings;
}

/**
 * Validate content type matches URL (semantic validation)
 */
function validateSemantic(formats: MediaFormat[]): string[] {
    const warnings: string[] = [];
    
    for (let i = 0; i < formats.length; i++) {
        const format = formats[i];
        const urlLower = format.url.toLowerCase();
        
        switch (format.type) {
            case 'video':
                if (!hasVideoExtension(urlLower) && !isVideoStream(urlLower)) {
                    warnings.push(`Format ${i + 1}: Video type but URL doesn't contain video extension`);
                }
                break;
                
            case 'image':
                if (!hasImageExtension(urlLower) && !isImageUrl(urlLower)) {
                    warnings.push(`Format ${i + 1}: Image type but URL doesn't contain image extension`);
                }
                break;
                
            case 'audio':
                if (!hasAudioExtension(urlLower)) {
                    warnings.push(`Format ${i + 1}: Audio type but URL doesn't contain audio extension`);
                }
                break;
        }
    }
    
    return warnings;
}

/**
 * Calculate confidence level based on metadata and validation results
 */
function calculateConfidence(
    metadata: CarouselMetadata,
    actualCount: number,
    warningCount: number
): 'high' | 'medium' | 'low' {
    if (metadata.contentType === 'unknown') {
        return 'low';
    }
    
    if (warningCount >= 3) {
        return 'low';
    }
    
    if (actualCount >= metadata.expectedCount && warningCount === 0) {
        return 'high';
    }
    
    if (actualCount >= metadata.expectedCount * 0.8 || warningCount <= 1) {
        return 'medium';
    }
    
    return 'low';
}

// ============================================================================
// URL VALIDATION HELPERS
// ============================================================================

function isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    
    try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
    } catch {
        return false;
    }
}

function hasValidCdnPattern(url: string): boolean {
    const cdnPatterns = [
        /fbcdn\.net/i,
        /cdninstagram\.com/i,
        /instagram\./i,
        /twimg\.com/i,
        /video\.twimg\.com/i,
        /tiktokcdn\.com/i,
        /tiktokcdn-/i,
        /muscdn\.com/i,
        /byteoversea\.com/i,
        /sinaimg\.cn/i,
        /weibo\./i,
        /googlevideo\.com/i,
        /youtube\.com/i,
        /ytimg\.com/i,
        /ggpht\.com/i,
        /cloudfront\.net/i,
        /akamaihd\.net/i,
    ];
    
    return cdnPatterns.some(pattern => pattern.test(url));
}

function hasVideoExtension(url: string): boolean {
    return VIDEO_EXTENSIONS.some(ext => url.includes(ext));
}

function isVideoStream(url: string): boolean {
    return url.includes('.m3u8') || 
           url.includes('.mpd') || 
           url.includes('/video/') ||
           url.includes('video_url') ||
           url.includes('playback');
}

function hasImageExtension(url: string): boolean {
    return IMAGE_EXTENSIONS.some(ext => url.includes(ext));
}

function isImageUrl(url: string): boolean {
    return url.includes('/image/') ||
           url.includes('_n.') ||
           url.includes('/photo/') ||
           url.includes('format=') ||
           url.includes('img');
}

function hasAudioExtension(url: string): boolean {
    return AUDIO_EXTENSIONS.some(ext => url.includes(ext));
}

// ============================================================================
// RETRY LOGIC FUNCTIONS
// ============================================================================

/**
 * Determine if a retry should be attempted for completeness
 */
export function shouldRetryForCompleteness(
    validation: ValidationResult,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
    if (validation.isComplete) {
        return false;
    }
    
    if (validation.expectedCount === null) {
        return false;
    }
    
    const completenessRatio = validation.actualCount / validation.expectedCount;
    
    if (completenessRatio >= config.minCompleteness) {
        return false;
    }
    
    if (validation.confidence === 'low' && validation.actualCount > 0) {
        return false;
    }
    
    return validation.missingItems > 0;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(
    attempt: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
    const clampedAttempt = Math.min(attempt, config.maxRetries);
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, clampedAttempt);
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    
    return Math.round(delay + jitter);
}

/**
 * Check if more retries are allowed
 */
export function canRetry(
    currentAttempt: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
    return currentAttempt < config.maxRetries;
}

/**
 * Create a custom retry configuration
 */
export function createRetryConfig(overrides: Partial<RetryConfig>): RetryConfig {
    return {
        ...DEFAULT_RETRY_CONFIG,
        ...overrides
    };
}
