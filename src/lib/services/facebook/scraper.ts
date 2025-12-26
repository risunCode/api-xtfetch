/**
 * Facebook Scraper Service (Refactored)
 * Supports: /share/p|r|v/, /posts/, /reel/, /videos/, /watch/, /stories/, /groups/, /photos/
 * 
 * Uses fb-extractor helpers for optimized extraction.
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import { MediaFormat } from '@/lib/types';
import { utilDecodeHtml, utilExtractMeta } from '@/lib/utils';
import { httpGet, httpGetRotatingHeaders, httpTrackRequest } from '@/lib/http';
import { cookieParse, cookiePoolMarkSuccess, cookiePoolMarkError, cookiePoolMarkExpired, cookiePoolMarkCooldown } from '@/lib/cookies';
import { platformMatches, sysConfigScraperTimeout } from '@/core/config';
import { createError, ScraperErrorCode, type ScraperResult, type ScraperOptions } from '@/core/scrapers/types';
import { logger } from '../shared/logger';
import {
    fbExtractVideos,
    fbExtractStories,
    fbExtractImages,
    fbExtractMetadata,
    fbFindVideoBlock,
    fbDetectContentType,
    fbExtractVideoId,
    fbExtractPostId,
    fbDetectContentIssue,
    fbHasUnavailableAttachment,
    fbIsLiveVideo,
    fbTryTahoe,
    fbExtractDashVideos,
    fbGetQualityLabel,
    type FbContentType,
} from './extractor';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getResValue = (q: string): number => {
    const m = q.match(/(\d{3,4})/);
    return m ? parseInt(m[1]) : 0;
};

const mapContentIssue = (issue: ReturnType<typeof fbDetectContentIssue>): ScraperErrorCode | null => {
    if (issue === 'age_restricted') return ScraperErrorCode.AGE_RESTRICTED;
    if (issue === 'private') return ScraperErrorCode.PRIVATE_CONTENT;
    if (issue === 'login_required') return ScraperErrorCode.COOKIE_REQUIRED;
    return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════

export async function scrapeFacebook(inputUrl: string, options?: ScraperOptions): Promise<ScraperResult> {
    const startTime = Date.now();

    if (!platformMatches(inputUrl, 'facebook')) {
        return createError(ScraperErrorCode.INVALID_URL, 'Invalid Facebook URL');
    }

    const parsedCookie = cookieParse(options?.cookie, 'facebook') || undefined;
    const hasCookie = !!parsedCookie;
    const contentType = fbDetectContentType(inputUrl);

    // Stories always require cookie
    if (contentType === 'story' && !parsedCookie) {
        return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Stories membutuhkan cookie. Admin cookie pool kosong atau tidak tersedia.');
    }

    logger.type('facebook', contentType);

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN SCRAPE STRATEGY
    // ─────────────────────────────────────────────────────────────────────────
    const doScrape = async (useCookie: boolean): Promise<ScraperResult> => {
        try {
            httpTrackRequest('facebook');
            const headers = httpGetRotatingHeaders({ 
                platform: 'facebook', 
                cookie: useCookie && parsedCookie ? parsedCookie : undefined 
            });
            const timeout = sysConfigScraperTimeout('facebook');
            
            logger.debug('facebook', `Fetching ${inputUrl.substring(0, 50)}... (cookie: ${useCookie})`);
            const res = await httpGet(inputUrl, { headers, timeout });

            if (res.finalUrl.includes('/checkpoint/')) {
                // Cookie hit checkpoint - mark as expired
                if (useCookie) {
                    cookiePoolMarkExpired('Checkpoint required').catch(() => {});
                }
                throw new Error('CHECKPOINT_REQUIRED');
            }

            // Check for live video (not downloadable)
            if (fbIsLiveVideo(res.data)) {
                return createError(ScraperErrorCode.UNSUPPORTED_CONTENT, 'Live video tidak dapat didownload');
            }

            // Check for login redirect - cookie might be expired or invalid
            if (res.finalUrl.includes('/login.php') || res.finalUrl.includes('/login/?')) {
                logger.debug('facebook', `Redirected to login page: ${res.finalUrl}`);
                if (useCookie) {
                    cookiePoolMarkExpired('Login redirect - cookie expired').catch(() => {});
                    return createError(ScraperErrorCode.COOKIE_EXPIRED, 'Cookie expired atau tidak valid. Silakan update cookie di admin panel.');
                }
                return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten ini membutuhkan login.');
            }

            const html = res.data;
            const finalUrl = res.finalUrl;
            const decoded = utilDecodeHtml(html);

            logger.debug('facebook', `Got ${(html.length / 1024).toFixed(0)}KB`);
            logger.resolve('facebook', inputUrl, finalUrl);

            // Check for error page
            if (html.length < 10000 && html.includes('Sorry, something went wrong')) {
                return createError(ScraperErrorCode.API_ERROR, 'Facebook returned error page');
            }

            // Check for content issues
            const contentIssue = fbDetectContentIssue(html);
            const errorCode = mapContentIssue(contentIssue);
            
            if (errorCode && !useCookie) {
                if (errorCode === ScraperErrorCode.AGE_RESTRICTED) {
                    return createError(ScraperErrorCode.AGE_RESTRICTED, 'Konten 18+. Admin cookie pool tidak tersedia.');
                }
                if (errorCode === ScraperErrorCode.PRIVATE_CONTENT) {
                    return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Konten ini privat atau tidak tersedia.');
                }
                if (errorCode === ScraperErrorCode.COOKIE_REQUIRED) {
                    return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten ini membutuhkan login.');
                }
            }

            // Check for unavailable attachment in groups
            const actualType = fbDetectContentType(finalUrl);
            if (fbHasUnavailableAttachment(html) && actualType === 'group') {
                return createError(ScraperErrorCode.PRIVATE_CONTENT, 'The shared content is no longer available or has been deleted.');
            }

            // ─────────────────────────────────────────────────────────────────
            // EXTRACT MEDIA based on content type
            // ─────────────────────────────────────────────────────────────────
            let formats: MediaFormat[] = [];
            const seenUrls = new Set<string>();

            if (actualType === 'story') {
                // Story extraction with retry
                formats = fbExtractStories(decoded);
                
                if (formats.length === 0 && useCookie) {
                    // Retry once - stories sometimes need time to load
                    await new Promise(r => setTimeout(r, 300));
                    const retry = await httpGet(finalUrl, { headers, timeout: timeout + 5000 });
                    formats = fbExtractStories(utilDecodeHtml(retry.data));
                }
            } else if (actualType === 'video' || actualType === 'reel') {
                // Video extraction
                const videoId = fbExtractVideoId(finalUrl);
                const block = fbFindVideoBlock(decoded, videoId || undefined);
                const { hd, sd, thumbnail } = fbExtractVideos(block);
                
                if (hd) {
                    formats.push({ quality: 'HD', type: 'video', url: hd, format: 'mp4', itemId: 'video-main', thumbnail });
                    seenUrls.add(hd);
                }
                if (sd && sd !== hd) {
                    formats.push({ quality: 'SD', type: 'video', url: sd, format: 'mp4', itemId: 'video-main', thumbnail });
                    seenUrls.add(sd);
                }
                
                // Try DASH videos if no HD/SD found
                if (formats.length === 0) {
                    const dashVideos = fbExtractDashVideos(block);
                    const hdDash = dashVideos.find(v => v.height >= 720);
                    const sdDash = dashVideos.find(v => v.height < 720 && v.height >= 360);
                    
                    if (hdDash) {
                        formats.push({ quality: fbGetQualityLabel(hdDash.height), type: 'video', url: hdDash.url, format: 'mp4', itemId: 'video-main', thumbnail });
                    }
                    if (sdDash && sdDash.url !== hdDash?.url) {
                        formats.push({ quality: fbGetQualityLabel(sdDash.height), type: 'video', url: sdDash.url, format: 'mp4', itemId: 'video-main', thumbnail });
                    }
                }
                
                // Try Tahoe API if still no video found
                if (formats.length === 0) {
                    const tahoeVideoId = fbExtractVideoId(finalUrl);
                    if (tahoeVideoId) {
                        const tahoeResult = await fbTryTahoe(tahoeVideoId, useCookie ? parsedCookie : undefined);
                        if (tahoeResult) {
                            const thumb = tahoeResult.thumbnail || thumbnail;
                            if (tahoeResult.hd) {
                                formats.push({ 
                                    quality: 'HD', 
                                    type: 'video', 
                                    url: tahoeResult.hd, 
                                    format: 'mp4', 
                                    itemId: 'video-main',
                                    thumbnail: thumb 
                                });
                                seenUrls.add(tahoeResult.hd);
                            }
                            if (tahoeResult.sd && tahoeResult.sd !== tahoeResult.hd && !seenUrls.has(tahoeResult.sd)) {
                                formats.push({ 
                                    quality: 'SD', 
                                    type: 'video', 
                                    url: tahoeResult.sd, 
                                    format: 'mp4', 
                                    itemId: 'video-main',
                                    thumbnail: thumb 
                                });
                            }
                        }
                    }
                }
                
                // Fallback to images if no video found
                if (formats.length === 0) {
                    formats = fbExtractImages(decoded, fbExtractPostId(finalUrl) || undefined);
                }
            } else {
                // Post/Group/Photo extraction
                const postId = fbExtractPostId(finalUrl);
                const isPostShare = /\/share\/p\//.test(inputUrl);
                const hasSubattachments = html.includes('all_subattachments');
                
                if (isPostShare || hasSubattachments) {
                    // Prioritize images for post shares and multi-image posts
                    formats = fbExtractImages(decoded, postId || undefined);
                    
                    if (formats.length === 0) {
                        const block = fbFindVideoBlock(decoded, postId || undefined);
                        const { hd, sd, thumbnail } = fbExtractVideos(block);
                        if (hd) formats.push({ quality: 'HD', type: 'video', url: hd, format: 'mp4', itemId: 'video-main', thumbnail });
                        if (sd && sd !== hd) formats.push({ quality: 'SD', type: 'video', url: sd, format: 'mp4', itemId: 'video-main', thumbnail });
                    }
                } else {
                    // Try video first, then images
                    const block = fbFindVideoBlock(decoded, postId || undefined);
                    const { hd, sd, thumbnail } = fbExtractVideos(block);
                    
                    if (hd || sd) {
                        if (hd) formats.push({ quality: 'HD', type: 'video', url: hd, format: 'mp4', itemId: 'video-main', thumbnail });
                        if (sd && sd !== hd) formats.push({ quality: 'SD', type: 'video', url: sd, format: 'mp4', itemId: 'video-main', thumbnail });
                    } else {
                        formats = fbExtractImages(decoded, postId || undefined);
                    }
                }
            }

            // ─────────────────────────────────────────────────────────────────
            // BUILD RESULT
            // ─────────────────────────────────────────────────────────────────
            if (formats.length === 0) {
                if (errorCode === ScraperErrorCode.AGE_RESTRICTED) {
                    return createError(ScraperErrorCode.AGE_RESTRICTED, 'Konten 18+. Coba dengan cookie lain.');
                }
                if (errorCode === ScraperErrorCode.PRIVATE_CONTENT) {
                    return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Konten ini privat atau sudah dihapus.');
                }
                return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media. Post mungkin hanya teks atau privat.');
            }

            // Deduplicate and sort formats
            const seen = new Set<string>();
            formats = formats.filter(f => {
                if (seen.has(f.url)) return false;
                seen.add(f.url);
                return true;
            });
            formats.sort((a, b) => 
                (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1) || 
                getResValue(b.quality) - getResValue(a.quality)
            );

            // Extract metadata
            const meta = utilExtractMeta(html);
            const fbMeta = fbExtractMetadata(decoded);
            
            let title = utilDecodeHtml(meta.title || 'Facebook Post')
                .replace(/^[\d.]+K?\s*views.*?\|\s*/i, '')
                .trim();
            if (title.length > 100) title = title.substring(0, 100) + '...';
            
            if ((title === 'Facebook' || title === 'Facebook Post') && fbMeta.description) {
                title = fbMeta.description.length > 80 
                    ? fbMeta.description.substring(0, 80) + '...' 
                    : fbMeta.description;
            }

            const engagement = (fbMeta.likes || fbMeta.comments || fbMeta.shares || fbMeta.views) 
                ? { likes: fbMeta.likes, comments: fbMeta.comments, shares: fbMeta.shares, views: fbMeta.views }
                : undefined;

            logger.media('facebook', { 
                videos: formats.filter(f => f.type === 'video').length, 
                images: formats.filter(f => f.type === 'image').length 
            });
            logger.complete('facebook', Date.now() - startTime);

            // Mark cookie as successful if used
            if (useCookie) {
                cookiePoolMarkSuccess().catch(() => {});
            }

            return {
                success: true,
                data: {
                    title,
                    thumbnail: meta.thumbnail || fbMeta.thumbnail || formats.find(f => f.thumbnail)?.thumbnail || '',
                    author: fbMeta.author || 'Facebook',
                    description: fbMeta.description,
                    postedAt: fbMeta.postedAt,
                    engagement,
                    formats,
                    url: inputUrl,
                    type: formats.some(f => f.type === 'video') ? 'video' : 'image',
                    usedCookie: useCookie,
                }
            };

        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to fetch';
            if (msg === 'CHECKPOINT_REQUIRED') {
                return createError(ScraperErrorCode.CHECKPOINT_REQUIRED);
            }
            // Mark cookie error for network failures
            if (useCookie) {
                cookiePoolMarkError(msg).catch(() => {});
            }
            return createError(ScraperErrorCode.NETWORK_ERROR, msg);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXECUTE STRATEGY CHAIN
    // ─────────────────────────────────────────────────────────────────────────
    const isStory = contentType === 'story';
    const isGroup = contentType === 'group';
    const isVideoShare = /\/share\/v\//.test(inputUrl);

    // Track if cookie was already tried
    let cookieAlreadyTried = false;

    // Stories always use cookie
    if (isStory) {
        return doScrape(true);
    }

    // Groups and video shares: try cookie first if available
    if ((isGroup || isVideoShare) && hasCookie) {
        logger.debug('facebook', `${isGroup ? 'Group' : 'Video share'} URL, trying with cookie first...`);
        cookieAlreadyTried = true;
        const cookieResult = await doScrape(true);
        if (cookieResult.success && (cookieResult.data?.formats?.length || 0) > 0) {
            const hasVideo = cookieResult.data?.formats?.some(f => f.type === 'video') || false;
            if (!isVideoShare || hasVideo) return cookieResult;
        }
    }

    // Try without cookie first (guest mode)
    const guestResult = await doScrape(false);

    // Determine if retry with cookie is needed
    const hasVideo = guestResult.data?.formats?.some(f => f.type === 'video') || false;
    const shouldRetryVideoShare = isVideoShare && hasCookie && guestResult.success && !hasVideo;
    
    const shouldRetry = hasCookie && !cookieAlreadyTried && (
        !guestResult.success || 
        (guestResult.data?.formats?.length === 0) || 
        guestResult.errorCode === ScraperErrorCode.AGE_RESTRICTED || 
        guestResult.errorCode === ScraperErrorCode.COOKIE_REQUIRED || 
        guestResult.errorCode === ScraperErrorCode.PRIVATE_CONTENT || 
        guestResult.errorCode === ScraperErrorCode.NO_MEDIA || 
        shouldRetryVideoShare
    );

    if (shouldRetry) {
        logger.debug('facebook', 'Retrying with cookie...');
        const cookieResult = await doScrape(true);
        if (cookieResult.success && (cookieResult.data?.formats?.length || 0) > 0) {
            return cookieResult;
        }
        // If both failed, return the cookie result (usually has better error message)
        if (!guestResult.success && !cookieResult.success) {
            return cookieResult;
        }
    }

    return guestResult;
}
