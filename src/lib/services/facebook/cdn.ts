// cdn.ts - CDN utilities for Facebook scraper

type CdnRegion = 'asia' | 'us' | 'eu' | 'unknown';

interface CdnInfo {
    region: CdnRegion;
    location: string;
    score: number;
}

// CDN patterns with scores (higher = better for Singapore server)
const CDN_MAP: Record<string, CdnInfo> = {
    // Asia (highest priority)
    'fbdj': { region: 'asia', location: 'Jakarta', score: 100 },
    'sin': { region: 'asia', location: 'Singapore', score: 100 },
    'sgp': { region: 'asia', location: 'Singapore', score: 100 },
    'hkg': { region: 'asia', location: 'Hong Kong', score: 95 },
    'nrt': { region: 'asia', location: 'Tokyo', score: 90 },
    'fna.fbcdn': { region: 'asia', location: 'Asia', score: 85 },
    // Europe (medium priority)
    'ams': { region: 'eu', location: 'Amsterdam', score: 50 },
    'fra': { region: 'eu', location: 'Frankfurt', score: 50 },
    'lhr': { region: 'eu', location: 'London', score: 50 },
    // US (lowest priority - high latency from Singapore)
    'bos': { region: 'us', location: 'Boston', score: 10 },
    'iad': { region: 'us', location: 'Virginia', score: 10 },
    'lax': { region: 'us', location: 'Los Angeles', score: 15 },
    'sjc': { region: 'us', location: 'San Jose', score: 15 },
    'xx.fbcdn': { region: 'us', location: 'US/Global', score: 5 },
};

// Video CDN hostname - serves full video WITH AUDIO
// scontent.* CDN may serve dash_muted version without audio!
const VIDEO_CDN = 'video.xx.fbcdn.net';

export function getCdnInfo(url: string): CdnInfo {
    for (const [pattern, info] of Object.entries(CDN_MAP)) {
        if (url.includes(pattern)) return info;
    }
    return { region: 'unknown', location: 'Unknown', score: 20 };
}

export function isRegionalCdn(url: string): boolean {
    return getCdnInfo(url).region === 'asia';
}

export function isUsCdn(url: string): boolean {
    return getCdnInfo(url).region === 'us';
}

// Replace scontent.* CDN URLs with video.xx.fbcdn.net to get FULL VIDEO WITH AUDIO
// scontent.* CDN serves dash_muted version (no audio) for some videos!
// video.xx.fbcdn.net always serves the full muxed video with audio
export function optimizeCdnUrl(url: string): string {
    // Already video.* CDN, no need to replace
    if (url.includes('video.') && url.includes('fbcdn.net')) {
        return url;
    }
    
    // Replace any scontent.* hostname with video.xx.fbcdn.net
    // This ensures we get the full video with audio, not the muted DASH version
    const replaced = url.replace(
        /scontent[-.][\w-]+\.(?:xx|fna)\.fbcdn\.net/,
        VIDEO_CDN
    );
    
    if (replaced !== url) {
        console.log(`[FB.CDN] Redirected to video.xx (with audio)`);
    }
    
    return replaced;
}

// Sort formats by CDN + quality priority
export function optimizeUrls<T extends { url: string; _priority?: number }>(formats: T[]): T[] {
    return [...formats].sort((a, b) => {
        const scoreA = (a._priority || 0) + getCdnInfo(a.url).score;
        const scoreB = (b._priority || 0) + getCdnInfo(b.url).score;
        return scoreB - scoreA;
    });
}

// Log CDN selection for debugging
export function logCdnSelection(url: string): void {
    const info = getCdnInfo(url);
    console.log(`[FB.CDN] Selected: ${info.location} (${info.region}) - Score: ${info.score}`);
}
