/**
 * Bot Handlers Exports
 * 
 * Usage:
 * ```typescript
 * import { registerUrlHandler, registerCallbackHandler } from '@/bot/handlers';
 * 
 * registerUrlHandler(bot);
 * registerCallbackHandler(bot);
 * ```
 */

export { 
    registerUrlHandler, 
    botUrlExtract, 
    botUrlCallScraper,
    botUrlGetPlatformEmoji,
    botUrlGetPlatformName,
} from './url';

export { 
    registerCallbackHandler,
    botCallbackParse,
    botCallbackHowToUse,
    botCallbackContactAdmin,
    botCallbackHaveApiKey,
    botCallbackRetryDownload,
    botCallbackCancel,
    botCallbackBackToMenu,
} from './callback';
