/**
 * Platform Configuration Module
 * Split from: lib/config.ts
 * 
 * This module provides:
 * - Platform domain configuration and detection (platform*)
 * - PLATFORM_CONFIGS constant
 * - PlatformId, PlatformDomainConfig types
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Supported platform identifiers */
export type PlatformId = 
    | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'weibo' | 'youtube'
    | 'bilibili' | 'reddit' | 'soundcloud'
    | 'eporner' | 'pornhub' | 'rule34video' | 'erome' | 'pixiv';

/** Platform domain configuration */
export interface PlatformDomainConfig {
    name: string;
    domain: string;
    aliases: string[];
    apiEndpoints?: Record<string, string>;
}

// ============================================================================
// CONSTANTS - PLATFORM DOMAIN CONFIGS
// ============================================================================

export const PLATFORM_CONFIGS: Record<PlatformId, PlatformDomainConfig> = {
    tiktok: {
        name: 'TikTok',
        domain: 'tiktok.com',
        aliases: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'm.tiktok.com', 'www.tiktok.com'],
    },
    instagram: {
        name: 'Instagram',
        domain: 'instagram.com',
        aliases: ['instagram.com', 'instagr.am', 'ddinstagram.com', 'www.instagram.com', 'ig.me'],
    },
    facebook: {
        name: 'Facebook',
        domain: 'facebook.com',
        aliases: ['facebook.com', 'fb.com', 'fb.watch', 'fb.me', 'fb.gg', 'm.facebook.com', 'web.facebook.com', 'www.facebook.com', 'l.facebook.com'],
    },
    twitter: {
        name: 'Twitter/X',
        domain: 'x.com',
        aliases: ['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'www.twitter.com', 't.co', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'],
        apiEndpoints: { syndication: 'https://cdn.syndication.twimg.com/tweet-result' },
    },
    weibo: {
        name: 'Weibo',
        domain: 'weibo.com',
        aliases: ['weibo.com', 'weibo.cn', 'm.weibo.cn', 'video.weibo.com', 'www.weibo.com', 't.cn'],
        apiEndpoints: { mobile: 'https://m.weibo.cn/statuses/show' },
    },
    youtube: {
        name: 'YouTube',
        domain: 'youtube.com',
        aliases: ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'music.youtube.com'],
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // NEW PLATFORMS (yt-dlp/gallery-dl based)
    // ═══════════════════════════════════════════════════════════════════════════
    bilibili: {
        name: 'BiliBili',
        domain: 'bilibili.com',
        aliases: ['bilibili.com', 'b23.tv', 'www.bilibili.com', 'm.bilibili.com'],
    },
    reddit: {
        name: 'Reddit',
        domain: 'reddit.com',
        aliases: ['reddit.com', 'redd.it', 'v.redd.it', 'www.reddit.com', 'old.reddit.com'],
    },
    soundcloud: {
        name: 'SoundCloud',
        domain: 'soundcloud.com',
        aliases: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'],
    },
    eporner: {
        name: 'Eporner',
        domain: 'eporner.com',
        aliases: ['eporner.com', 'www.eporner.com'],
    },
    pornhub: {
        name: 'PornHub',
        domain: 'pornhub.com',
        aliases: ['pornhub.com', 'www.pornhub.com', 'pornhubpremium.com'],
    },
    rule34video: {
        name: 'Rule34Video',
        domain: 'rule34video.com',
        aliases: ['rule34video.com', 'www.rule34video.com'],
    },
    erome: {
        name: 'Erome',
        domain: 'erome.com',
        aliases: ['erome.com', 'www.erome.com'],
    },
    pixiv: {
        name: 'Pixiv',
        domain: 'pixiv.net',
        aliases: ['pixiv.net', 'www.pixiv.net', 'pixiv.me'],
    },
};

// ============================================================================
// PLATFORM FUNCTIONS
// ============================================================================

/** Get base URL for a platform */
export function platformGetBaseUrl(platform: PlatformId): string {
    const domain = PLATFORM_CONFIGS[platform]?.domain;
    return domain ? `https://www.${domain}` : '';
}

/** Get referer header value for a platform */
export function platformGetReferer(platform: PlatformId): string {
    const domain = PLATFORM_CONFIGS[platform]?.domain;
    return domain ? `https://www.${domain}/` : '';
}

/** Get origin header value for a platform */
export function platformGetOrigin(platform: PlatformId): string {
    return platformGetBaseUrl(platform);
}

/** Detect platform from URL */
export function platformDetect(url: string): PlatformId | null {
    try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        for (const [id, config] of Object.entries(PLATFORM_CONFIGS)) {
            if (config.aliases.some(alias => hostname === alias.replace(/^www\./, '') || hostname.endsWith('.' + alias.replace(/^www\./, '')))) {
                return id as PlatformId;
            }
        }
    } catch { /* invalid URL */ }
    return null;
}

/** Check if URL belongs to a specific platform */
export function platformIsUrl(url: string, platform: PlatformId): boolean {
    return platformDetect(url) === platform;
}

/** Check if URL matches a platform (loose match) */
export function platformMatches(url: string, platform: PlatformId): boolean {
    const aliases = PLATFORM_CONFIGS[platform]?.aliases || [];
    const lower = url.toLowerCase();
    return aliases.some(alias => lower.includes(alias));
}

/** Get regex pattern for platform detection */
export function platformGetRegex(platform: PlatformId): RegExp {
    const aliases = PLATFORM_CONFIGS[platform]?.aliases || [];
    const escaped = aliases.map(a => a.replace(/\./g, '\\.'));
    return new RegExp(`(${escaped.join('|')})`, 'i');
}

/** Get all domain aliases for a platform */
export function platformGetAliases(platform: PlatformId): string[] {
    return PLATFORM_CONFIGS[platform]?.aliases || [];
}

/** Get full domain config for a platform */
export function platformGetDomainConfig(platform: PlatformId): PlatformDomainConfig {
    return PLATFORM_CONFIGS[platform];
}

/** Get API endpoint for a platform */
export function platformGetApiEndpoint(platform: PlatformId, endpoint: string): string {
    return PLATFORM_CONFIGS[platform]?.apiEndpoints?.[endpoint] || '';
}
