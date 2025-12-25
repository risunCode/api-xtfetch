/**
 * /privacy command - Shows privacy policy with language support
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { t, detectLanguage, type BotLanguage } from '../i18n';

export const privacyComposer = new Composer<BotContext>();

function buildPrivacyKeyboard(lang: BotLanguage): InlineKeyboard {
    return new InlineKeyboard()
        .url(t('btn_website', lang), 'https://downaria.vercel.app')
        .text(t('btn_menu', lang), 'cmd:menu');
}

privacyComposer.command('privacy', async (ctx) => {
    const lang = detectLanguage(ctx.from?.language_code);
    
    await ctx.reply(t('privacy_title', lang), {
        parse_mode: 'Markdown',
        reply_markup: buildPrivacyKeyboard(lang),
    });
});
