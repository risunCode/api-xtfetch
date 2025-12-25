/**
 * /help command - Shows usage guide with language support
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { t, detectLanguage, type BotLanguage } from '../i18n';

const helpComposer = new Composer<Context>();

function buildHelpKeyboard(lang: BotLanguage): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('btn_menu', lang), 'cmd:menu')
        .text(t('btn_premium', lang), 'cmd:premium')
        .row()
        .url(t('btn_website', lang), 'https://downaria.vercel.app');
}

helpComposer.command('help', async (ctx) => {
    const lang = detectLanguage(ctx.from?.language_code);
    
    await ctx.reply(t('help_title', lang), {
        parse_mode: 'Markdown',
        reply_markup: buildHelpKeyboard(lang),
    });
});

// Handle inline button callback for help
helpComposer.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = detectLanguage(ctx.from?.language_code);
    
    await ctx.reply(t('help_title', lang), {
        parse_mode: 'Markdown',
        reply_markup: buildHelpKeyboard(lang),
    });
});

export { helpComposer };
