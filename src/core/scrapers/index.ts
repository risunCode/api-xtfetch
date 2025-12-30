/**
 * Core Scrapers - Barrel Export
 * Central export point for all platform scrapers.
 */

// Re-export types
export * from './types';

// Re-export utils
export * from './utils';

// Import scrapers (used for both re-export and factory)
import { scrapeFacebook } from '@/lib/services/facebook';
import { scrapeInstagram } from '@/lib/services/instagram';
import { scrapeTwitter } from '@/lib/services/twitter';
import { scrapeTikTok } from '@/lib/services/tiktok';
import { scrapeWeibo } from '@/lib/services/weibo';
import { scrapeYouTube } from '@/lib/services/youtube';
import { scrapeGeneric } from '@/lib/services/generic';

// Re-export scrapers
export { scrapeFacebook, scrapeInstagram, scrapeTwitter, scrapeTikTok, scrapeWeibo, scrapeYouTube, scrapeGeneric };

// Types
import type { ScraperResult, ScraperOptions, ScraperFn, PlatformId } from './types';
import type { GenericPlatform } from '@/lib/services/generic';
import { ScraperErrorCode as ErrorCode } from './types';

// Platforms that use the generic scraper (yt-dlp/gallery-dl)
const GENERIC_PLATFORMS: GenericPlatform[] = [
    'bilibili', 'reddit', 'soundcloud',
    'eporner', 'pornhub', 'rule34video', 'threads', 'erome', 'pixiv',
];

export function getScraper(platform: PlatformId): ScraperFn | null {
    const scrapers: Partial<Record<PlatformId, ScraperFn>> = {
        facebook: scrapeFacebook,
        instagram: scrapeInstagram,
        twitter: scrapeTwitter,
        tiktok: scrapeTikTok,
        weibo: scrapeWeibo,
        youtube: scrapeYouTube,
    };
    return scrapers[platform] || null;
}

export async function runScraper(
    platform: PlatformId,
    url: string,
    options?: ScraperOptions
): Promise<ScraperResult> {
    // Check if platform uses generic scraper
    if (GENERIC_PLATFORMS.includes(platform as GenericPlatform)) {
        return scrapeGeneric(url, platform as GenericPlatform, options);
    }
    
    const scraper = getScraper(platform);
    if (!scraper) {
        return {
            success: false,
            error: `No scraper available for ${platform}`,
            errorCode: ErrorCode.UNSUPPORTED_PLATFORM,
        };
    }
    return scraper(url, options);
}

export const SUPPORTED_PLATFORMS: PlatformId[] = [
    'facebook',
    'instagram',
    'twitter',
    'tiktok',
    'weibo',
    'youtube',
    // Generic platforms (yt-dlp/gallery-dl)
    'bilibili',
    'reddit',
    'soundcloud',
    'eporner',
    'pornhub',
    'rule34video',
    'threads',
    'erome',
    'pixiv',
];

export function isPlatformSupported(platform: string): platform is PlatformId {
    return SUPPORTED_PLATFORMS.includes(platform as PlatformId);
}
