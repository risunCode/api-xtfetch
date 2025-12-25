/**
 * Bot User Service
 * CRUD operations for Telegram bot users
 * Uses botUser* naming convention
 */

import { supabaseAdmin } from '@/lib/database';

// ============================================================================
// Types
// ============================================================================

export interface BotUser {
  id: number;  // Telegram user ID (BIGINT)
  username: string | null;
  first_name: string | null;
  language_code: string;
  is_banned: boolean;
  api_key_id: string | null;
  daily_downloads: number;
  total_downloads: number;
  last_download_at: string | null;
  daily_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface BotUserCreateInput {
  id: number;  // Telegram user ID
  username?: string | null;
  first_name?: string | null;
  language_code?: string;
}

export interface BotUserUpdateInput {
  username?: string | null;
  first_name?: string | null;
  language_code?: string;
  is_premium?: boolean;
  api_key_id?: string | null;
  daily_downloads?: number;
  total_downloads?: number;
  last_download_at?: string | null;
  daily_reset_at?: string;
}

// ============================================================================
// User CRUD Operations
// ============================================================================

/**
 * Create a new bot user
 */
export async function botUserCreate(
  telegramId: number,
  username?: string | null,
  firstName?: string | null,
  langCode: string = 'en'
): Promise<{ data: BotUser | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_users')
      .insert({
        id: telegramId,
        username: username || null,
        first_name: firstName || null,
        language_code: langCode,
        is_banned: false,
        daily_downloads: 0,
        total_downloads: 0,
        daily_reset_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (user already exists)
      if (error.code === '23505') {
        return { data: null, error: 'User already exists' };
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Get a bot user by Telegram ID
 */
export async function botUserGet(
  telegramId: number
): Promise<{ data: BotUser | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_users')
      .select('*')
      .eq('id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Update a bot user
 */
export async function botUserUpdate(
  telegramId: number,
  updateData: BotUserUpdateInput
): Promise<{ data: BotUser | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_users')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', telegramId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Get or create a bot user (upsert pattern)
 */
export async function botUserGetOrCreate(
  telegramId: number,
  username?: string | null,
  firstName?: string | null,
  langCode: string = 'en'
): Promise<{ data: BotUser | null; error: string | null; isNew: boolean }> {
  // Try to get existing user first
  const { data: existingUser, error: getError } = await botUserGet(telegramId);

  if (getError) {
    return { data: null, error: getError, isNew: false };
  }

  if (existingUser) {
    // Update user info if changed
    if (
      existingUser.username !== username ||
      existingUser.first_name !== firstName ||
      existingUser.language_code !== langCode
    ) {
      const { data: updatedUser, error: updateError } = await botUserUpdate(telegramId, {
        username,
        first_name: firstName,
        language_code: langCode,
      });

      if (updateError) {
        // Return existing user even if update fails
        return { data: existingUser, error: null, isNew: false };
      }

      return { data: updatedUser, error: null, isNew: false };
    }

    return { data: existingUser, error: null, isNew: false };
  }

  // Create new user
  const { data: newUser, error: createError } = await botUserCreate(
    telegramId,
    username,
    firstName,
    langCode
  );

  if (createError) {
    return { data: null, error: createError, isNew: false };
  }

  return { data: newUser, error: null, isNew: true };
}

// ============================================================================
// API Key Linking
// ============================================================================

/**
 * Link an API key to a bot user (enables premium features)
 */
export async function botUserLinkApiKey(
  telegramId: number,
  apiKeyId: string
): Promise<{ data: BotUser | null; error: string | null }> {
  return botUserUpdate(telegramId, {
    api_key_id: apiKeyId,
    is_premium: true,
  });
}

/**
 * Unlink API key from a bot user (reverts to free tier)
 */
export async function botUserUnlinkApiKey(
  telegramId: number
): Promise<{ data: BotUser | null; error: string | null }> {
  return botUserUpdate(telegramId, {
    api_key_id: null,
    is_premium: false,
  });
}

// ============================================================================
// Download Tracking
// ============================================================================

/**
 * Increment download count for a user
 */
export async function botUserIncrementDownloads(
  telegramId: number
): Promise<{ data: BotUser | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    // First get current user to check daily reset
    const { data: user, error: getError } = await botUserGet(telegramId);

    if (getError || !user) {
      return { data: null, error: getError || 'User not found' };
    }

    // Check if daily reset is needed
    const resetDate = new Date(user.daily_reset_at);
    const now = new Date();
    const needsReset = resetDate.toDateString() !== now.toDateString();

    // Update with increment
    const updateData: Record<string, unknown> = {
        daily_downloads: needsReset ? 1 : user.daily_downloads + 1,
        daily_reset_at: needsReset ? now.toISOString() : user.daily_reset_at,
        updated_at: now.toISOString(),
    };
    
    // Only update total_downloads if column exists (graceful handling)
    if ('total_downloads' in user) {
        updateData.total_downloads = (user.total_downloads || 0) + 1;
    }

    const { data, error } = await supabaseAdmin
      .from('bot_users')
      .update(updateData)
      .eq('id', telegramId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Reset daily download count for a user
 */
export async function botUserResetDailyDownloads(
  telegramId: number
): Promise<{ data: BotUser | null; error: string | null }> {
  return botUserUpdate(telegramId, {
    daily_downloads: 0,
    daily_reset_at: new Date().toISOString(),
  });
}

/**
 * Check if user needs daily reset (call at start of each interaction)
 */
export async function botUserCheckDailyReset(
  telegramId: number
): Promise<{ data: BotUser | null; error: string | null; wasReset: boolean }> {
  const { data: user, error } = await botUserGet(telegramId);

  if (error || !user) {
    return { data: null, error: error || 'User not found', wasReset: false };
  }

  const resetDate = new Date(user.daily_reset_at);
  const now = new Date();

  // Check if it's a new day
  if (resetDate.toDateString() !== now.toDateString()) {
    const { data: updatedUser, error: updateError } = await botUserResetDailyDownloads(telegramId);
    return { data: updatedUser, error: updateError, wasReset: true };
  }

  return { data: user, error: null, wasReset: false };
}

// ============================================================================
// Stats & Queries
// ============================================================================

/**
 * Get user download stats
 */
export async function botUserGetStats(telegramId: number): Promise<{
  dailyDownloads: number;
  totalDownloads: number;
  isPremium: boolean;
  lastDownloadAt: string | null;
} | null> {
  const { data: user, error } = await botUserGet(telegramId);

  if (error || !user) {
    return null;
  }

  return {
    dailyDownloads: user.daily_downloads,
    totalDownloads: user.total_downloads,
    isPremium: !!user.api_key_id,  // Premium if has API key
    lastDownloadAt: user.last_download_at,
  };
}

/**
 * Get remaining daily downloads for a user
 */
export async function botUserGetRemainingDownloads(
  telegramId: number,
  dailyLimit: number
): Promise<{ remaining: number; isPremium: boolean } | null> {
  // Check and reset if needed
  const { data: user, error } = await botUserCheckDailyReset(telegramId);

  if (error || !user) {
    return null;
  }

  // Premium users have unlimited downloads
  if (user.api_key_id) {
    return { remaining: -1, isPremium: true }; // -1 indicates unlimited
  }

  return {
    remaining: Math.max(0, dailyLimit - user.daily_downloads),
    isPremium: false,
  };
}
