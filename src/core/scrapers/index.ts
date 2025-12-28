/**
 * Core Scrapers - Barrel Export
 * Central export point for all platform scrapers.
 */

// Re-export types
export * from './types';

// Re-export utils
export * from './utils';

// Re-export scrapers
export { scrapeFacebook } from '@/lib/services/facebook';
export { scrapeInstagram } from '@/lib/services/instagram';
export { scrapeTwitter } from '@/lib/services/twitter';
export { scrapeTikTok } from '@/lib/services/tiktok';
export { scrapeWeibo } from '@/lib/services/weibo';
export { scrapeYouTube } from '@/lib/services/youtube';

// Types
import type { ScraperResult, ScraperOptions, ScraperFn, PlatformId } from './types';

// Imports for factory
import { scrapeFacebook } from '@/lib/services/facebook';
import { scrapeInstagram } from '@/lib/services/instagram';
import { scrapeTwitter } from '@/lib/services/twitter';
import { scrapeTikTok } from '@/lib/services/tiktok';
import { scrapeWeibo } from '@/lib/services/weibo';
import { scrapeYouTube } from '@/lib/services/youtube';
import { ScraperErrorCode as ErrorCode } from './types';

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
];

export function isPlatformSupported(platform: string): platform is PlatformId {
    return SUPPORTED_PLATFORMS.includes(platform as PlatformId);
}
