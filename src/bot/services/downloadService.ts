/**
 * Bot Download Service
 * Download history tracking for Telegram bot
 * Uses botDownload* naming convention
 */

import { supabaseAdmin } from '@/lib/database';
import { PlatformId } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

export type DownloadStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BotDownload {
  id: string;
  user_id: string;
  telegram_id: number;
  platform: PlatformId;
  url: string;
  title: string | null;
  status: DownloadStatus;
  is_premium: boolean;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BotDownloadCreateInput {
  user_id: string;
  telegram_id: number;
  platform: PlatformId;
  url: string;
  title?: string | null;
  status?: DownloadStatus;
  is_premium?: boolean;
  error_message?: string | null;
}

// ============================================================================
// Download CRUD Operations
// ============================================================================

/**
 * Create a new download record
 */
export async function botDownloadCreate(
  userId: string,
  telegramId: number,
  platform: PlatformId,
  url: string,
  title?: string | null,
  status: DownloadStatus = 'pending',
  isPremium: boolean = false
): Promise<{ data: BotDownload | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .insert({
        user_id: userId,
        telegram_id: telegramId,
        platform,
        url,
        title: title || null,
        status,
        is_premium: isPremium,
      })
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
 * Get download history for a user
 */
export async function botDownloadGetHistory(
  telegramId: number,
  limit: number = 10
): Promise<{ data: BotDownload[]; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: [], error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Update download status
 */
export async function botDownloadUpdateStatus(
  downloadId: string,
  status: DownloadStatus,
  errorMessage?: string | null
): Promise<{ data: BotDownload | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const updateData: Record<string, unknown> = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (status === 'failed' && errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .update(updateData)
      .eq('id', downloadId)
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
 * Update download title (after successful fetch)
 */
export async function botDownloadUpdateTitle(
  downloadId: string,
  title: string
): Promise<{ data: BotDownload | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .update({ title })
      .eq('id', downloadId)
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
 * Get download by ID
 */
export async function botDownloadGet(
  downloadId: string
): Promise<{ data: BotDownload | null; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: null, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .select('*')
      .eq('id', downloadId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ============================================================================
// Stats & Analytics
// ============================================================================

/**
 * Get download stats for a user
 */
export async function botDownloadGetUserStats(telegramId: number): Promise<{
  total: number;
  completed: number;
  failed: number;
  byPlatform: Record<PlatformId, number>;
} | null> {
  if (!supabaseAdmin) {
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .select('status, platform')
      .eq('telegram_id', telegramId);

    if (error || !data) {
      return null;
    }

    const stats = {
      total: data.length,
      completed: 0,
      failed: 0,
      byPlatform: {} as Record<PlatformId, number>,
    };

    for (const download of data) {
      if (download.status === 'completed') {
        stats.completed++;
      } else if (download.status === 'failed') {
        stats.failed++;
      }

      const platform = download.platform as PlatformId;
      stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;
    }

    return stats;
  } catch {
    return null;
  }
}

/**
 * Get recent downloads across all users (admin)
 */
export async function botDownloadGetRecent(
  limit: number = 50
): Promise<{ data: BotDownload[]; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: [], error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Get downloads by platform (admin analytics)
 */
export async function botDownloadGetByPlatform(
  platform: PlatformId,
  limit: number = 50
): Promise<{ data: BotDownload[]; error: string | null }> {
  if (!supabaseAdmin) {
    return { data: [], error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bot_downloads')
      .select('*')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Count downloads in a time period
 */
export async function botDownloadCountSince(
  since: Date,
  telegramId?: number
): Promise<{ count: number; error: string | null }> {
  if (!supabaseAdmin) {
    return { count: 0, error: 'Database not configured' };
  }

  try {
    let query = supabaseAdmin
      .from('bot_downloads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since.toISOString());

    if (telegramId) {
      query = query.eq('telegram_id', telegramId);
    }

    const { count, error } = await query;

    if (error) {
      return { count: 0, error: error.message };
    }

    return { count: count || 0, error: null };
  } catch (err) {
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
