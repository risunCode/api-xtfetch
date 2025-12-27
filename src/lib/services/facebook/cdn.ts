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

// Jakarta CDN hostname for replacement (closest to Singapore server)
const JAKARTA_CDN = 'scontent.fbdj2-1.fna.fbcdn.net';

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

// Replace non-Asia CDN URLs with Jakarta CDN (closest to Singapore server)
// Facebook CDNs are interchangeable - same content, different edge location
// IMPORTANT: Don't replace video.xx.fbcdn.net - it has audio, scontent may serve muted version!
export function optimizeCdnUrl(url: string): string {
    // NEVER replace video.xx.fbcdn.net - this is the full video with audio
    // Replacing it with scontent CDN may serve dash_muted version without audio
    if (url.includes('video.') && url.includes('fbcdn.net')) {
        console.log(`[FB.CDN] Keeping video.* URL (has audio)`);
        return url;
    }
    
    const info = getCdnInfo(url);
    
    // Already Asia CDN, no need to replace
    if (info.region === 'asia') return url;
    
    // Replace US/EU/Unknown CDN hostname with Jakarta CDN
    // Pattern: scontent-bos5-1.xx.fbcdn.net, scontent.fra1-1.fna.fbcdn.net, scontent.xx.fbcdn.net, etc.
    const replaced = url.replace(
        /scontent[-.][\w-]+\.(?:xx|fna)\.fbcdn\.net/,
        JAKARTA_CDN
    );
    
    if (replaced !== url) {
        console.log(`[FB.CDN] Redirected: ${info.location} -> Jakarta`);
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
