/**
 * Bot Format Utilities
 * Text formatting and sanitization for Telegram messages
 * 
 * @module bot/utils/format
 */

// ============================================================================
// TITLE SANITIZATION
// ============================================================================

/**
 * Sanitize title for Telegram display
 * - Removes hashtags (#word)
 * - Removes excessive whitespace
 * - Removes leading/trailing pipes and dots
 * - Truncates to maxLength with ellipsis
 * 
 * @param title - Raw title string
 * @param maxLength - Maximum length (default: 200)
 * @returns Sanitized title
 */
export function sanitizeTitle(title: string | undefined | null, maxLength: number = 200): string {
    if (!title) return '';
    
    let sanitized = title
        // Remove hashtags (including Unicode hashtags)
        .replace(/#[\w\u0080-\uFFFF]+/g, '')
        // Remove multiple spaces/newlines
        .replace(/\s+/g, ' ')
        // Remove leading/trailing pipes, dots, dashes, underscores
        .replace(/^[\s|.\-_]+|[\s|.\-_]+$/g, '')
        // Remove excessive punctuation at start/end
        .replace(/^[^\w\u0080-\uFFFF]+|[^\w\u0080-\uFFFF]+$/g, '')
        // Trim whitespace
        .trim();
    
    // Truncate if needed
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength - 1).trim() + '…';
    }
    
    return sanitized;
}

// ============================================================================
// RE-EXPORTS (for backward compatibility)
// ============================================================================

// escapeMarkdown is now in helpers/caption.ts - import from there
export { escapeMarkdown } from '../helpers';

export {
    sanitizeTitle as default,
};
