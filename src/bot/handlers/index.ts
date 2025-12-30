/**
 * Bot Handlers Exports
 * 
 * Usage:
 * ```typescript
 * import { registerUrlHandler, registerAllCallbacks } from '@/bot/handlers';
 * 
 * registerUrlHandler(bot);
 * registerAllCallbacks(bot);
 * ```
 */

import { Bot } from 'grammy';
import type { BotContext } from '../types';

// URL Handler
export { 
    registerUrlHandler, 
    botUrlExtract, 
    botUrlCallScraper,
    botUrlGetPlatformName,
} from './url';

// Menu Callbacks
export { 
    registerMenuCallbacks,
    botCallbackHowToUse,
    botCallbackContactAdmin,
    botCallbackHaveApiKey,
    botCallbackCancel,
    botCallbackBackToMenu,
    botCallbackMenuCommand,
} from './callback-menu';

// Download Callbacks
export {
    registerDownloadCallbacks,
    botCallbackDownloadQuality,
    botCallbackSendStrategy,
    botCallbackRetryDownload,
    findFormatByQuality,
} from './callback-download';

// Admin Callbacks
export {
    registerAdminCallbacks,
    botCallbackReportCookie,
} from './callback-admin';

// Stories Callbacks
export {
    registerStoriesCallbacks,
    botCallbackStory,
    buildStoryCaption,
    sendStoryMedia,
} from './callback-stories';

// YouTube Callbacks
export {
    registerYouTubeCallbacks,
    botCallbackYouTube,
    buildYouTubeCaption,
    callMergeApi,
} from './callback-youtube';

/**
 * Register all callback handlers
 * 
 * This is the recommended way to register all callback handlers at once.
 * It registers menu, download, admin, stories, and youtube callbacks.
 * 
 * Usage:
 * ```typescript
 * import { registerAllCallbacks } from '@/bot/handlers';
 * registerAllCallbacks(bot);
 * ```
 */
export function registerAllCallbacks(bot: Bot<BotContext>): void {
    const { registerMenuCallbacks } = require('./callback-menu');
    const { registerDownloadCallbacks } = require('./callback-download');
    const { registerAdminCallbacks } = require('./callback-admin');
    const { registerStoriesCallbacks } = require('./callback-stories');
    const { registerYouTubeCallbacks } = require('./callback-youtube');
    
    registerMenuCallbacks(bot);
    registerDownloadCallbacks(bot);
    registerAdminCallbacks(bot);
    registerStoriesCallbacks(bot);
    registerYouTubeCallbacks(bot);
}
