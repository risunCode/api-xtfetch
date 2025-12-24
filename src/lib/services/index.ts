/**
 * Platform Scrapers - Main Export
 * 
 * Each platform has its own scraper file with:
 * - Main scraping logic
 * - Platform-specific extraction
 */

// Platform scrapers
export { scrapeFacebook } from './facebook';
export { scrapeInstagram } from './instagram';
export { scrapeTikTok, fetchTikWM } from './tiktok';
export type { TikWMResult } from './tiktok';
export { scrapeTwitter } from './twitter';
export { scrapeWeibo } from './weibo';
export { scrapeYouTube, isYouTubeUrl, extractYouTubeId } from './youtube';

// Shared utilities (for internal use by scrapers)
export * from './shared';
