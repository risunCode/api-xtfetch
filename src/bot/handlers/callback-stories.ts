/**
 * Stories Navigation Callback Handlers
 * Handles: story:* callbacks for Facebook/Instagram Stories
 * 
 * Callback patterns:
 * - story:{visitorId}:all - Download all stories
 * - story:{visitorId}:select - Open story selector/navigation
 * - story:{visitorId}:prev - Go to previous story
 * - story:{visitorId}:next - Go to next story
 * - story:{visitorId}:current - Download current story
 * - story:{visitorId}:dl:{index} - Download specific story by index
 * 
 * Session data required: ctx.session.pendingStories
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';
import { optimizeCdnUrl } from '@/lib/services/facebook/cdn';

import type { BotContext, PendingStories, StoryItem } from '../types';
import { buildStoriesNavKeyboard, buildStoriesMenuKeyboard } from '../keyboards';
import { botRateLimitRecordDownload } from '../middleware';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch media with retry for CDN URLs (Facebook, Instagram)
 */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Buffer> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Debug logging handled by log helper
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.facebook.com/',
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            
            if (attempt < maxRetries) {
                const delay = 2000 * attempt;
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw new Error(`All ${maxRetries} attempts failed: ${msg}`);
            }
        }
    }
    throw new Error('Retry logic error');
}

/**
 * Build story preview caption
 */
function buildStoryCaption(
    pending: PendingStories,
    currentIndex: number,
    lang: 'en' | 'id'
): string {
    const platformEmoji = pending.platform === 'facebook' ? '📘' : '📸';
    const platformName = pending.platform === 'facebook' ? 'Facebook' : 'Instagram';
    const story = pending.stories[currentIndex];
    const typeEmoji = story.type === 'video' ? '🎬' : '🖼️';
    
    return lang === 'id'
        ? `${platformEmoji} *${platformName} Stories*\n\n` +
          `👤 ${pending.author}\n` +
          `${typeEmoji} Story ${currentIndex + 1} dari ${pending.stories.length}`
        : `${platformEmoji} *${platformName} Stories*\n\n` +
          `👤 ${pending.author}\n` +
          `${typeEmoji} Story ${currentIndex + 1} of ${pending.stories.length}`;
}

/**
 * Send story media (video or image)
 */
async function sendStoryMedia(
    ctx: BotContext,
    story: StoryItem,
    caption: string,
    keyboard?: InlineKeyboard
): Promise<boolean> {
    const url = story.url.includes('fbcdn.net') ? optimizeCdnUrl(story.url) : story.url;
    const needsDownload = url.includes('fbcdn.net') || url.includes('cdninstagram.com');
    
    try {
        if (needsDownload) {
            const buffer = await fetchWithRetry(url);
            
            if (story.type === 'video') {
                await ctx.replyWithVideo(new InputFile(buffer, 'story.mp4'), {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            } else {
                await ctx.replyWithPhoto(new InputFile(buffer, 'story.jpg'), {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        } else {
            if (story.type === 'video') {
                await ctx.replyWithVideo(new InputFile({ url }), {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            } else {
                await ctx.replyWithPhoto(new InputFile({ url }), {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
            }
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_STORY_MEDIA');
        return false;
    }
}

/**
 * Update story preview message with new story
 */
async function updateStoryPreview(
    ctx: BotContext,
    pending: PendingStories,
    lang: 'en' | 'id'
): Promise<void> {
    const story = pending.stories[pending.currentIndex];
    const caption = buildStoryCaption(pending, pending.currentIndex, lang);
    const keyboard = buildStoriesNavKeyboard(
        pending.visitorId,
        pending.currentIndex,
        pending.stories.length
    );
    
    // Try to update with thumbnail
    const thumbUrl = story.thumbnail || story.url;
    const needsDownload = thumbUrl.includes('fbcdn.net') || thumbUrl.includes('cdninstagram.com');
    
    try {
        if (needsDownload) {
            // For CDN URLs, we need to delete and resend
            await ctx.deleteMessage();
            
            const buffer = await fetchWithRetry(thumbUrl);
            await ctx.replyWithPhoto(new InputFile(buffer, 'preview.jpg'), {
                caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            // Try to edit media
            await ctx.editMessageMedia({
                type: 'photo',
                media: thumbUrl,
                caption,
                parse_mode: 'Markdown',
            }, { reply_markup: keyboard });
        }
    } catch {
        // Fallback: edit caption only
        try {
            await ctx.editMessageCaption({
                caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } catch {
            // Last resort: send new message
            await ctx.reply(caption, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
    }
}

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

/**
 * Handle story callback
 * Pattern: story:{visitorId}:(all|select|prev|next|current|dl:{index})
 */
export async function botCallbackStory(
    ctx: BotContext,
    visitorId: string,
    action: string
): Promise<void> {
    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
    
    // Get pending stories from session
    const pending = ctx.session.pendingStories;
    
    if (!pending || pending.visitorId !== visitorId) {
        await ctx.answerCallbackQuery({
            text: lang === 'id'
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true,
        });
        return;
    }
    
    // Check session timeout (5 minutes)
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
        ctx.session.pendingStories = undefined;
        await ctx.answerCallbackQuery({
            text: lang === 'id'
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true,
        });
        return;
    }

    switch (action) {
        case 'all': {
            // Download all stories
            await ctx.answerCallbackQuery({
                text: lang === 'id'
                    ? `📥 Mendownload ${pending.stories.length} stories...`
                    : `📥 Downloading ${pending.stories.length} stories...`,
            });
            
            // Delete preview message
            try { await ctx.deleteMessage(); } catch {}
            
            // Send all stories
            let successCount = 0;
            for (let i = 0; i < pending.stories.length; i++) {
                const story = pending.stories[i];
                const caption = `${i + 1}/${pending.stories.length} • ${pending.author}`;
                
                const sent = await sendStoryMedia(ctx, story, caption);
                if (sent) {
                    successCount++;
                    await botRateLimitRecordDownload(ctx);
                }
                
                // Small delay between sends
                if (i < pending.stories.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            
            // Summary message
            const summaryMsg = lang === 'id'
                ? `✅ ${successCount}/${pending.stories.length} stories berhasil dikirim`
                : `✅ ${successCount}/${pending.stories.length} stories sent successfully`;
            
            await ctx.reply(summaryMsg);
            
            // Clear session
            ctx.session.pendingStories = undefined;
            break;
        }
        
        case 'select': {
            // Show story navigation UI
            await ctx.answerCallbackQuery();
            
            // Update message with navigation keyboard
            await updateStoryPreview(ctx, pending, lang);
            break;
        }
        
        case 'prev': {
            // Go to previous story
            if (pending.currentIndex <= 0) {
                await ctx.answerCallbackQuery({
                    text: lang === 'id' ? 'Sudah di story pertama' : 'Already at first story',
                });
                return;
            }
            
            pending.currentIndex--;
            ctx.session.pendingStories = pending;
            
            await ctx.answerCallbackQuery({
                text: `Story ${pending.currentIndex + 1}/${pending.stories.length}`,
            });
            
            await updateStoryPreview(ctx, pending, lang);
            break;
        }
        
        case 'next': {
            // Go to next story
            if (pending.currentIndex >= pending.stories.length - 1) {
                await ctx.answerCallbackQuery({
                    text: lang === 'id' ? 'Sudah di story terakhir' : 'Already at last story',
                });
                return;
            }
            
            pending.currentIndex++;
            ctx.session.pendingStories = pending;
            
            await ctx.answerCallbackQuery({
                text: `Story ${pending.currentIndex + 1}/${pending.stories.length}`,
            });
            
            await updateStoryPreview(ctx, pending, lang);
            break;
        }
        
        case 'current': {
            // Download current story
            const story = pending.stories[pending.currentIndex];
            
            await ctx.answerCallbackQuery({
                text: lang === 'id' ? '📥 Mendownload...' : '📥 Downloading...',
            });
            
            const caption = buildStoryCaption(pending, pending.currentIndex, lang) +
                '\n\n📥 via @DownAriaBot';
            
            const sent = await sendStoryMedia(ctx, story, caption);
            
            if (sent) {
                await botRateLimitRecordDownload(ctx);
            } else {
                await ctx.reply(
                    lang === 'id'
                        ? '❌ Gagal mengirim story. Coba lagi.'
                        : '❌ Failed to send story. Try again.'
                );
            }
            break;
        }
        
        default: {
            // Check for dl:{index} pattern
            if (action.startsWith('dl:')) {
                const indexStr = action.substring(3);
                const index = parseInt(indexStr, 10);
                
                if (isNaN(index) || index < 0 || index >= pending.stories.length) {
                    await ctx.answerCallbackQuery({
                        text: lang === 'id' ? '❌ Story tidak valid' : '❌ Invalid story',
                        show_alert: true,
                    });
                    return;
                }
                
                const story = pending.stories[index];
                
                await ctx.answerCallbackQuery({
                    text: lang === 'id' ? '📥 Mendownload...' : '📥 Downloading...',
                });
                
                const caption = buildStoryCaption(pending, index, lang) +
                    '\n\n📥 via @DownAriaBot';
                
                const sent = await sendStoryMedia(ctx, story, caption);
                
                if (sent) {
                    await botRateLimitRecordDownload(ctx);
                } else {
                    await ctx.reply(
                        lang === 'id'
                            ? '❌ Gagal mengirim story. Coba lagi.'
                            : '❌ Failed to send story. Try again.'
                    );
                }
            } else {
                await ctx.answerCallbackQuery({
                    text: '❌ Unknown action',
                    show_alert: true,
                });
            }
            break;
        }
    }
}

// ============================================================================
// MAIN HANDLER REGISTRATION
// ============================================================================

/**
 * Register stories callback handlers
 * 
 * Usage:
 * ```typescript
 * import { registerStoriesCallbacks } from '@/bot/handlers/callback-stories';
 * registerStoriesCallbacks(bot);
 * ```
 */
export function registerStoriesCallbacks(bot: Bot<BotContext>): void {
    // Stories callbacks: story:{visitorId}:{action}
    bot.callbackQuery(/^story:([^:]+):(.+)$/, async (ctx) => {
        const match = ctx.match;
        if (!match) return;

        const visitorId = match[1];
        const action = match[2];

        logger.debug('telegram', `Story callback: ${action} for ${visitorId}`);

        try {
            await botCallbackStory(ctx, visitorId, action);
        } catch (error) {
            logger.error('telegram', error, 'STORY_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    buildStoryCaption,
    sendStoryMedia,
    updateStoryPreview,
};
