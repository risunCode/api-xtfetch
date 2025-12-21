/**
 * Retry Utility
 * Smart retry wrapper with exponential backoff and cookie fallback.
 */

import { ScraperErrorCode, ScraperResult, isRetryable } from '@/core/scrapers/types';
import { shouldRetryWithCookie } from './error-ui';
import { randomSleep } from '@/lib/http';
import { getScraperMaxRetries, getScraperRetryDelay } from '@/lib/services/helper/system-config';

export interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    backoff?: 'linear' | 'exponential' | 'none';
    retryWithCookie?: boolean;
    cookie?: string;
    onRetry?: (attempt: number, error: ScraperErrorCode) => void;
}

export async function withRetry<T extends ScraperResult>(
    fn: (useCookie?: boolean) => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = getScraperMaxRetries(),
        baseDelay = getScraperRetryDelay(),
        backoff = 'exponential',
        retryWithCookie = true,
        cookie,
        onRetry,
    } = options;

    let lastResult: T | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            const useCookie = attempt > 0 && retryWithCookie && !!cookie;
            const result = await fn(useCookie);

            if (result.success) return result;

            lastResult = result;
            const errorCode = result.errorCode || ScraperErrorCode.UNKNOWN;

            const canRetry = isRetryable(errorCode);
            const needsCookieRetry = shouldRetryWithCookie(errorCode) && retryWithCookie && !!cookie;

            if (!canRetry && !needsCookieRetry) return result;

            if (attempt < maxRetries) {
                onRetry?.(attempt + 1, errorCode);
                const delay = calculateDelay(attempt, baseDelay, backoff);
                await randomSleep(delay, delay + 500);
                attempt++;
            } else {
                return result;
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMsg,
                errorCode: ScraperErrorCode.UNKNOWN,
            } as T;
        }
    }

    return lastResult || {
        success: false,
        error: 'Max retries exceeded',
        errorCode: ScraperErrorCode.UNKNOWN,
    } as T;
}

function calculateDelay(
    attempt: number,
    baseDelay: number,
    backoff: 'linear' | 'exponential' | 'none'
): number {
    switch (backoff) {
        case 'exponential': return baseDelay * Math.pow(2, attempt);
        case 'linear': return baseDelay * (attempt + 1);
        case 'none':
        default: return baseDelay;
    }
}

export async function retryAsync<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await randomSleep(delay, delay + 500);
            }
        }
    }

    throw lastError || new Error('Max retries exceeded');
}
