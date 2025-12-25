/**
 * /menu command - Shows main menu with language support
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { t, detectLanguage, type BotLanguage } from '../i18n';

export const menuComposer = new Composer<BotContext>();

function buildMenuKeyboard(lang: BotLanguage): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('btn_mystatus', lang), 'cmd:mystatus')
        .text(t('btn_history', lang), 'cmd:history')
        .row()
        .text(t('btn_premium', lang), 'cmd:premium')
        .text(t('btn_privacy', lang), 'cmd:privacy')
        .row()
        .url(t('btn_website', lang), 'https://downaria.vercel.app')
        .text(t('btn_help', lang), 'cmd:help');
}

menuComposer.command('menu', async (ctx) => {
    const lang = detectLanguage(ctx.from?.language_code);
    
    await ctx.reply(t('menu_title', lang), {
        parse_mode: 'Markdown',
        reply_markup: buildMenuKeyboard(lang),
    });
});
