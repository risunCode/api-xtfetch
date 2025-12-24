/**
 * Weibo Scraper Service
 * Supports regular posts, TV URLs, and video content
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import * as cheerio from 'cheerio';
import { MediaFormat } from '@/lib/types';
import { utilAddFormat } from '@/lib/utils';
import { httpGet, httpPost, DESKTOP_HEADERS } from '@/lib/http';
import { platformMatches, platformGetApiEndpoint, sysConfigScraperTimeout } from '@/core/config';
import { createError, ScraperErrorCode, type ScraperResult, type ScraperOptions } from '@/core/scrapers/types';
import { logger } from '../shared/logger';

type EngagementStats = { likes?: number; comments?: number; shares?: number; views?: number };

export async function scrapeWeibo(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    const startTime = Date.now();
    const cookie = options?.cookie;

    if (!platformMatches(url, 'weibo')) return createError(ScraperErrorCode.INVALID_URL, 'Invalid Weibo URL');

    const formats: MediaFormat[] = [];
    let title = 'Weibo Video', thumbnail = '', author = '';
    const engagement: EngagementStats = {};

    const tvMatch = url.match(/(?:tv\/show\/|fid=)(\d+):(\d+)/);
    const detailMatch = url.match(/detail\/(\d+)/);
    const statusMatch = url.match(/weibo\.(?:com|cn)\/\d+\/([A-Za-z0-9]+)/);
    const mobileStatusMatch = url.match(/m\.weibo\.cn\/status\/(\d+)/);
    const mobileDetailMatch = url.match(/m\.weibo\.cn\/detail\/(\d+)/);

    let postId = '';
    const isTvUrl = url.includes('/tv/') || url.includes('video.weibo.com');

    if (tvMatch) postId = tvMatch[2];
    else if (mobileStatusMatch) postId = mobileStatusMatch[1];
    else if (mobileDetailMatch) postId = mobileDetailMatch[1];
    else if (detailMatch) postId = detailMatch[1];
    else if (statusMatch) postId = statusMatch[1];

    logger.type('weibo', isTvUrl ? 'tv' : (postId ? 'post' : 'unknown'));

    if (!cookie) return createError(ScraperErrorCode.COOKIE_REQUIRED);

    const weiboHeaders = { ...DESKTOP_HEADERS, 'Cookie': cookie };
    const timeout = sysConfigScraperTimeout('weibo');


    try {
        // TV URLs
        if (isTvUrl && tvMatch) {
            const oid = `${tvMatch[1]}:${tvMatch[2]}`;

            try {
                const apiUrl = `https://weibo.com/tv/api/component?page=/tv/show/${oid}`;
                const res = await httpPost(apiUrl, `data={"Component_Play_Playinfo":{"oid":"${oid}"}}`, {
                    headers: { ...weiboHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `https://weibo.com/tv/show/${oid}`, 'X-Requested-With': 'XMLHttpRequest' },
                    timeout,
                });

                const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                if (text.startsWith('{')) {
                    const apiData = JSON.parse(text);
                    const playInfo = apiData.data?.Component_Play_Playinfo;
                    if (playInfo?.urls) {
                        title = playInfo.title || title;
                        author = playInfo.user?.screen_name || '';
                        thumbnail = playInfo.cover_image || '';
                        Object.entries(playInfo.urls).forEach(([quality, videoUrl]) => {
                            if (videoUrl && typeof videoUrl === 'string') {
                                const vUrl = videoUrl.startsWith('//') ? 'https:' + videoUrl : videoUrl;
                            utilAddFormat(formats, quality.replace('mp4_', '').toUpperCase(), 'video', vUrl);
                            }
                        });
                    }
                }
            } catch { /* Component API failed */ }

            if (!formats.length) {
                const pageRes = await httpGet(`https://weibo.com/tv/show/${oid}`, { headers: weiboHeaders, timeout });
                if (pageRes.status === 200) {
                    const html = pageRes.data;
                    const videoMatches = html.match(/f\.video\.weibocdn\.com[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/g);
                    videoMatches?.forEach((m: string) => {
                        const vUrl = 'https://' + m.replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
                        const quality = vUrl.match(/label=mp4_(\d+p)/)?.[1]?.toUpperCase() || 'Video';
                        utilAddFormat(formats, quality, 'video', vUrl);
                    });
                    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
                    if (titleMatch) title = titleMatch[1].replace(/ - 微博视频号$/, '').trim();
                }
            }

            if (!formats.length) return createError(ScraperErrorCode.COOKIE_EXPIRED);
        }


        // Engagement for TV URLs
        if (isTvUrl && postId) {
            try {
                const apiRes = await httpGet(`${platformGetApiEndpoint('weibo', 'mobile')}?id=${postId}`, { headers: { Accept: 'application/json', Referer: 'https://m.weibo.cn/' } });
                if (apiRes.status === 200) {
                    const text = typeof apiRes.data === 'string' ? apiRes.data : JSON.stringify(apiRes.data);
                    if (text.startsWith('{')) {
                        const { data: post } = JSON.parse(text);
                        if (post) {
                            engagement.likes = post.attitudes_count || 0;
                            engagement.comments = post.comments_count || 0;
                            engagement.shares = post.reposts_count || 0;
                            if (!author && post.user?.screen_name) author = post.user.screen_name;
                        }
                    }
                }
            } catch { /* Engagement fetch failed */ }
        }

        if (isTvUrl && formats.length) {
            const seen = new Set<string>(), unique = formats.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });
            logger.media('weibo', { videos: unique.length });
            logger.complete('weibo', Date.now() - startTime);
            // ✅ FIX: Mark usedCookie (Weibo always requires cookie)
            const result: ScraperResult = { success: true, data: { title: title.substring(0, 100), description: title, thumbnail, author, formats: unique, url, engagement: (engagement.likes || engagement.comments || engagement.shares) ? engagement : undefined, type: 'video', usedCookie: true } };
            return result;
        }


        // Regular posts
        if (!formats.length && !isTvUrl) {
            const fetchUrl = url.includes('m.weibo.cn') ? url : url.replace('weibo.com', 'm.weibo.cn');
            const res = await httpGet(fetchUrl, { platform: 'weibo', timeout });
            if (res.status === 200) {
                const html = res.data;
                const $ = cheerio.load(html);
                const decoded = html.replace(/&amp;/g, '&').replace(/\\u0026/g, '&');

                const videoSrc = $('video').attr('src') || $('video source').attr('src');
                if (videoSrc) {
                    const vUrl = (videoSrc.startsWith('//') ? 'https:' + videoSrc : videoSrc).replace(/&amp;/g, '&');
                    const quality = vUrl.match(/label=mp4_(\d+p)/)?.[1]?.toUpperCase() || 'HD';
                    utilAddFormat(formats, quality, 'video', vUrl);
                }

                const videoMatches = decoded.match(/https?:\/\/f\.video\.weibocdn\.com\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/g) || decoded.match(/\/\/f\.video\.weibocdn\.com\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/g);
                videoMatches?.forEach((m: string) => {
                    let vUrl = m.startsWith('//') ? 'https:' + m : m;
                    vUrl = vUrl.replace(/&amp;/g, '&');
                    const quality = vUrl.match(/label=mp4_(\d+p)/)?.[1]?.toUpperCase() || 'Video';
                    utilAddFormat(formats, quality, 'video', vUrl);
                });

                const streamMatches = decoded.match(/"stream_url(?:_hd)?"\s*:\s*"([^"]+)"/g);
                streamMatches?.forEach((m: string) => {
                    const urlMatch = m.match(/"([^"]+)"/);
                    if (urlMatch?.[1]) {
                        let vUrl = urlMatch[1].replace(/\\\//g, '/');
                        if (vUrl.startsWith('//')) vUrl = 'https:' + vUrl;
                        utilAddFormat(formats, m.includes('_hd') ? 'HD' : 'SD', 'video', vUrl);
                    }
                });

                if (!isTvUrl) {
                    const imgUrls = new Set<string>();
                    decoded.match(/https?:\/\/wx\d\.sinaimg\.cn\/[^"'\s<>]+\.(jpg|jpeg|png|gif)[^"'\s<>]*/gi)?.forEach((u: string) => {
                        const large = u.replace(/\/(orj|mw|thumb)\d+\/|\/bmiddle\/|\/small\/|\/square\//g, '/large/');
                        if (!/avatar|icon|emoticon/i.test(large)) imgUrls.add(large);
                    });
                    [...imgUrls].forEach((u, i) => {
                        utilAddFormat(formats, `Image ${i + 1}`, 'image', u, { itemId: `img-${i}` });
                        if (!thumbnail) thumbnail = u.replace('/large/', '/mw690/');
                    });
                }

                title = $('meta[property="og:title"]').attr('content') || $('title').text().replace(/ \| .+$/, '').trim() || title;
                if (!thumbnail) thumbnail = $('meta[property="og:image"]').attr('content') || '';

                const attitudesMatch = html.match(/"attitudes_count":(\d+)/) || html.match(/attitudes_count=(\d+)/);
                if (attitudesMatch) engagement.likes = parseInt(attitudesMatch[1]);
                const commentsMatch = html.match(/"comments_count":(\d+)/) || html.match(/comments_count=(\d+)/);
                if (commentsMatch) engagement.comments = parseInt(commentsMatch[1]);
                const repostsMatch = html.match(/"reposts_count":(\d+)/) || html.match(/reposts_count=(\d+)/);
                if (repostsMatch) engagement.shares = parseInt(repostsMatch[1]);
            }
        }


        // Mobile API fallback
        if (!formats.length && postId && !isTvUrl) {
            try {
                const apiRes = await httpGet(`${platformGetApiEndpoint('weibo', 'mobile')}?id=${postId}`, { headers: { Accept: 'application/json', Referer: 'https://m.weibo.cn/' } });
                if (apiRes.status === 200) {
                    const text = typeof apiRes.data === 'string' ? apiRes.data : JSON.stringify(apiRes.data);
                    if (text.startsWith('{')) {
                        const { data: post } = JSON.parse(text);
                        if (post) {
                            title = post.text?.replace(/<[^>]*>/g, '') || title;
                            author = post.user?.screen_name || '';
                            engagement.likes = post.attitudes_count || 0;
                            engagement.comments = post.comments_count || 0;
                            engagement.shares = post.reposts_count || 0;
                            const media = post.page_info?.media_info;
                            if (media) {
                                thumbnail = post.page_info.page_pic?.url || thumbnail;
                                if (media.stream_url_hd) utilAddFormat(formats, 'HD', 'video', media.stream_url_hd);
                                if (media.stream_url) utilAddFormat(formats, 'SD', 'video', media.stream_url);
                                if (media.mp4_720p_mp4) utilAddFormat(formats, '720P', 'video', media.mp4_720p_mp4);
                                if (media.mp4_hd_url) utilAddFormat(formats, 'HD (MP4)', 'video', media.mp4_hd_url);
                                if (media.mp4_sd_url) utilAddFormat(formats, 'SD (MP4)', 'video', media.mp4_sd_url);
                            }
                            post.pics?.forEach((pic: { large?: { url: string }; url: string }, i: number) => {
                                const u = pic.large?.url || pic.url;
                                if (u) { thumbnail = thumbnail || u; utilAddFormat(formats, `Image ${i + 1}`, 'image', u, { itemId: `img-${i}`, thumbnail: u }); }
                            });
                        }
                    }
                }
            } catch { /* API failed */ }
        }

        if (!formats.length) return createError(ScraperErrorCode.COOKIE_EXPIRED);

        const seen = new Set<string>(), unique = formats.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });
        const hasVideo = unique.some(f => f.type === 'video');
        const hasImage = unique.some(f => f.type === 'image');

        logger.media('weibo', { videos: unique.filter(f => f.type === 'video').length, images: unique.filter(f => f.type === 'image').length });
        logger.complete('weibo', Date.now() - startTime);

        // ✅ FIX: Mark usedCookie (Weibo always requires cookie)
        const result: ScraperResult = { success: true, data: { title: title.substring(0, 100), description: title, thumbnail, author, formats: unique, url, engagement: (engagement.likes || engagement.comments || engagement.shares) ? engagement : undefined, type: hasVideo && hasImage ? 'mixed' : (hasVideo ? 'video' : 'image'), usedCookie: true } };
        return result;
    } catch (e) {
        logger.error('weibo', e);
        return createError(ScraperErrorCode.NETWORK_ERROR, e instanceof Error ? e.message : 'Failed to fetch');
    }
}
