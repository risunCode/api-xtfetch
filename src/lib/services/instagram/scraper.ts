/**
 * Instagram Scraper Service
 * FLOW: Stories → Direct fetch with cookie | Post/Reel/TV → GraphQL (no cookie) → GraphQL (cookie) → error
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import { httpGet, httpGetHeaders } from '@/lib/http';
import { cookieParse, cookiePoolMarkSuccess, cookiePoolMarkError, cookiePoolMarkExpired } from '@/lib/cookies';
import { platformMatches, sysConfigScraperTimeout } from '@/core/config';
import { createError, ScraperErrorCode, parseJson, type ScraperResult, type ScraperOptions } from '@/core/scrapers';
import { logger } from '../shared/logger';
import { PATTERNS } from '../shared/patterns';
import {
    GraphQLMedia,
    StoryItem,
    extractFromGraphQL,
    extractFromEmbed,
    extractFromStories,
    getContentType,
    generateTitle,
    EngagementStats,
} from './extractor';
import { parseEngagementFromHtml, mergeEngagementStats, cleanEngagementStats } from '../shared/engagement-parser';

type ContentType = 'post' | 'reel' | 'tv' | 'story';
const GRAPHQL_DOC_ID = '8845758582119845';

function detectContentType(url: string): ContentType {
    if (url.includes('/stories/')) return 'story';
    if (url.includes('/reel/') || url.includes('/reels/')) return 'reel';
    if (url.includes('/tv/')) return 'tv';
    return 'post';
}

function extractShortcode(url: string): string | null {
    const match = url.match(PATTERNS.instagram.shortcode);
    return match ? match[1] : null;
}

function extractStoryInfo(url: string): { username: string; storyId: string } | null {
    const match = url.match(PATTERNS.instagram.storyInfo);
    return match ? { username: match[1], storyId: match[2] } : null;
}

async function fetchGraphQL(shortcode: string, cookie?: string): Promise<{ media: GraphQLMedia | null; error?: string }> {
    const variables = JSON.stringify({ shortcode, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null });
    const url = `https://www.instagram.com/graphql/query/?doc_id=${GRAPHQL_DOC_ID}&variables=${encodeURIComponent(variables)}`;
    const timeout = sysConfigScraperTimeout('instagram');

    try {
        const res = await httpGet(url, 'instagram', {
            headers: httpGetHeaders('instagram', { cookie }),
            timeout
        });
        if (res.status !== 200) return { media: null, error: `HTTP ${res.status}` };
        const data = parseJson<{ data?: { xdt_shortcode_media?: GraphQLMedia } }>(res.data);
        return { media: data?.data?.xdt_shortcode_media || null };
    } catch (e) {
        return { media: null, error: e instanceof Error ? e.message : 'Fetch failed' };
    }
}

/**
 * Fetch HTML page to extract engagement stats as fallback
 */
async function fetchHtmlEngagement(shortcode: string): Promise<EngagementStats> {
    const url = `https://www.instagram.com/p/${shortcode}/`;
    const timeout = sysConfigScraperTimeout('instagram');
    
    try {
        const res = await httpGet(url, 'instagram', {
            headers: httpGetHeaders('instagram'),
            timeout
        });
        if (res.status !== 200) return {};
        return parseEngagementFromHtml(res.data, 'instagram');
    } catch {
        return {};
    }
}

async function buildGraphQLResult(media: GraphQLMedia, shortcode: string, usedCookie: boolean): Promise<ScraperResult> {
    const { formats, thumbnail, metadata } = extractFromGraphQL(media, shortcode);

    if (formats.length === 0) {
        return createError(ScraperErrorCode.NO_MEDIA, 'No media found in response');
    }

    const title = generateTitle(metadata.caption);
    const type = getContentType(formats);

    // If comments is 0 or missing, try to fetch from HTML page as fallback
    let engagement = metadata.engagement;
    if (engagement && !engagement.comments) {
        logger.debug('instagram', 'Comments missing from GraphQL, fetching HTML fallback...');
        const htmlEngagement = await fetchHtmlEngagement(shortcode);
        if (htmlEngagement.comments && htmlEngagement.comments > 0) {
            engagement = cleanEngagementStats(mergeEngagementStats([engagement, htmlEngagement]));
            logger.debug('instagram', `HTML fallback found ${htmlEngagement.comments} comments`);
        }
    }

    return {
        success: true,
        data: {
            title,
            thumbnail,
            author: metadata.author ? `@${metadata.author}` : '',
            authorName: metadata.authorName,
            description: metadata.caption,
            postedAt: metadata.postedAt,
            engagement,
            formats,
            url: `https://www.instagram.com/p/${shortcode}/`,
            type,
            usedCookie,
        },
    };
}

async function fetchEmbed(shortcode: string): Promise<ScraperResult> {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    try {
        const res = await httpGet(embedUrl, 'instagram', { headers: httpGetHeaders('instagram') });
        if (res.status !== 200) return createError(ScraperErrorCode.API_ERROR, `Embed HTTP ${res.status}`);
        const html = res.data;
        if (html.length < 1000) return createError(ScraperErrorCode.NO_MEDIA, 'Empty embed response');

        const { formats, thumbnail, author } = extractFromEmbed(html);

        if (formats.length === 0) {
            return createError(ScraperErrorCode.NO_MEDIA, 'No media in embed');
        }

        return {
            success: true,
            data: {
                title: 'Instagram Post',
                thumbnail,
                author: author ? `@${author}` : '',
                formats,
                url: `https://www.instagram.com/p/${shortcode}/`,
            },
        };
    } catch (e) {
        return createError(ScraperErrorCode.NETWORK_ERROR, e instanceof Error ? e.message : 'Embed failed');
    }
}

async function getUserId(username: string, cookie: string): Promise<string | null> {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    const timeout = sysConfigScraperTimeout('instagram');
    try {
        const res = await httpGet(url, 'instagram', { headers: httpGetHeaders('instagram', { cookie }), timeout });
        if (res.status !== 200) return null;
        const data = parseJson<{ data?: { user?: { id: string } } }>(res.data);
        return data?.data?.user?.id || null;
    } catch { return null; }
}

async function scrapeStory(url: string, cookie?: string): Promise<ScraperResult> {
    const info = extractStoryInfo(url);
    if (!info) return createError(ScraperErrorCode.INVALID_URL, 'Invalid story URL');
    const { username, storyId } = info;
    if (!cookie) return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Stories require login. Please provide a cookie.');

    try {
        const userId = await getUserId(username, cookie);
        if (!userId) {
            cookiePoolMarkExpired('User ID fetch failed - cookie may be expired').catch(() => { });
            return createError(ScraperErrorCode.COOKIE_EXPIRED, 'Cookie may be expired or user not found. Please update your cookie.');
        }

        const apiUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
        const timeout = sysConfigScraperTimeout('instagram');
        const res = await httpGet(apiUrl, 'instagram', { headers: httpGetHeaders('instagram', { cookie }), timeout });

        if (res.status === 401 || res.status === 403) {
            cookiePoolMarkExpired('HTTP 401/403 - cookie expired').catch(() => { });
            return createError(ScraperErrorCode.COOKIE_EXPIRED, 'Cookie expired. Please update your cookie.');
        }
        if (res.status !== 200) return createError(ScraperErrorCode.API_ERROR, `Story API error: ${res.status}`);

        const data = parseJson<{ reels_media?: Array<{ items?: StoryItem[] }> }>(res.data);
        const items: StoryItem[] = data?.reels_media?.[0]?.items || [];
        if (items.length === 0) return createError(ScraperErrorCode.NOT_FOUND, 'No stories available (may have expired)');

        const { formats, thumbnail } = extractFromStories(items, storyId);

        if (formats.length === 0) {
            return createError(ScraperErrorCode.NO_MEDIA, 'Could not extract story media');
        }

        cookiePoolMarkSuccess().catch(() => { });

        return {
            success: true,
            data: {
                title: `${username}'s Story`,
                thumbnail,
                author: `@${username}`,
                description: `${items.length} story${items.length > 1 ? 's' : ''} available`,
                formats,
                url,
                usedCookie: true,
            },
        };
    } catch (e) {
        cookiePoolMarkError(e instanceof Error ? e.message : 'Story fetch failed').catch(() => { });
        return createError(ScraperErrorCode.NETWORK_ERROR, e instanceof Error ? e.message : 'Story fetch failed');
    }
}

export async function scrapeInstagram(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    const { cookie: rawCookie } = options || {};
    const cookie = rawCookie ? cookieParse(rawCookie, 'instagram') || undefined : undefined;

    if (!platformMatches(url, 'instagram')) return createError(ScraperErrorCode.INVALID_URL, 'Invalid Instagram URL');

    const contentType = detectContentType(url);
    logger.type('instagram', contentType);

    if (contentType === 'story') return scrapeStory(url, cookie);

    const shortcode = extractShortcode(url);
    if (!shortcode) return createError(ScraperErrorCode.INVALID_URL, 'Could not extract post ID from URL');

    logger.debug('instagram', 'GraphQL probe (no cookie)...');
    const { media, error: gqlError } = await fetchGraphQL(shortcode);
    if (media) {
        return await buildGraphQLResult(media, shortcode, false);
    }

    if (cookie) {
        logger.debug('instagram', 'GraphQL retry (with cookie)...');
        const { media: authMedia } = await fetchGraphQL(shortcode, cookie);
        if (authMedia) {
            cookiePoolMarkSuccess().catch(() => { });
            return await buildGraphQLResult(authMedia, shortcode, true);
        }
        cookiePoolMarkError('GraphQL failed with cookie').catch(() => { });
        return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Post is private or has been deleted');
    }

    if (gqlError && (gqlError.includes('HTTP 4') || gqlError.includes('HTTP 5'))) {
        logger.debug('instagram', 'API error, trying embed fallback...');
        const embedResult = await fetchEmbed(shortcode);
        if (embedResult.success) return embedResult;
    }

    return createError(ScraperErrorCode.COOKIE_REQUIRED, 'This post requires login. Please provide a cookie.');
}
