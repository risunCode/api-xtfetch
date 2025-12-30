// index.ts - Facebook Hybrid Scraper (yt-dlp + Risuncode)
// Routes to appropriate engine based on content type

import { resolveUrl, getRouteDecision, platformMatches as _platformMatches } from './router';
import { scrapeWithYtdlp, scrapeWithRisuncode } from './engines';
import { extractContent } from './extractor';
import { httpGet } from '@/lib/http/client';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { logger } from '../shared/logger';
import { FALLBACK_ERRORS, FbContentType } from './types';

// Re-export types
export type { ScraperResult, ScraperOptions, ScraperData } from '@/core/scrapers/types';
export { ScraperErrorCode, createError } from '@/core/scrapers/types';
export type { MediaFormat, FbContentType, FbMetadata } from './types';

// Re-export utilities
export { getCdnInfo, isRegionalCdn, isUsCdn, optimizeUrls } from './cdn';
export { extractContent, detectIssue } from './extractor';
export { platformMatches } from './router';

/**
 * Run specified engine
 */
async function runEngine(
    engine: 'ytdlp' | 'risuncode',
    url: string,
    options: ScraperOptions
): Promise<ScraperResult> {
    switch (engine) {
        case 'ytdlp':
            return scrapeWithYtdlp(url, options);
        case 'risuncode':
            return scrapeWithRisuncode(url, options);
    }
}

/**
 * Enhance yt-dlp result with better metadata from HTML parsing
 * yt-dlp sometimes returns wrong author from suggested content
 */
async function enhanceYtdlpMetadata(
    result: ScraperResult,
    url: string,
    contentType: FbContentType,
    options: ScraperOptions
): Promise<ScraperResult> {
    if (!result.success || !result.data) return result;
    
    // Enhance ALL yt-dlp results - author extraction is often wrong
    // Skip only for story (uses Risuncode anyway)
    if (contentType === 'story') {
        return result;
    }
    
    logger.debug('facebook', `[Enhance] Starting for ${contentType}, current author: ${result.data.author}`);
    
    try {
        // Quick fetch to get HTML for metadata extraction
        const { data: html } = await httpGet(url, 'facebook', { 
            cookie: options.cookie, 
            timeout: 8000 
        });
        
        if (!html || html.length < 5000) {
            logger.debug('facebook', `[Enhance] HTML too short: ${html?.length || 0}`);
            return result;
        }
        
        logger.debug('facebook', `[Enhance] Got HTML: ${html.length} bytes`);
        
        // Extract metadata using Risuncode's extractor
        const { metadata } = extractContent(html, contentType, url);
        
        logger.debug('facebook', `[Enhance] Extracted author: ${metadata.author || 'none'}`);
        
        // Only override if we got a valid author that's different
        if (metadata.author && metadata.author !== 'Unknown' && metadata.author !== result.data.author) {
            logger.debug('facebook', `[Enhance] Author: ${result.data.author} -> ${metadata.author}`);
            return {
                ...result,
                data: {
                    ...result.data,
                    author: metadata.author,
                    // Keep yt-dlp's author as authorName for reference
                    authorName: result.data.author,
                    // Also enhance description if available
                    description: metadata.description || result.data.description,
                    groupName: metadata.groupName,
                },
            };
        } else {
            logger.debug('facebook', `[Enhance] No change needed (same or no author)`);
        }
    } catch (err) {
        // Enhancement failed - return original result
        logger.debug('facebook', `[Enhance] Failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    
    return result;
}

/**
 * Main scraper function - Hybrid router
 * 
 * Routes to yt-dlp for video content (fast & accurate)
 * Routes to Risuncode for photo/story content (full coverage)
 * Falls back to Risuncode if yt-dlp fails for unknown content
 */
export async function scrapeFacebook(
    url: string, 
    options: ScraperOptions = {}
): Promise<ScraperResult> {
    const t0 = Date.now();
    
    // 1. Resolve URL and detect content type
    const resolved = await resolveUrl(url, options.cookie);
    logger.debug('facebook', `[Router] Type: ${resolved.contentType}, URL: ${resolved.resolvedUrl.substring(0, 70)}`);
    
    // 2. Get routing decision
    const route = getRouteDecision(resolved.contentType);
    logger.debug('facebook', `[Router] Engine: ${route.primaryEngine}${route.fallbackEngine ? ` -> ${route.fallbackEngine}` : ''}`);
    
    // 3. Try primary engine
    let primaryResult = await runEngine(route.primaryEngine, resolved.resolvedUrl, options);
    
    // 4. Enhance yt-dlp metadata if successful
    if (primaryResult.success && route.primaryEngine === 'ytdlp') {
        primaryResult = await enhanceYtdlpMetadata(
            primaryResult, 
            resolved.resolvedUrl, 
            resolved.contentType, 
            options
        );
    }
    
    if (primaryResult.success) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        logger.debug('facebook', `[Done] ${route.primaryEngine} OK in ${elapsed}s`);
        return primaryResult;
    }
    
    // 5. Check if should fallback
    if (!route.fallbackEngine) {
        logger.debug('facebook', `[Done] ${route.primaryEngine} failed, no fallback`);
        return primaryResult;
    }
    
    // Check error type - only fallback for specific errors
    const errorCode = (primaryResult as any).errorCode || '';
    const errorMsg = (primaryResult as any).error || '';
    
    const shouldTryFallback = FALLBACK_ERRORS.some(e => 
        errorCode === e || 
        errorCode.includes(e) || 
        errorMsg.toUpperCase().includes(e)
    );
    
    if (!shouldTryFallback) {
        logger.debug('facebook', `[Done] ${route.primaryEngine} failed (${errorCode}), no fallback`);
        return primaryResult;
    }
    
    // 6. Try fallback engine
    logger.debug('facebook', `[Router] Fallback to ${route.fallbackEngine}`);
    const fallbackResult = await runEngine(route.fallbackEngine, resolved.resolvedUrl, options);
    
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    logger.debug('facebook', `[Done] ${route.fallbackEngine} ${fallbackResult.success ? 'OK' : 'failed'} in ${elapsed}s`);
    
    return fallbackResult;
}

// Legacy export for backward compatibility
export { scrapeFacebook as scrapeFacebookYtdlp };
