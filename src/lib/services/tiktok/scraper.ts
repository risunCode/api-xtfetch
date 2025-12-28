/**
 * TikTok Scraper Service
 * Uses TikWM API
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import { MediaFormat } from '@/lib/types';
import { utilAddFormat } from '@/lib/utils';
import { httpGet, httpGetApiHeaders } from '@/lib/http';
import { createError, ScraperErrorCode, parseJson, type ScraperResult, type ScraperOptions } from '@/core/scrapers';
import { platformMatches, sysConfigScraperTimeout } from '@/core/config';
import { logger } from '../shared/logger';

type EngagementStats = { likes?: number; comments?: number; shares?: number; views?: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TikWMData = any;

export async function scrapeTikTok(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    const { hd = true } = options || {};
    const timeout = options?.timeout ?? sysConfigScraperTimeout('tiktok');

    if (!platformMatches(url, 'tiktok')) {
        return createError(ScraperErrorCode.INVALID_URL, 'Invalid TikTok URL');
    }

    try {
        const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=${hd ? 1 : 0}`;
        // Use simple headers for external API (TikWM) - no platform referer
        const res = await httpGet(apiUrl, 'tiktok', { headers: httpGetApiHeaders(), timeout });

        if (res.status !== 200) {
            return createError(ScraperErrorCode.API_ERROR, `API error: ${res.status}`);
        }

        const json = parseJson<{ code: number; data?: TikWMData; msg?: string }>(res.data);
        if (!json) return createError(ScraperErrorCode.PARSE_ERROR, 'Failed to parse response');
        const { code, data: d, msg } = json;

        if (code !== 0 || !d) {
            return createError(ScraperErrorCode.NO_MEDIA, msg || 'No data returned');
        }

        const engagement: EngagementStats = {
            likes: d.digg_count || 0,
            comments: d.comment_count || 0,
            shares: d.share_count || 0,
            views: d.play_count || 0,
        };

        const formats: MediaFormat[] = [];
        const isSlideshow = d.images?.length > 0;
        logger.type('tiktok', isSlideshow ? 'slideshow' : 'video');

        if (isSlideshow) {
            d.images.forEach((img: string, i: number) => {
                utilAddFormat(formats, `Image ${i + 1}`, 'image', img, { itemId: `img-${i}`, thumbnail: img });
            });
        } else {
            const hdSize = d.hd_size || d.size || 0;
            const sdSize = d.wm_size || d.size || 0;
            if (d.hdplay && d.play && d.hdplay !== d.play) {
                const [hdUrl, sdUrl, hdFilesize, sdFilesize] = hdSize >= sdSize
                    ? [d.hdplay, d.play, hdSize, sdSize]
                    : [d.play, d.hdplay, sdSize, hdSize];
                utilAddFormat(formats, 'HD (No Watermark)', 'video', hdUrl, { itemId: 'video-hd', filesize: hdFilesize || undefined });
                utilAddFormat(formats, 'SD (No Watermark)', 'video', sdUrl, { itemId: 'video-sd', filesize: sdFilesize || undefined });
            } else if (d.hdplay) {
                utilAddFormat(formats, 'HD (No Watermark)', 'video', d.hdplay, { itemId: 'video-hd', filesize: hdSize || undefined });
            } else if (d.play) {
                utilAddFormat(formats, 'Video (No Watermark)', 'video', d.play, { itemId: 'video-main', filesize: d.size || undefined });
            }
        }

        if (d.music) {
            utilAddFormat(formats, 'Audio', 'audio', d.music, { itemId: 'audio' });
        }

        if (formats.length === 0) {
            return createError(ScraperErrorCode.NO_MEDIA);
        }

        const result: ScraperResult = {
            success: true,
            data: {
                title: d.title || 'TikTok Video',
                author: d.author?.unique_id || '',
                authorName: d.author?.nickname || '',
                description: d.title || undefined, // TikTok caption is in title field
                thumbnail: d.cover || d.origin_cover || '',
                formats,
                url,
                type: isSlideshow ? 'slideshow' : 'video',
                engagement: (engagement.likes || engagement.comments || engagement.shares || engagement.views) ? engagement : undefined,
                usedCookie: false, // TikTok doesn't use cookies
            }
        };

        logger.media('tiktok', {
            videos: formats.filter(f => f.type === 'video').length,
            images: formats.filter(f => f.type === 'image').length,
            audio: formats.filter(f => f.type === 'audio').length
        });

        return result;
    } catch (e) {
        logger.error('tiktok', e);
        return createError(ScraperErrorCode.NETWORK_ERROR, e instanceof Error ? e.message : 'Fetch failed');
    }
}

export const fetchTikWM = scrapeTikTok;
export type { ScraperResult as TikWMResult };
