/**
 * Caption & Markdown Utilities
 * Single source of truth for escapeMarkdown and caption building
 */

/**
 * Escape Telegram Markdown special characters
 * Works for both Markdown and MarkdownV2 parse modes
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

/**
 * Build simple caption with author only
 * Used for non-YouTube platforms (cleaner embed)
 * 
 * @param author - Author/username string
 * @param platform - Platform name (twitter, instagram, tiktok, etc)
 */
export function buildSimpleCaption(
  author?: string,
  platform?: string
): string {
  if (!author) return '';
  
  const needsAt = ['twitter', 'instagram', 'tiktok'].includes(platform || '');
  const prefix = needsAt && !author.startsWith('@') ? '@' : '';
  return `${prefix}${escapeMarkdown(author)}`;
}

/**
 * Build simple caption from DownloadResult
 * Wrapper for buildSimpleCaption that extracts author/platform from result
 */
export function buildSimpleCaptionFromResult(
  result: { author?: string; platform?: string },
  _originalUrl?: string // kept for API compatibility
): string {
  return buildSimpleCaption(result.author, result.platform);
}

/**
 * Sanitize title - removes hashtags, cleans special chars, truncates
 */
export function sanitizeTitle(title: string, maxLength = 200): string {
  if (!title) return '';
  
  return title
    .replace(/#\w+/g, '') // Remove hashtags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, maxLength);
}
