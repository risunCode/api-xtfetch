/**
 * Unified Media Sending Utility
 * 
 * Consolidates all media sending logic for the Telegram bot.
 * Supports both ctx-based (from handlers) and api-based (from worker) sending.
 * 
 * Features:
 * - Filesize validation (40MB limit)
 * - CDN optimization for Facebook (redirects US/EU to Jakarta)
 * - Download to buffer for fbcdn.net and cdninstagram.com URLs
 * - Retry logic with exponential backoff (3 attempts)
 * - Fallback to direct link if send fails
 * - Chat action status (upload_video, upload_photo)
 * - Support for video, photo single, and photo album
 */

import { InputFile, InlineKeyboard } from 'grammy';
import type { InputMediaPhoto } from 'grammy/types';
import type { Api } from 'grammy';

import { optimizeCdnUrl } from '@/lib/services/facebook/cdn';
import { logger } from '@/lib/services/shared/logger';

import type { BotContext, DownloadResult } from '../types';
import { detectContentType } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum filesize Telegram can send directly (40MB) */
export const MAX_TELEGRAM_FILESIZE = 40 * 1024 * 1024; // 40MB

/** Maximum retry attempts for CDN downloads */
const MAX_RETRY_ATTEMPTS = 3;

/** Timeout per download attempt (ms) */
const DOWNLOAD_TIMEOUT_MS = 25000;

/** CDN domains that require download to buffer */
const CDN_DOMAINS_REQUIRE_DOWNLOAD = ['fbcdn.net', 'cdninstagram.com'];

// ============================================================================
// TYPES
// ============================================================================

export interface SendMediaOptions {
  /** Bot context for handler-based sending */
  ctx?: BotContext;
  /** Grammy API instance for worker-based sending */
  api?: Api;
  /** Target chat ID */
  chatId: number;
  /** Scraper result with formats */
  result: DownloadResult;
  /** Original URL for keyboard buttons */
  originalUrl: string;
  /** Processing message ID to delete on success */
  processingMsgId?: number;
  /** User language */
  lang?: 'en' | 'id';
}

export interface SendMediaResult {
  success: boolean;
  error?: string;
}

interface VideoFormat {
  quality: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  filesize?: number;
  itemId?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if URL requires download to buffer (Facebook/Instagram CDN)
 */
function needsDownloadFirst(url: string): boolean {
  return CDN_DOMAINS_REQUIRE_DOWNLOAD.some(domain => url.includes(domain));
}

import { escapeMarkdown, buildSimpleCaptionFromResult, log } from '../helpers';

/**
 * Build simple caption - just username/author
 * Used for non-YouTube platforms (cleaner embed)
 * @param result - Download result with author info
 * @param _originalUrl - Original URL (kept for API compatibility, not used in caption)
 */
export function buildSimpleCaption(result: DownloadResult, _originalUrl?: string): string {
  return buildSimpleCaptionFromResult(result, _originalUrl);
}

/**
 * Get platform display name
 */
function getPlatformName(platform?: string): string {
  const names: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    twitter: 'X/Twitter',
    facebook: 'Facebook',
    weibo: 'Weibo',
  };
  return names[platform || ''] || platform || 'Download';
}

/**
 * Find HD video format
 */
function findHdVideo(videos: VideoFormat[]): VideoFormat | undefined {
  return videos.find(f => {
    const q = f.quality.toLowerCase();
    return q.includes('1080') || q.includes('720') || q.includes('hd') || 
           q.includes('fullhd') || q.includes('high') || q.includes('original');
  });
}

/**
 * Find SD video format
 */
function findSdVideo(videos: VideoFormat[]): VideoFormat | undefined {
  return videos.find(f => {
    const q = f.quality.toLowerCase();
    return q.includes('480') || q.includes('360') || q.includes('sd') || 
           q.includes('low') || q.includes('medium');
  });
}

/**
 * Deduplicate images - keep only highest quality per itemId
 */
function deduplicateImages(images: VideoFormat[]): VideoFormat[] {
  const qualityPriority: Record<string, number> = {
    '4k': 100,
    'orig': 90,
    'original': 90,
    '4096': 85,
    '2048': 80,
    'large': 70,
    'medium': 50,
    'small': 30,
    'thumb': 10,
  };
  
  const getQualityScore = (quality: string): number => {
    const q = quality.toLowerCase();
    for (const [key, score] of Object.entries(qualityPriority)) {
      if (q.includes(key)) return score;
    }
    const match = q.match(/(\d{3,4})/);
    if (match) return parseInt(match[1]) / 10;
    return 50;
  };
  
  const byItemId = new Map<string, VideoFormat>();
  
  for (const img of images) {
    const itemId = img.itemId || img.url;
    const existing = byItemId.get(itemId);
    
    if (!existing) {
      byItemId.set(itemId, img);
    } else if (getQualityScore(img.quality) > getQualityScore(existing.quality)) {
      byItemId.set(itemId, img);
    }
  }
  
  return Array.from(byItemId.values());
}

// ============================================================================
// FETCH WITH RETRY (USING PROXY FOR CDN)
// ============================================================================

import { API_BASE_URL } from '../config';

/**
 * Build proxy URL for CDN media
 * Uses internal proxy API to bypass geo-restrictions and handle expired URLs
 */
function buildProxyUrl(url: string, platform?: string): string {
  const proxyUrl = new URL(`${API_BASE_URL}/api/v1/proxy`);
  proxyUrl.searchParams.set('url', url);
  if (platform) proxyUrl.searchParams.set('platform', platform);
  proxyUrl.searchParams.set('inline', '1');
  return proxyUrl.toString();
}

/**
 * Fetch URL with retry logic and exponential backoff
 * Uses proxy API for CDN URLs to bypass geo-restrictions
 */
export async function fetchWithRetry(url: string, maxRetries = MAX_RETRY_ATTEMPTS, platform?: string): Promise<Buffer> {
  // Use proxy for CDN URLs
  const shouldProxy = needsDownloadFirst(url);
  const fetchUrl = shouldProxy ? buildProxyUrl(url, platform) : url;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.media(`Fetch attempt ${attempt}/${maxRetries}${shouldProxy ? ' (via proxy)' : ''}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      
      const response = await fetch(fetchUrl, {
        headers: shouldProxy ? {} : {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://www.facebook.com/',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      log.media(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      return buffer;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      log.media(`Attempt ${attempt} failed: ${msg}`);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s
        const delay = 2000 * attempt;
        log.media(`Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw new Error(`All ${maxRetries} attempts failed: ${msg}`);
      }
    }
  }
  throw new Error('Retry logic error');
}

// ============================================================================
// SEND HELPERS (ctx or api based)
// ============================================================================

async function sendChatAction(
  options: SendMediaOptions,
  action: 'upload_video' | 'upload_photo'
): Promise<void> {
  try {
    if (options.ctx) {
      await options.ctx.replyWithChatAction(action);
    } else if (options.api) {
      await options.api.sendChatAction(options.chatId, action);
    }
  } catch (err) {
    // Silent fail for chat action - not critical
  }
}

async function sendVideo(
  options: SendMediaOptions,
  video: InputFile,
  caption?: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  const sendOptions = {
    caption: caption || undefined,
    parse_mode: 'Markdown' as const,
    reply_markup: keyboard,
  };
  
  if (options.ctx) {
    await options.ctx.replyWithVideo(video, sendOptions);
  } else if (options.api) {
    await options.api.sendVideo(options.chatId, video, sendOptions);
  }
}

async function sendPhoto(
  options: SendMediaOptions,
  photo: InputFile,
  caption?: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  const sendOptions = {
    caption: caption || undefined,
    parse_mode: 'Markdown' as const,
    reply_markup: keyboard,
  };
  
  if (options.ctx) {
    await options.ctx.replyWithPhoto(photo, sendOptions);
  } else if (options.api) {
    await options.api.sendPhoto(options.chatId, photo, sendOptions);
  }
}

async function sendMediaGroup(
  options: SendMediaOptions,
  mediaGroup: InputMediaPhoto[]
): Promise<void> {
  if (options.ctx) {
    await options.ctx.replyWithMediaGroup(mediaGroup);
  } else if (options.api) {
    await options.api.sendMediaGroup(options.chatId, mediaGroup);
  }
}

async function sendMessage(
  options: SendMediaOptions,
  text: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  const sendOptions = {
    parse_mode: 'Markdown' as const,
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  };
  
  if (options.ctx) {
    await options.ctx.reply(text, sendOptions);
  } else if (options.api) {
    await options.api.sendMessage(options.chatId, text, sendOptions);
  }
}

async function deleteMessage(options: SendMediaOptions, messageId: number): Promise<void> {
  try {
    if (options.ctx) {
      await options.ctx.api.deleteMessage(options.chatId, messageId);
    } else if (options.api) {
      await options.api.deleteMessage(options.chatId, messageId);
    }
  } catch (err) {
    // Silent fail for delete - not critical
  }
}

// ============================================================================
// VIDEO SENDING
// ============================================================================

/**
 * Send video with smart quality selection and fallback logic
 * 
 * Logic:
 * - If HD filesize ≤ 40MB → Download & send HD, show only [🔗 Original]
 * - If HD > 40MB but SD ≤ 40MB → Download & send SD, show [🎬 HD (link)] [🔗 Original]
 * - If both > 40MB → DON'T download, send direct link only
 */
async function sendVideoMedia(options: SendMediaOptions): Promise<SendMediaResult> {
  const { result, originalUrl, processingMsgId, lang = 'en' } = options;
  const platformName = getPlatformName(result.platform);
  const videos = (result.formats?.filter(f => f.type === 'video') || []) as VideoFormat[];
  
  if (videos.length === 0) {
    return { success: false, error: 'No video formats found' };
  }

  const hdVideo = findHdVideo(videos);
  const sdVideo = findSdVideo(videos) || (videos.length > 1 ? videos[videos.length - 1] : undefined);

  // Check filesize BEFORE downloading to prevent OOM
  const hdExceedsLimit = hdVideo?.filesize && hdVideo.filesize > MAX_TELEGRAM_FILESIZE;
  const sdExceedsLimit = sdVideo?.filesize && sdVideo.filesize > MAX_TELEGRAM_FILESIZE;
  const onlyVideoExceedsLimit = !hdVideo && !sdVideo && videos[0]?.filesize && videos[0].filesize > MAX_TELEGRAM_FILESIZE;
  
  const allExceedLimit = (hdExceedsLimit && (!sdVideo || sdExceedsLimit)) || onlyVideoExceedsLimit;
  
  // All formats exceed 40MB - send direct link WITHOUT downloading
  if (allExceedLimit) {
    log.media('All formats exceed 40MB limit, sending direct link only');
    
    if (processingMsgId) {
      await deleteMessage(options, processingMsgId);
    }
    
    const bestVideo = hdVideo || sdVideo || videos[0];
    const optimizedUrl = bestVideo.url.includes('fbcdn.net') ? optimizeCdnUrl(bestVideo.url) : bestVideo.url;
    const filesizeMB = bestVideo.filesize ? (bestVideo.filesize / 1024 / 1024).toFixed(0) : '?';
    
    const caption = lang === 'id'
      ? `📥 *${platformName}*\n\n` +
        `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
        `⚠️ Video terlalu besar (${filesizeMB}MB) untuk Telegram.\nKlik tombol untuk download langsung.`
      : `📥 *${platformName}*\n\n` +
        `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
        `⚠️ Video too large (${filesizeMB}MB) for Telegram.\nTap button to download directly.`;
    
    const keyboard = new InlineKeyboard()
      .url('▶️ ' + (lang === 'id' ? 'Download Video' : 'Download Video'), optimizedUrl)
      .url('🔗 Original', originalUrl);
    
    // Try to send with thumbnail
    if (result.thumbnail) {
      try {
        if (needsDownloadFirst(result.thumbnail)) {
          const thumbBuffer = await fetchWithRetry(result.thumbnail, MAX_RETRY_ATTEMPTS, result.platform);
          await sendPhoto(options, new InputFile(thumbBuffer, 'thumb.jpg'), caption, keyboard);
          return { success: true };
        } else {
          await sendPhoto(options, new InputFile({ url: result.thumbnail }), caption, keyboard);
          return { success: true };
        }
      } catch (err) {
        // Fall through to text message
      }
    }
    
    await sendMessage(options, caption, keyboard);
    return { success: true };
  }
  
  // Select video to send: SD fallback if HD exceeds limit
  const videoToSend = hdExceedsLimit && sdVideo ? sdVideo : (hdVideo || videos[0]);
  
  let caption = buildSimpleCaption(result, originalUrl);
  let keyboard: InlineKeyboard;
  
  // Get optimized video URL for HD+Sound button (direct CDN link has audio)
  const videoUrlForButton = videoToSend.url.includes('fbcdn.net') 
    ? optimizeCdnUrl(videoToSend.url) 
    : videoToSend.url;
  
  if (hdExceedsLimit && hdVideo) {
    // HD exceeds limit - sending SD as fallback
    const optimizedHdUrl = hdVideo.url.includes('fbcdn.net') ? optimizeCdnUrl(hdVideo.url) : hdVideo.url;
    keyboard = new InlineKeyboard()
      .url('🎬 HD', optimizedHdUrl)
      .url('🔗 Origin URL', originalUrl);
    if (caption) caption += '\n';
    caption += '⚠️ HD > 40MB';
  } else {
    // HD sent successfully - show HD+Sound link (direct CDN has audio) + Origin URL
    keyboard = new InlineKeyboard()
      .url('🔊 HD+Sound', videoUrlForButton)
      .url('🔗 Origin URL', originalUrl);
  }

  const videoUrl = videoToSend.url;
  let buffer: Buffer | null = null;

  try {
    if (needsDownloadFirst(videoUrl)) {
      const optimizedUrl = videoUrl.includes('fbcdn.net') ? optimizeCdnUrl(videoUrl) : videoUrl;
      
      const expectedSize = videoToSend.filesize ? (videoToSend.filesize / 1024 / 1024).toFixed(1) : '?';
      log.media(`Downloading ${videoToSend.quality} (~${expectedSize}MB) from CDN`);
      
      await sendChatAction(options, 'upload_video');
      
      buffer = await fetchWithRetry(optimizedUrl, MAX_RETRY_ATTEMPTS, result.platform);
      log.media('Uploading to Telegram...');
      
      await sendChatAction(options, 'upload_video');
      await sendVideo(options, new InputFile(buffer, 'video.mp4'), caption || undefined, keyboard);
    } else {
      await sendChatAction(options, 'upload_video');
      await sendVideo(options, new InputFile({ url: videoUrl }), caption || undefined, keyboard);
    }
    
    if (processingMsgId) {
      await deleteMessage(options, processingMsgId);
    }
    
    return { success: true };
  } catch (error) {
    logger.error('telegram', error, 'SEND_VIDEO');
    
    // Fallback: Send thumbnail with download buttons
    try {
      const fallbackCaption = lang === 'id'
        ? `📥 *${platformName}*\n\n` +
          `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
          `⚠️ Gagal mengirim video.`
        : `📥 *${platformName}*\n\n` +
          `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
          `⚠️ Failed to send video.`;
      
      const fallbackKeyboard = new InlineKeyboard()
        .url('▶️ ' + (lang === 'id' ? 'Tonton' : 'Watch'), videoToSend.url)
        .url('🔗 Original', originalUrl);
      
      if (result.thumbnail) {
        if (needsDownloadFirst(result.thumbnail)) {
          try {
            const thumbBuffer = await fetchWithRetry(result.thumbnail, MAX_RETRY_ATTEMPTS, result.platform);
            await sendPhoto(options, new InputFile(thumbBuffer, 'thumb.jpg'), fallbackCaption, fallbackKeyboard);
            if (processingMsgId) {
              await deleteMessage(options, processingMsgId).catch(() => {});
            }
            return { success: true };
          } catch (err) {
            // Fall through
          }
        } else {
          await sendPhoto(options, new InputFile({ url: result.thumbnail }), fallbackCaption, fallbackKeyboard);
          if (processingMsgId) {
            await deleteMessage(options, processingMsgId).catch(() => {});
          }
          return { success: true };
        }
      }
      
      await sendMessage(options, fallbackCaption, fallbackKeyboard);
      if (processingMsgId) {
        await deleteMessage(options, processingMsgId).catch(() => {});
      }
      return { success: true };
    } catch (fallbackError) {
      logger.error('telegram', fallbackError, 'SEND_VIDEO_FALLBACK');
      // Always cleanup processingMsgId on error
      if (processingMsgId) {
        await deleteMessage(options, processingMsgId).catch(() => {});
      }
      return { success: false, error: 'Failed to send video and fallback' };
    }
  } finally {
    // Buffer cleanup (help GC)
    buffer = null;
  }
}

// ============================================================================
// PHOTO SENDING
// ============================================================================

/**
 * Send single photo
 */
async function sendSinglePhotoMedia(options: SendMediaOptions): Promise<SendMediaResult> {
  const { result, originalUrl, processingMsgId } = options;
  const images = (result.formats?.filter(f => f.type === 'image') || []) as VideoFormat[];
  
  if (images.length === 0) {
    return { success: false, error: 'No image formats found' };
  }

  const bestImages = deduplicateImages(images);
  const caption = buildSimpleCaption(result, originalUrl);
  const keyboard = new InlineKeyboard().url('🔗 Origin URL', originalUrl);
  const photoUrl = bestImages[0].url;
  
  let buffer: Buffer | null = null;

  try {
    await sendChatAction(options, 'upload_photo');
    
    if (needsDownloadFirst(photoUrl)) {
      buffer = await fetchWithRetry(photoUrl, MAX_RETRY_ATTEMPTS, result.platform);
      await sendPhoto(options, new InputFile(buffer, 'photo.jpg'), caption || undefined, keyboard);
    } else {
      await sendPhoto(options, new InputFile({ url: photoUrl }), caption || undefined, keyboard);
    }
    
    if (processingMsgId) {
      await deleteMessage(options, processingMsgId);
    }
    
    return { success: true };
  } catch (error) {
    logger.error('telegram', error, 'SEND_PHOTO');
    return { success: false, error: 'Failed to send photo' };
  } finally {
    buffer = null;
  }
}

/**
 * Send multiple photos as album (media group)
 * Supports more than 10 images by splitting into multiple galleries
 */
async function sendPhotoAlbumMedia(options: SendMediaOptions): Promise<SendMediaResult> {
  const { result, originalUrl, processingMsgId, lang = 'en' } = options;
  const images = (result.formats?.filter(f => f.type === 'image') || []) as VideoFormat[];
  
  if (images.length === 0) {
    return { success: false, error: 'No image formats found' };
  }

  const bestImages = deduplicateImages(images);
  const caption = buildSimpleCaption(result, originalUrl);
  const requiresDownload = bestImages.some(img => needsDownloadFirst(img.url));
  
  const MAX_IMAGES_PER_GROUP = 10;
  const totalImages = bestImages.length;
  const totalGroups = Math.ceil(totalImages / MAX_IMAGES_PER_GROUP);
  
  const buffers: Buffer[] = [];

  try {
    await sendChatAction(options, 'upload_photo');
    
    // Split images into chunks of 10
    for (let groupIndex = 0; groupIndex < totalGroups; groupIndex++) {
      const startIdx = groupIndex * MAX_IMAGES_PER_GROUP;
      const endIdx = Math.min(startIdx + MAX_IMAGES_PER_GROUP, totalImages);
      const groupImages = bestImages.slice(startIdx, endIdx);
      const isFirstGroup = groupIndex === 0;
      const isLastGroup = groupIndex === totalGroups - 1;
      
      if (requiresDownload) {
        // Download images for this group
        const downloadPromises = groupImages.map(img => fetchWithRetry(img.url, MAX_RETRY_ATTEMPTS, result.platform));
        const downloadedBuffers = await Promise.all(downloadPromises);
        
        const mediaGroup: InputMediaPhoto[] = downloadedBuffers.map((buffer, index) => ({
          type: 'photo' as const,
          media: new InputFile(buffer, `photo_${startIdx + index}.jpg`),
          caption: isFirstGroup && index === 0 ? (caption || undefined) : undefined,
          parse_mode: isFirstGroup && index === 0 && caption ? 'Markdown' as const : undefined,
        }));
        
        await sendMediaGroup(options, mediaGroup);
      } else {
        // Use URLs directly
        const mediaGroup: InputMediaPhoto[] = groupImages.map((img, index) => ({
          type: 'photo' as const,
          media: img.url,
          caption: isFirstGroup && index === 0 ? (caption || undefined) : undefined,
          parse_mode: isFirstGroup && index === 0 && caption ? 'Markdown' as const : undefined,
        }));
        
        await sendMediaGroup(options, mediaGroup);
      }
      
      // Small delay between groups to avoid rate limiting
      if (!isLastGroup) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Send completion message with keyboard
    const completeMsg = totalGroups > 1
      ? (lang === 'id' ? `✅ Download selesai! (${totalImages} gambar)` : `✅ Download complete! (${totalImages} images)`)
      : (lang === 'id' ? '✅ Download selesai!' : '✅ Download complete!');
    const keyboard = new InlineKeyboard().url('🔗 Origin URL', originalUrl);
    await sendMessage(options, completeMsg, keyboard);
    
    if (processingMsgId) {
      await deleteMessage(options, processingMsgId);
    }
    
    return { success: true };
  } catch (error) {
    logger.error('telegram', error, 'SEND_ALBUM');
    
    // Fallback to single photo
    return sendSinglePhotoMedia(options);
  } finally {
    // Clear buffer references
    buffers.length = 0;
  }
}

// ============================================================================
// MAIN SEND FUNCTION
// ============================================================================

/**
 * Unified media sending function
 * 
 * Automatically detects content type and sends appropriately:
 * - Video: Smart quality selection with filesize validation
 * - Photo single: Direct send with fallback
 * - Photo album: Media group with fallback to single
 * 
 * Note: YouTube content should be handled separately (requires merge API)
 * 
 * @param options - Send media options
 * @returns Result with success status and optional error
 */
export async function sendMedia(options: SendMediaOptions): Promise<SendMediaResult> {
  const { result, ctx, api, chatId } = options;
  
  // Validate options
  if (!ctx && !api) {
    return { success: false, error: 'Either ctx or api must be provided' };
  }
  
  if (!chatId) {
    return { success: false, error: 'chatId is required' };
  }
  
  if (!result.success || !result.formats || result.formats.length === 0) {
    return { success: false, error: 'No media formats available' };
  }
  
  // Detect content type
  const contentType = detectContentType(result);
  
  log.media(`Content type: ${contentType}, Platform: ${result.platform}`);
  
  switch (contentType) {
    case 'youtube':
      // YouTube requires special handling (merge API) - not handled here
      return { success: false, error: 'YouTube content requires special handling' };
      
    case 'video':
      return sendVideoMedia(options);
      
    case 'photo_album':
      return sendPhotoAlbumMedia(options);
      
    case 'photo_single':
    default:
      return sendSinglePhotoMedia(options);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getPlatformName,
  needsDownloadFirst,
  findHdVideo,
  findSdVideo,
  deduplicateImages,
};

// Re-export escapeMarkdown from helpers for backward compatibility
export { escapeMarkdown } from '../helpers';
