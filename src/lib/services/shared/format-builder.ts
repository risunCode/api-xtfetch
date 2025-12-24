/**
 * Format Builder Helper
 * 
 * Shared format extraction and building logic for scrapers.
 * Provides utilities for creating, deduplicating, and sorting media formats.
 * 
 * @module format-builder
 */

import type { MediaFormat } from '@/lib/types';
import { utilAddFormat } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Media source configuration for building formats
 */
export interface MediaSource {
    /** High definition URL (1080p, 720p) */
    hd?: string;
    /** Standard definition URL (480p, 360p) */
    sd?: string;
    /** Original quality URL */
    original?: string;
    /** Array of variant URLs with quality metadata */
    variants?: Array<{
        url: string;
        quality: string;
        bitrate?: number;
    }>;
}

/**
 * Options for building media formats
 */
export interface BuildFormatOptions {
    /** Unique identifier for grouping formats (carousel items) */
    itemId?: string;
    /** Thumbnail URL for this media item */
    thumbnail?: string;
    /** Custom filename hint */
    filename?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimum URL length to be considered valid */
const MIN_URL_LENGTH = 30;

/** Trusted CDN domains for media URLs */
const TRUSTED_CDN_DOMAINS = [
    'fbcdn.net',
    'scontent',
    'cdninstagram.com',
    'twimg.com',
    'tiktokcdn.com',
    'sinaimg.cn',
    'googlevideo.com',
    'ytimg.com',
];

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if a URL is a valid media URL
 */
export function isValidMediaUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    if (url.length < MIN_URL_LENGTH) return false;
    
    return TRUSTED_CDN_DOMAINS.some(domain => url.includes(domain));
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUALITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gets a human-readable quality label from video height
 */
export function getQualityLabel(height: number): string {
    if (height >= 1080) return 'HD 1080p';
    if (height >= 720) return 'HD 720p';
    if (height >= 480) return 'SD 480p';
    if (height >= 360) return 'SD 360p';
    return `${height}p`;
}

/**
 * Gets quality priority for sorting (higher = better quality)
 */
function getQualityPriority(quality: string): number {
    const q = quality.toLowerCase();
    if (q.includes('1080') || q.includes('fhd') || q.includes('fullhd')) return 100;
    if (q.includes('720') || q.includes('hd')) return 80;
    if (q.includes('480') || q.includes('sd')) return 60;
    if (q.includes('360')) return 40;
    if (q.includes('240')) return 20;
    if (q.includes('original')) return 90;
    return 50;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT MANIPULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Removes duplicate formats by URL
 */
export function deduplicateFormats(formats: MediaFormat[]): MediaFormat[] {
    const seenUrls = new Set<string>();
    return formats.filter(format => {
        if (!format.url || seenUrls.has(format.url)) {
            return false;
        }
        seenUrls.add(format.url);
        return true;
    });
}

/**
 * Sorts formats by quality (HD first, then SD)
 */
export function sortFormatsByQuality(formats: MediaFormat[]): MediaFormat[] {
    return [...formats].sort((a, b) => {
        const priorityA = getQualityPriority(a.quality);
        const priorityB = getQualityPriority(b.quality);
        return priorityB - priorityA;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FORMAT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds an array of MediaFormat objects from a MediaSource configuration
 */
export function buildFormats(
    source: MediaSource,
    type: 'video' | 'image',
    options?: BuildFormatOptions
): MediaFormat[] {
    const formats: MediaFormat[] = [];
    const seenUrls = new Set<string>();
    
    // Helper to add format if URL is unique
    const addFormat = (url: string | undefined, quality: string) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        
        utilAddFormat(formats, quality, type, url, {
            itemId: options?.itemId,
            thumbnail: options?.thumbnail,
            filename: options?.filename,
        });
    };
    
    // 1. Add HD first (highest priority)
    if (source.hd) {
        addFormat(source.hd, 'HD');
    }
    
    // 2. Add SD if exists and different from HD
    if (source.sd && source.sd !== source.hd) {
        addFormat(source.sd, 'SD');
    }
    
    // 3. Add original if exists and unique
    if (source.original && source.original !== source.hd && source.original !== source.sd) {
        addFormat(source.original, 'Original');
    }
    
    // 4. Process variants sorted by bitrate (highest first)
    if (source.variants && source.variants.length > 0) {
        const sortedVariants = [...source.variants].sort((a, b) => {
            const bitrateA = a.bitrate ?? 0;
            const bitrateB = b.bitrate ?? 0;
            return bitrateB - bitrateA;
        });
        
        for (const variant of sortedVariants) {
            if (variant.url && !seenUrls.has(variant.url)) {
                addFormat(variant.url, variant.quality || 'Video');
            }
        }
    }
    
    return formats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds and sorts formats in one operation
 */
export function buildAndSortFormats(
    source: MediaSource,
    type: 'video' | 'image',
    options?: BuildFormatOptions
): MediaFormat[] {
    const formats = buildFormats(source, type, options);
    return sortFormatsByQuality(formats);
}
