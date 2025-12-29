/**
 * Twitter/X Media Extractor
 * Handles parsing of tweet data and media extraction
 */

import { MediaFormat } from '@/lib/types';
import { utilAddFormat } from '@/lib/utils';

/**
 * Parse Twitter date format to ISO 8601
 * Twitter format: "Mon Dec 29 10:36:50 +0000 2025"
 * ISO 8601 format: "2025-12-29T10:36:50.000Z"
 */
export function parseTwitterDate(twitterDate: string): string {
    try {
        const date = new Date(twitterDate);
        if (isNaN(date.getTime())) {
            return twitterDate; // Return original if parsing fails
        }
        return date.toISOString();
    } catch {
        return twitterDate; // Return original on error
    }
}

/**
 * Format author username with @ prefix
 */
export function formatAuthor(username: string): string {
    if (!username) return '';
    return username.startsWith('@') ? username : `@${username}`;
}

export interface TweetData {
    text?: string;
    user?: { screen_name?: string; name?: string };
    mediaDetails?: MediaDetail[];
    photos?: { url: string }[];
    created_at?: string;
    engagement?: { replies?: number; retweets?: number; likes?: number; views?: number; bookmarks?: number };
}

export interface MediaDetail {
    type: 'video' | 'photo' | 'animated_gif';
    media_key?: string;
    media_url_https?: string;
    video_info?: { variants?: { content_type: string; url: string; bitrate?: number }[] };
}

export interface IssueResult {
    code: string;
    message: string;
}

/**
 * Detect issues from HTTP response status
 */
export function detectIssue(status: number, _data?: unknown): IssueResult | null {
    if (status === 429) {
        return { code: 'RATE_LIMITED', message: 'Rate limited' };
    }
    if (status === 401 || status === 403) {
        return { code: 'AUTH_REQUIRED', message: 'Authentication required' };
    }
    return null;
}

/**
 * Parse media from tweet data
 */
export function parseMedia(data: TweetData, username: string): { formats: MediaFormat[]; thumbnail: string } {
    const formats: MediaFormat[] = [];
    let thumbnail = '';

    (data.mediaDetails || []).forEach((media, idx) => {
        const itemId = media.media_key || `media-${idx}`;
        if (media.type === 'video' || media.type === 'animated_gif') {
            thumbnail = media.media_url_https || thumbnail;
            const variants = (media.video_info?.variants || [])
                .filter(v => v.content_type === 'video/mp4' && v.url)
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            variants.forEach(v => {
                const m = v.url?.match(/\/(\d+)x(\d+)\//);
                const h = m ? Math.max(+m[1], +m[2]) : 0;
                const q = h >= 1080 ? 'FULLHD (1080p)' : h >= 720 ? 'HD (720p)' : h >= 480 ? 'SD (480p)' : v.bitrate && v.bitrate >= 2e6 ? 'HD (720p)' : 'SD (480p)';
                utilAddFormat(formats, q, 'video', v.url, { itemId, thumbnail: media.media_url_https, filename: `${username}_video_${idx + 1}` });
            });
        } else if (media.type === 'photo') {
            const base = media.media_url_https || '';
            thumbnail = thumbnail || base;
            const m = base.match(/^(.+)\.(\w+)$/);
            if (m) {
                // Only 4K - Large is redundant (same content, smaller size)
                utilAddFormat(formats, 'Original (4K)', 'image', `${m[1]}?format=${m[2]}&name=4096x4096`, { itemId, thumbnail: base, filename: `${username}_image_${idx + 1}` });
            } else {
                utilAddFormat(formats, 'Original', 'image', base, { itemId, thumbnail: base, filename: `${username}_image_${idx + 1}` });
            }
        }
    });

    // Fallback to photos array if mediaDetails is empty
    if (!formats.length && data.photos) {
        data.photos.forEach((p, idx) => {
            const base = p.url || '';
            const m = base.match(/^(.+)\.(\w+)$/);
            thumbnail = thumbnail || base;
            if (m) {
                // Only 4K - Large is redundant
                utilAddFormat(formats, 'Original (4K)', 'image', `${m[1]}?format=${m[2]}&name=4096x4096`, { itemId: `photo-${idx}`, filename: `${username}_image_${idx + 1}` });
            }
        });
    }
    return { formats, thumbnail };
}
