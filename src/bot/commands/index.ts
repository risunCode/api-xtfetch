/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMANDS - Barrel Export
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Exports all command composers for the Telegram bot.
 * 
 * Commands:
 * - /start - Welcome message
 * - /status - User status (merged from /mystatus)
 * - /help - Help with privacy section (merged from /privacy)
 * - /donate - VIP vs VVIP comparison
 * - /history - Download history
 * - /menu - Main menu
 * - /stop - Delete user data (GDPR)
 * 
 * @module bot/commands
 */

// Command composers
export { startComposer, botUserRegister, botUserGetTodayStats } from './start';
export { helpComposer } from './help';
export { statusComposer } from './status';
export { historyComposer, botDownloadGetHistory } from './history';
export { donateComposer, botUserLinkApiKey, botUserHasPremium, botUserHasDonatorStatus } from './donate';
export { menuComposer } from './menu';
export { stopComposer, deleteUserData } from './stop';
