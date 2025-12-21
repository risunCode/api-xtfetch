/**
 * Security Utilities
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
// INPUT SANITIZATION
// ═══════════════════════════════════════════════════════════════

export function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

export function sanitizeObject<T>(obj: T): T {
    if (typeof obj === 'string') return escapeHtml(obj) as T;
    if (Array.isArray(obj)) return obj.map(sanitizeObject) as T;
    if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[escapeHtml(key)] = sanitizeObject(value);
        }
        return sanitized as T;
    }
    return obj;
}

// ═══════════════════════════════════════════════════════════════
// URL VALIDATION (SSRF Prevention)
// ═══════════════════════════════════════════════════════════════

const ALLOWED_DOMAINS = [
    'facebook.com', 'fb.com', 'fb.watch', 'fbcdn.net',
    'instagram.com', 'cdninstagram.com', 'instagr.am',
    'twitter.com', 'x.com', 't.co', 'twimg.com',
    'tiktok.com', 'tiktokcdn.com', 'musical.ly',
    'weibo.com', 'weibo.cn', 'sinaimg.cn',
    'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com',
];

const BLOCKED_PATTERNS = [
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/,
    /localhost/i, /\.local$/i, /\.internal$/i,
    /\[::1\]/i, /\[::\]/i, /\[fe80:/i, /\[fc00:/i, /\[fd00:/i,
    /169\.254\.169\.254/, /metadata\.google\.internal/i, /metadata\.azure\.com/i,
    /\.xip\.io$/i, /\.nip\.io$/i, /\.sslip\.io$/i,
    /^file:/i, /^ftp:/i, /^data:/i, /^gopher:/i, /^dict:/i,
    /0x[0-9a-f]+\./i, /\d+\.\d+\.\d+\.\d+\.\d+/,
];

export function isValidSocialUrl(url: string): { valid: boolean; error?: string } {
    if (!url || typeof url !== 'string') return { valid: false, error: 'URL is required' };
    if (url.length > 2000) return { valid: false, error: 'URL too long' };
    if (!/^https?:\/\//i.test(url)) return { valid: false, error: 'Invalid URL protocol' };

    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch { /* ignore */ }

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(url) || pattern.test(decodedUrl)) {
            return { valid: false, error: 'Invalid URL' };
        }
    }

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return { valid: false, error: 'Direct IP access not allowed' };
        if (hostname.startsWith('[') || hostname.includes(':')) return { valid: false, error: 'IPv6 not allowed' };
        const isAllowed = ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
        if (!isAllowed) return { valid: false, error: 'Unsupported platform' };
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// ═══════════════════════════════════════════════════════════════
// COOKIE VALIDATION
// ═══════════════════════════════════════════════════════════════

export function isValidCookie(cookie: string): { valid: boolean; error?: string } {
    if (!cookie) return { valid: true };
    if (typeof cookie !== 'string') return { valid: false, error: 'Cookie must be a string' };
    if (cookie.length > 10000) return { valid: false, error: 'Cookie too long' };
    if (/[\r\n]/.test(cookie)) return { valid: false, error: 'Invalid cookie format' };
    const suspicious = [/<script/i, /javascript:/i, /on\w+\s*=/i, /eval\s*\(/i, /\x00/];
    for (const pattern of suspicious) {
        if (pattern.test(cookie)) return { valid: false, error: 'Invalid cookie format' };
    }
    return { valid: true };
}

export function sanitizeCookie(cookie: string): string {
    if (!cookie) return '';
    return cookie.replace(/[\r\n\x00]/g, '').trim();
}

// ═══════════════════════════════════════════════════════════════
// ENCRYPTION
// ═══════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;

function getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (process.env.NODE_ENV === 'production') {
        if (!key) throw new Error('ENCRYPTION_KEY environment variable is required in production');
        if (key.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    if (!key) {
        console.warn('[Security] Using default encryption key - NOT FOR PRODUCTION');
        return 'dev-only-key-do-not-use-in-prod!!';
    }
    return key;
}

export function encrypt(text: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
    try {
        const parts = encryptedText.split(':');
        if (parts.length === 3) {
            const [ivHex, authTagHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        const [saltHex, ivHex, authTagHex, encrypted] = parts;
        const salt = Buffer.from(saltHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return '';
    }
}

// ═══════════════════════════════════════════════════════════════
// API KEY HASHING
// ═══════════════════════════════════════════════════════════════

export function hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateSecureToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

// ═══════════════════════════════════════════════════════════════
// LOG MASKING
// ═══════════════════════════════════════════════════════════════

export function maskSensitiveData(data: string, visibleChars = 4): string {
    if (!data || data.length <= visibleChars * 2) return '***';
    return data.slice(0, visibleChars) + '***' + data.slice(-visibleChars);
}

export function maskCookie(cookie: string): string {
    if (!cookie) return '';
    if (cookie.length <= 20) return '***';
    return cookie.slice(0, 10) + '...[' + cookie.length + ' chars]';
}

// ═══════════════════════════════════════════════════════════════
// REQUEST VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateRequestBody(body: unknown, maxSize = 10000): { valid: boolean; error?: string } {
    if (!body) return { valid: true };
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (str.length > maxSize) return { valid: false, error: 'Request body too large' };
    return { valid: true };
}

export function detectAttackPatterns(input: string): boolean {
    const patterns = [
        /union\s+select/i, /;\s*drop\s+table/i, /--\s*$/,
        /<script[\s>]/i, /javascript:/i, /on(error|load|click)\s*=/i,
        /\$\{.*\}/, /\{\{.*\}\}/,
    ];
    return patterns.some(p => p.test(input));
}

// ═══════════════════════════════════════════════════════════════
// CLIENT IP EXTRACTION
// ═══════════════════════════════════════════════════════════════

export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
}
