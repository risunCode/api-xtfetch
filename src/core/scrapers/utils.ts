/**
 * Scraper Utilities
 * Shared helper functions for all scrapers
 * 
 * @module core/scrapers/utils
 */

import type { MediaFormat } from '@/lib/types';

/**
 * Safe JSON parse - handles both string and object
 */
export function parseJson<T>(data: unknown): T | null {
    if (!data) return null;
    if (typeof data === 'object') return data as T;
    try { return JSON.parse(data as string); } catch { return null; }
}

/**
 * Dedupe formats by URL
 */
export function dedupeByUrl(formats: MediaFormat[]): MediaFormat[] {
    const seen = new Set<string>();
    return formats.filter(f => {
        if (seen.has(f.url)) return false;
        seen.add(f.url);
        return true;
    });
}

/**
 * Dedupe formats by quality+type+itemId (for multi-quality dedup)
 */
export function dedupeByQuality(formats: MediaFormat[]): MediaFormat[] {
    const seen = new Set<string>();
    return formats.filter(f => {
        const key = `${f.quality}-${f.type}-${f.itemId || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Build title from text (truncate if needed)
 */
export function buildTitle(text: string | undefined, maxLen = 100): string {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

/**
 * Detect media type from formats array
 */
export function detectMediaType(formats: MediaFormat[]): 'video' | 'image' | 'mixed' {
    const hasVideo = formats.some(f => f.type === 'video');
    const hasImage = formats.some(f => f.type === 'image');
    if (hasVideo && hasImage) return 'mixed';
    return hasVideo ? 'video' : 'image';
}
