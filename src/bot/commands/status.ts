/**
 * /status command - Shows user status with tier info
 * Merged from /mystatus
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext, BotUser } from '../types';
import { UserTier, getUserTier } from '../types';
import { TIER_LIMITS, formatTierDisplay } from '../config';
import { supabaseAdmin } from '@/lib/database/supabase';
import { getUserLanguage } from '../helpers';

const statusComposer = new Composer<BotContext>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getApiKeyInfo(apiKeyId: string) {
  const db = supabaseAdmin;
  if (!db) return null;
  
  const { data } = await db
    .from('api_keys')
    .select('key_preview, total_requests, rate_limit, expires_at, enabled, success_count, name')
    .eq('id', apiKeyId)
    .single();
  
  return data;
}

export async function botUserGetPremiumStatus(telegramId: number): Promise<{
  user: BotUser | null;
  apiKey: {
    key_preview: string;
    total_requests: number;
    rate_limit: number;
    expires_at: string | null;
    enabled: boolean;
    success_count: number;
    name: string | null;
  } | null;
}> {
  const db = supabaseAdmin;
  if (!db) return { user: null, apiKey: null };
  
  const { data: user } = await db
    .from('bot_users')
    .select('*')
    .eq('id', telegramId)
    .single();
  
  if (!user || !user.api_key_id) {
    return { user: user as BotUser | null, apiKey: null };
  }
  
  const apiKey = await getApiKeyInfo(user.api_key_id);
  return { user: user as BotUser, apiKey };
}

export async function botUserGetTotalDownloads(telegramId: number): Promise<number> {
  const db = supabaseAdmin;
  if (!db) return 0;
  
  const { data } = await db
    .from('bot_users')
    .select('total_downloads')
    .eq('id', telegramId)
    .single();
  
  return data?.total_downloads || 0;
}

/**
 * Build status message - single source of truth
 */
async function buildStatusMessage(user: BotUser, lang: 'id' | 'en'): Promise<string> {
  const tier = getUserTier(user);
  const tierConfig = TIER_LIMITS[tier];

  let msg = lang === 'id'
    ? `📊 *Status Kamu*\n\n👤 ${user.username ? '@' + user.username : user.first_name || 'User'}\n📅 Member sejak: ${new Date(user.created_at).toLocaleDateString()}\n\n`
    : `📊 *Your Status*\n\n👤 ${user.username ? '@' + user.username : user.first_name || 'User'}\n📅 Member since: ${new Date(user.created_at).toLocaleDateString()}\n\n`;

  msg += `── Tier ──\n${formatTierDisplay(tier)}\n`;

  if (tier === UserTier.FREE) {
    const cfg = tierConfig as typeof TIER_LIMITS[UserTier.FREE];
    msg += lang === 'id'
      ? `📥 Hari ini: ${user.daily_downloads}/${cfg.dailyLimit}\n⏳ Cooldown: ${cfg.cooldownSeconds}s\n`
      : `📥 Today: ${user.daily_downloads}/${cfg.dailyLimit}\n⏳ Cooldown: ${cfg.cooldownSeconds}s\n`;
  } else {
    const cfg = tierConfig as typeof TIER_LIMITS[UserTier.VIP];
    msg += lang === 'id'
      ? `📥 Rate: ${cfg.requestsPerWindow} req/${cfg.windowMinutes} menit\n`
      : `📥 Rate: ${cfg.requestsPerWindow} req/${cfg.windowMinutes} min\n`;
  }

  if (tier === UserTier.VVIP && user.api_key_id) {
    const apiKey = await getApiKeyInfo(user.api_key_id);
    if (apiKey) {
      msg += `\n── API Key ──\n`;
      msg += `🔑 \`${apiKey.key_preview}\`\n`;
      msg += `📊 ${apiKey.total_requests} requests\n`;
      if (apiKey.expires_at) {
        msg += `📅 ${new Date(apiKey.expires_at).toLocaleDateString()}\n`;
      }
      msg += `${apiKey.enabled ? '🟢' : '🔴'} ${apiKey.enabled ? 'Active' : 'Disabled'}\n`;
    }
  }

  msg += `\n── ${lang === 'id' ? 'Total' : 'Total'} ──\n`;
  msg += `📥 ${user.total_downloads} downloads\n`;

  return msg;
}

function buildStatusKeyboard(tier: UserTier): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('📜 History', 'history');
  
  if (tier === UserTier.FREE) {
    kb.text('⭐ Upgrade', 'cmd:donate');
  } else if (tier === UserTier.VIP) {
    kb.text('👑 Upgrade', 'cmd:donate');
  }
  
  return kb.row().text('« Menu', 'cmd:menu');
}

// ============================================================================
// HANDLERS
// ============================================================================

statusComposer.command('status', async (ctx) => {
  if (!ctx.botUser) {
    await ctx.reply('❌ /start first');
    return;
  }

  const lang = getUserLanguage(ctx);
  const message = await buildStatusMessage(ctx.botUser, lang);
  const keyboard = buildStatusKeyboard(getUserTier(ctx.botUser));

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Callbacks - all use same logic
const handleStatusCallback = async (ctx: BotContext) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.botUser) {
    await ctx.reply('❌ /start first');
    return;
  }

  const lang = getUserLanguage(ctx);
  const message = await buildStatusMessage(ctx.botUser, lang);
  const keyboard = buildStatusKeyboard(getUserTier(ctx.botUser));

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

statusComposer.callbackQuery('status', handleStatusCallback);
statusComposer.callbackQuery('cmd:status', handleStatusCallback);
statusComposer.callbackQuery('cmd:mystatus', handleStatusCallback);

export { statusComposer };
