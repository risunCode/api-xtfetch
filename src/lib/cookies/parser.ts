/**
 * Cookie Parser Module
 * Universal cookie parsing and validation for all platforms
 * 
 * Extracted from unified cookies.ts
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CookiePlatform = 'facebook' | 'instagram' | 'weibo' | 'twitter' | 'youtube';

interface CookieObject {
    name?: string;
    value?: string;
    domain?: string;
}

export interface ValidationResult {
    valid: boolean;
    missing?: string[];
    info?: {
        userId?: string;
        sessionId?: string;
        pairCount: number;
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DOMAIN_PATTERNS: Record<CookiePlatform, string[]> = {
    facebook: ['.facebook.com', 'facebook.com', '.fb.com'],
    instagram: ['.instagram.com', 'instagram.com'],
    weibo: ['.weibo.com', 'weibo.com', '.weibo.cn'],
    twitter: ['.twitter.com', 'twitter.com', '.x.com', 'x.com'],
    youtube: ['.youtube.com', 'youtube.com', '.google.com', 'google.com'],
};

const REQUIRED_COOKIES: Record<CookiePlatform, string[]> = {
    facebook: ['c_user', 'xs'],
    instagram: ['sessionid'],
    weibo: ['SUB'],
    twitter: ['auth_token'],
    youtube: ['LOGIN_INFO'],  // Or SID, HSID - LOGIN_INFO is most important
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function filterAndExtract(
    cookies: CookieObject[], 
    platform?: CookiePlatform
): { name: string; value: string }[] {
    let filtered = cookies;
    
    if (platform && DOMAIN_PATTERNS[platform]) {
        const patterns = DOMAIN_PATTERNS[platform];
        filtered = cookies.filter(c => {
            if (!c.domain) return true;
            const domain = c.domain.toLowerCase();
            return patterns.some(p => domain.includes(p.replace('.', '')));
        });
    }
    
    return filtered
        .filter(c => c.name && c.value)
        .map(c => ({ name: c.name!, value: c.value! }));
}

function parseCookiePairs(cookie: string): { name: string; value: string }[] {
    const pairs: { name: string; value: string }[] = [];
    
    if (cookie.trim().startsWith('[')) {
        try {
            const arr = JSON.parse(cookie);
            if (Array.isArray(arr)) {
                arr.forEach((c: CookieObject) => {
                    if (c.name && c.value) pairs.push({ name: c.name, value: c.value });
                });
                return pairs;
            }
        } catch { /* fall through */ }
    }
    
    cookie.split(';').forEach(pair => {
        const [name, ...valueParts] = pair.trim().split('=');
        if (name && valueParts.length) {
            pairs.push({ name: name.trim(), value: valueParts.join('=').trim() });
        }
    });
    
    return pairs;
}

function extractCookieInfo(
    pairs: { name: string; value: string }[], 
    platform: CookiePlatform
): ValidationResult['info'] {
    const info: ValidationResult['info'] = { pairCount: pairs.length };
    
    switch (platform) {
        case 'facebook': {
            const cUser = pairs.find(p => p.name === 'c_user');
            const xs = pairs.find(p => p.name === 'xs');
            if (cUser) info.userId = cUser.value;
            if (xs) info.sessionId = xs.value.substring(0, 20) + '...';
            break;
        }
        case 'instagram': {
            const dsUser = pairs.find(p => p.name === 'ds_user_id');
            const sessionId = pairs.find(p => p.name === 'sessionid');
            if (dsUser) info.userId = dsUser.value;
            if (sessionId) info.sessionId = sessionId.value.substring(0, 20) + '...';
            break;
        }
        case 'weibo': {
            const sub = pairs.find(p => p.name === 'SUB');
            if (sub) info.sessionId = sub.value.substring(0, 20) + '...';
            break;
        }
        case 'twitter': {
            const authToken = pairs.find(p => p.name === 'auth_token');
            if (authToken) info.sessionId = authToken.value.substring(0, 20) + '...';
            break;
        }
        case 'youtube': {
            const loginInfo = pairs.find(p => p.name === 'LOGIN_INFO');
            const sid = pairs.find(p => p.name === 'SID');
            const hsid = pairs.find(p => p.name === 'HSID');
            if (loginInfo) info.sessionId = loginInfo.value.substring(0, 20) + '...';
            if (sid) info.userId = sid.value.substring(0, 10) + '...';
            break;
        }
    }
    
    return info;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Parse cookie input from various formats into a standard cookie string
 */
export function cookieParse(input: unknown, platform?: CookiePlatform): string | null {
    if (!input) return null;
    
    let pairs: { name: string; value: string }[] = [];
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;
        
        if (trimmed.startsWith('[')) {
            try {
                const arr = JSON.parse(trimmed) as CookieObject[];
                if (Array.isArray(arr)) {
                    pairs = filterAndExtract(arr, platform);
                }
            } catch {
                return trimmed;
            }
        } else {
            return trimmed;
        }
    } else if (Array.isArray(input)) {
        pairs = filterAndExtract(input as CookieObject[], platform);
    } else if (typeof input === 'object' && input !== null) {
        const obj = input as CookieObject;
        if (obj.name && obj.value) {
            pairs = [{ name: obj.name, value: obj.value }];
        }
    }
    
    if (pairs.length === 0) return null;
    return pairs.map(p => `${p.name}=${p.value}`).join('; ');
}

/**
 * Validate a cookie string for a specific platform
 */
export function cookieValidate(cookie: string | null, platform: CookiePlatform): ValidationResult {
    if (!cookie) {
        return { valid: false, missing: REQUIRED_COOKIES[platform] };
    }
    
    const pairs = parseCookiePairs(cookie);
    const required = REQUIRED_COOKIES[platform];
    const missing = required.filter(name => !pairs.some(p => p.name === name));
    const info = extractCookieInfo(pairs, platform);
    
    return {
        valid: missing.length === 0,
        missing: missing.length > 0 ? missing : undefined,
        info,
    };
}

/**
 * Check if input looks like a cookie
 */
export function cookieIsLike(input: unknown): boolean {
    if (!input) return false;
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (trimmed.startsWith('[')) {
            try {
                const arr = JSON.parse(trimmed);
                return Array.isArray(arr) && arr.some((c: CookieObject) => c.name && c.value);
            } catch {
                return false;
            }
        }
        return trimmed.includes('=');
    }
    
    if (Array.isArray(input)) {
        return input.some((c: CookieObject) => c.name && c.value);
    }
    
    return false;
}

/**
 * Detect the format of a cookie input
 */
export function cookieGetFormat(input: unknown): 'json' | 'string' | 'array' | 'unknown' {
    if (!input) return 'unknown';
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return 'json';
            } catch {
                return 'unknown';
            }
        }
        return 'string';
    }
    
    if (Array.isArray(input)) return 'array';
    return 'unknown';
}
