import { BotContext } from '../types';

export function getUserLanguage(ctx: BotContext): 'en' | 'id' {
  return ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
}

export function detectLanguage(langCode?: string): 'en' | 'id' {
  return langCode?.startsWith('id') ? 'id' : 'en';
}
