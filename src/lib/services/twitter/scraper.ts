/**
 * Twitter/X Scraper Service
 * FLOW: Syndication API (no cookie) → GraphQL API with cookie (age-restricted)
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import { httpGet, httpGetHeaders } from '@/lib/http';
import { cookiePoolMarkSuccess, cookiePoolMarkExpired } from '@/lib/cookies';
import { platformMatches, platformGetApiEndpoint, sysConfigScraperTimeout } from '@/core/config';
import { createError, ScraperErrorCode, parseJson, dedupeByQuality, type ScraperResult, type ScraperOptions } from '@/core/scrapers';
import { logger } from '../shared/logger';
import { TweetData, MediaDetail, parseMedia, detectIssue } from './extractor';

type EngagementStats = { likes?: number; comments?: number; shares?: number; views?: number; bookmarks?: number; replies?: number };

const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

async function fetchSyndication(tweetId: string): Promise<{ data: TweetData | null; error?: string; issue?: { code: string; message: string } }> {
    try {
        const url = `${platformGetApiEndpoint('twitter', 'syndication')}?id=${tweetId}&lang=en&token=x`;
        const res = await httpGet(url, 'twitter', { headers: { Referer: 'https://platform.twitter.com/' } });
        
        const issue = detectIssue(res.status);
        if (issue) return { data: null, error: `HTTP ${res.status}`, issue };
        
        if (res.status !== 200) return { data: null, error: `HTTP ${res.status}` };
        const data = parseJson<TweetData>(res.data);
        return { data };
    } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : 'Fetch failed' };
    }
}

function getCt0(cookie: string): string {
    const match = cookie.match(/ct0=([^;]+)/);
    return match ? match[1] : '';
}


async function fetchWithGraphQL(tweetId: string, cookie: string): Promise<{ data: TweetData | null; error?: string; issue?: { code: string; message: string } }> {
    try {
        const ct0 = getCt0(cookie);
        if (!ct0) return { data: null, error: 'Missing ct0 token in cookie' };

        const variables = { focalTweetId: tweetId, with_rux_injections: false, includePromotedContent: true, withCommunity: true, withQuickPromoteEligibilityTweetFields: true, withBirdwatchNotes: true, withVoice: true, withV2Timeline: true };
        const features = { creator_subscriptions_tweet_preview_api_enabled: true, c9s_tweet_anatomy_moderator_badge_enabled: true, tweetypie_unmention_optimization_enabled: true, responsive_web_edit_tweet_api_enabled: true, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true, view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true, responsive_web_twitter_article_tweet_consumption_enabled: false, tweet_awards_web_tipping_enabled: false, responsive_web_home_pinned_timelines_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true, standardized_nudges_misinfo: true, tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true, longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: true, responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false, responsive_web_media_download_video_enabled: false, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false, responsive_web_graphql_timeline_navigation_enabled: true, responsive_web_enhance_cards_enabled: false };

        const url = `https://x.com/i/api/graphql/xOhkmRac04YFZmOzU9PJHg/TweetDetail?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;

        const timeout = sysConfigScraperTimeout('twitter');
        const res = await httpGet(url, 'twitter', {
            timeout,
            headers: { ...httpGetHeaders('twitter', { cookie }), 'Authorization': `Bearer ${BEARER_TOKEN}`, 'X-Csrf-Token': ct0, 'X-Twitter-Auth-Type': 'OAuth2Session', 'X-Twitter-Active-User': 'yes', 'X-Twitter-Client-Language': 'en' },
        });

        const issue = detectIssue(res.status);
        if (issue) {
            if (res.status === 401 || res.status === 403) {
                cookiePoolMarkExpired(`HTTP ${res.status} - cookie expired`).catch(() => {});
            }
            return { data: null, error: `GraphQL API error: ${res.status}`, issue };
        }

        if (res.status !== 200) return { data: null, error: `GraphQL API error: ${res.status}` };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = parseJson<any>(res.data);
        const instructions = json?.data?.threaded_conversation_with_injections_v2?.instructions || [];
        const addEntries = instructions.find((i: { type: string }) => i.type === 'TimelineAddEntries');
        const tweetEntry = addEntries?.entries?.find((e: { entryId: string }) => e.entryId === `tweet-${tweetId}`);
        if (!tweetEntry) return { data: null, error: 'Tweet not found in response' };

        const tweetResult = tweetEntry.content?.itemContent?.tweet_results?.result;
        const tweet = tweetResult?.tweet || tweetResult;
        const legacy = tweet?.legacy;
        if (!legacy) return { data: null, error: 'Could not parse tweet data' };

        const mediaDetails: MediaDetail[] = [];
        const extMedia = legacy.extended_entities?.media || legacy.entities?.media || [];
        for (const m of extMedia) {
            if (m.type === 'photo') mediaDetails.push({ type: 'photo', media_key: m.id_str, media_url_https: m.media_url_https });
            else if (m.type === 'video' || m.type === 'animated_gif') mediaDetails.push({ type: m.type, media_key: m.id_str, media_url_https: m.media_url_https, video_info: m.video_info });
        }
        if (mediaDetails.length === 0) return { data: null, error: 'No media in tweet' };

        const userLegacy = tweet.core?.user_results?.result?.legacy;
        return {
            data: {
                text: legacy.full_text || '',
                user: { screen_name: userLegacy?.screen_name || '', name: userLegacy?.name || '' },
                mediaDetails,
                created_at: legacy.created_at || '',
                engagement: { replies: legacy.reply_count || 0, retweets: legacy.retweet_count || 0, likes: legacy.favorite_count || 0, views: tweet.views?.count ? parseInt(tweet.views.count) : 0, bookmarks: legacy.bookmark_count || 0 },
            }
        };
    } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : 'GraphQL fetch failed' };
    }
}


export async function scrapeTwitter(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    const { cookie } = options || {};

    if (!platformMatches(url, 'twitter')) return createError(ScraperErrorCode.INVALID_URL, 'Invalid Twitter/X URL');

    const match = url.match(/\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/);
    if (!match) return createError(ScraperErrorCode.INVALID_URL, 'Could not extract tweet ID');

    const [, username, tweetId] = match;
    logger.type('twitter', 'tweet');

    logger.debug('twitter', 'Trying Syndication API...');
    const { data: synData, error: synError, issue: synIssue } = await fetchSyndication(tweetId);

    // Handle rate limiting
    if (synIssue?.code === 'RATE_LIMITED') {
        return createError(ScraperErrorCode.RATE_LIMITED, 'Twitter API rate limited. Please try again later.');
    }

    if (synData) {
        const { formats, thumbnail } = parseMedia(synData, synData.user?.screen_name || username);
        if (formats.length > 0) {
            const unique = dedupeByQuality(formats);
            const title = synData.text ? synData.text.substring(0, 100) + (synData.text.length > 100 ? '...' : '') : 'Twitter Post';
            const description = synData.text || undefined; // Full tweet text as description
            const engagement: EngagementStats | undefined = synData.engagement ? { views: synData.engagement.views, likes: synData.engagement.likes, comments: synData.engagement.replies, shares: synData.engagement.retweets, bookmarks: synData.engagement.bookmarks, replies: synData.engagement.replies } : undefined;

            const result: ScraperResult = { success: true, data: { title, thumbnail, author: synData.user?.screen_name || username, authorName: synData.user?.name, description, postedAt: synData.created_at, engagement, formats: unique, url, type: unique.some(f => f.type === 'video') ? 'video' : 'image' } };
            logger.media('twitter', { videos: unique.filter(f => f.type === 'video').length, images: unique.filter(f => f.type === 'image').length });
            return result;
        }
    }

    // Syndication failed or returned no media - try GraphQL with cookie
    if (cookie) {
        logger.debug('twitter', 'Syndication returned no media, trying GraphQL API with cookie...');
        const { data: gqlData, issue: gqlIssue } = await fetchWithGraphQL(tweetId, cookie);
        
        // Handle rate limiting
        if (gqlIssue?.code === 'RATE_LIMITED') {
            return createError(ScraperErrorCode.RATE_LIMITED, 'Twitter API rate limited. Please try again later.');
        }
        
        // Handle auth issues (cookie expired)
        if (gqlIssue?.code === 'AUTH_REQUIRED') {
            return createError(ScraperErrorCode.COOKIE_EXPIRED, 'Cookie expired or invalid. Please provide a fresh cookie.');
        }
        
        if (gqlData) {
            const { formats, thumbnail } = parseMedia(gqlData, gqlData.user?.screen_name || username);
            if (formats.length > 0) {
                const unique = dedupeByQuality(formats);
                const title = gqlData.text ? gqlData.text.substring(0, 100) + (gqlData.text.length > 100 ? '...' : '') : 'Twitter Post';
                const description = gqlData.text || undefined; // Full tweet text as description
                const engagement: EngagementStats | undefined = gqlData.engagement ? { views: gqlData.engagement.views, likes: gqlData.engagement.likes, comments: gqlData.engagement.replies, shares: gqlData.engagement.retweets, bookmarks: gqlData.engagement.bookmarks, replies: gqlData.engagement.replies } : undefined;

                const result: ScraperResult = { success: true, data: { title, thumbnail, author: gqlData.user?.screen_name || username, authorName: gqlData.user?.name, description, postedAt: gqlData.created_at, engagement, formats: unique, url, usedCookie: true, type: unique.some(f => f.type === 'video') ? 'video' : 'image' } };
                // Mark cookie success
                cookiePoolMarkSuccess().catch(() => { });
                return result;
            }
        }
    }

    // No cookie available and content seems restricted
    if (!cookie && (synError?.includes('403') || !synData?.mediaDetails?.length)) {
        return createError(ScraperErrorCode.AGE_RESTRICTED, 'This tweet may be age-restricted. Please provide a cookie.');
    }
    return createError(ScraperErrorCode.NO_MEDIA, synError || 'No downloadable media found');
}
