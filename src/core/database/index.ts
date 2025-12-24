/**
 * Core Database Module
 * Centralized database access and services.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase clients
let supabase: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && anonKey) {
    supabase = createClient(url, anonKey);
}

if (url && serviceKey) {
    supabaseAdmin = createClient(url, serviceKey);
}

export { supabase, supabaseAdmin };

// Auth helpers
export async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase.auth.signUp({ email, password });
}

export async function signOut() {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase.auth.signOut();
}

export async function resetPassword(email: string) {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase.auth.resetPasswordForEmail(email);
}

export async function updatePassword(password: string) {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase.auth.updateUser({ password });
}

export async function getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
}

export async function getUser() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user;
}

export async function isAdmin(): Promise<boolean> {
    const user = await getUser();
    if (!user || !supabase) return false;
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
    return data?.role === 'admin';
}

// Analytics
export type Platform = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';
export type Quality = 'hd' | 'sd' | 'audio' | 'image';

export async function trackDownload(platform: Platform, quality: Quality, country?: string, source?: string) {
    const db = supabaseAdmin || supabase;
    if (!db) return;
    await db.from('downloads').insert({ platform, quality, country, source, created_at: new Date().toISOString() });
}

export async function trackError(platform: Platform, errorType: string, errorMessage: string) {
    const db = supabaseAdmin || supabase;
    if (!db) return;
    await db.from('errors').insert({ platform, error_type: errorType, error_message: errorMessage, created_at: new Date().toISOString() });
}

export async function getStats() {
    const db = supabase;
    if (!db) return null;
    const { data } = await db.from('downloads').select('*', { count: 'exact' });
    return { total: data?.length || 0 };
}

export async function getDownloadsByPlatform() {
    const db = supabase;
    if (!db) return {};
    const { data } = await db.from('downloads').select('platform');
    const counts: Record<string, number> = {};
    data?.forEach(d => { counts[d.platform] = (counts[d.platform] || 0) + 1; });
    return counts;
}

export async function getDownloadsByCountry() {
    const db = supabase;
    if (!db) return {};
    const { data } = await db.from('downloads').select('country');
    const counts: Record<string, number> = {};
    data?.forEach(d => { if (d.country) counts[d.country] = (counts[d.country] || 0) + 1; });
    return counts;
}

export async function getDownloadsBySource() {
    const db = supabase;
    if (!db) return {};
    const { data } = await db.from('downloads').select('source');
    const counts: Record<string, number> = {};
    data?.forEach(d => { if (d.source) counts[d.source] = (counts[d.source] || 0) + 1; });
    return counts;
}

export async function getSuccessRate() {
    return 0;
}

export async function getRecentErrors() {
    const db = supabase;
    if (!db) return [];
    const { data } = await db.from('errors').select('*').order('created_at', { ascending: false }).limit(10);
    return data || [];
}

export function getCountryFromHeaders(headers: Headers): string {
    return headers.get('cf-ipcountry') || headers.get('x-vercel-ip-country') || 'unknown';
}

// Config should be imported from @/core/config, not from here
