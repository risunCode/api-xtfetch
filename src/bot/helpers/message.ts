import { BotContext } from '../types';

export async function safeDeleteMessage(ctx: BotContext, msgId?: number): Promise<boolean> {
  if (!msgId || !ctx.chat) return false;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, msgId);
    return true;
  } catch {
    return false;
  }
}

export async function safeEditMessage(
  ctx: BotContext, 
  msgId: number, 
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
): Promise<boolean> {
  if (!ctx.chat) return false;
  try {
    await ctx.api.editMessageText(ctx.chat.id, msgId, text, { parse_mode: parseMode });
    return true;
  } catch {
    return false;
  }
}

export async function safeAnswerCallback(ctx: BotContext, text?: string): Promise<boolean> {
  try {
    await ctx.answerCallbackQuery({ text });
    return true;
  } catch {
    return false;
  }
}
