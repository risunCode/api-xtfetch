/**
 * Error UI Utilities
 * User-friendly error display system with icons, colors, and actions.
 */

import { ScraperErrorCode, ERROR_MESSAGES } from '@/core/scrapers/types';

export interface ErrorDisplay {
    icon: string;
    color: string;
    bgColor: string;
    title: string;
    message: string;
    action?: string;
    actionType?: 'retry' | 'login' | 'cookie' | 'none';
    retryable: boolean;
}

const ERROR_DISPLAYS: Record<ScraperErrorCode, Omit<ErrorDisplay, 'message'>> = {
    [ScraperErrorCode.INVALID_URL]: {
        icon: 'Link2Off', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Invalid URL', retryable: false,
    },
    [ScraperErrorCode.UNSUPPORTED_PLATFORM]: {
        icon: 'Globe', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Not Supported', retryable: false,
    },
    [ScraperErrorCode.COOKIE_REQUIRED]: {
        icon: 'Cookie', color: 'text-amber-500', bgColor: 'bg-amber-500/10',
        title: 'Login Required', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.COOKIE_EXPIRED]: {
        icon: 'Clock', color: 'text-amber-500', bgColor: 'bg-amber-500/10',
        title: 'Cookie Expired', action: 'Update Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.COOKIE_INVALID]: {
        icon: 'Cookie', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Invalid Cookie', action: 'Check Cookie', actionType: 'cookie', retryable: false,
    },
    [ScraperErrorCode.COOKIE_BANNED]: {
        icon: 'Ban', color: 'text-red-600', bgColor: 'bg-red-500/10',
        title: 'Account Banned', retryable: false,
    },
    [ScraperErrorCode.NOT_FOUND]: {
        icon: 'FileQuestion', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Not Found', retryable: false,
    },
    [ScraperErrorCode.PRIVATE_CONTENT]: {
        icon: 'Lock', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10',
        title: 'Private Content', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.AGE_RESTRICTED]: {
        icon: 'AlertTriangle', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Age Restricted', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.NO_MEDIA]: {
        icon: 'ImageOff', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'No Media', retryable: false,
    },
    [ScraperErrorCode.DELETED]: {
        icon: 'Trash2', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Deleted', retryable: false,
    },
    [ScraperErrorCode.CONTENT_REMOVED]: {
        icon: 'XCircle', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Content Removed', retryable: false,
    },
    [ScraperErrorCode.GEO_BLOCKED]: {
        icon: 'MapPinOff', color: 'text-blue-500', bgColor: 'bg-blue-500/10',
        title: 'Region Blocked', retryable: false,
    },
    [ScraperErrorCode.TIMEOUT]: {
        icon: 'Timer', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10',
        title: 'Timeout', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.RATE_LIMITED]: {
        icon: 'Gauge', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Rate Limited', action: 'Wait & Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.BLOCKED]: {
        icon: 'ShieldX', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Blocked', retryable: false,
    },
    [ScraperErrorCode.NETWORK_ERROR]: {
        icon: 'Wifi', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Network Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.API_ERROR]: {
        icon: 'Server', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'API Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.PARSE_ERROR]: {
        icon: 'FileWarning', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Parse Error', retryable: false,
    },
    [ScraperErrorCode.CHECKPOINT_REQUIRED]: {
        icon: 'ShieldAlert', color: 'text-amber-600', bgColor: 'bg-amber-500/10',
        title: 'Verification Required', retryable: false,
    },
    [ScraperErrorCode.UNKNOWN]: {
        icon: 'CircleAlert', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
};

export function getErrorDisplay(code: ScraperErrorCode, customMessage?: string): ErrorDisplay {
    const base = ERROR_DISPLAYS[code] || ERROR_DISPLAYS[ScraperErrorCode.UNKNOWN];
    return {
        ...base,
        message: customMessage || ERROR_MESSAGES[code] || ERROR_MESSAGES[ScraperErrorCode.UNKNOWN],
    };
}

export function getErrorDisplayFromString(codeStr: string, customMessage?: string): ErrorDisplay {
    const code = Object.values(ScraperErrorCode).includes(codeStr as ScraperErrorCode)
        ? codeStr as ScraperErrorCode
        : ScraperErrorCode.UNKNOWN;
    return getErrorDisplay(code, customMessage);
}

export function needsCookie(code: ScraperErrorCode): boolean {
    return [
        ScraperErrorCode.COOKIE_REQUIRED,
        ScraperErrorCode.COOKIE_EXPIRED,
        ScraperErrorCode.AGE_RESTRICTED,
        ScraperErrorCode.PRIVATE_CONTENT,
    ].includes(code);
}

export function shouldRetryWithCookie(code: ScraperErrorCode): boolean {
    return [
        ScraperErrorCode.COOKIE_REQUIRED,
        ScraperErrorCode.AGE_RESTRICTED,
        ScraperErrorCode.PRIVATE_CONTENT,
    ].includes(code);
}
