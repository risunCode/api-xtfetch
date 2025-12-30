const SUPPORTED_DOMAINS = [
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'www.fb.watch', 'm.facebook.com',
  'weibo.com', 'www.weibo.com', 'weibo.cn', 'm.weibo.cn',
];

export function isValidSocialUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SUPPORTED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

export type PlatformId = 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'facebook' | 'weibo';

export function getPlatformFromUrl(url: string): PlatformId | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('instagram')) return 'instagram';
    if (hostname.includes('tiktok')) return 'tiktok';
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('facebook') || hostname.includes('fb.watch')) return 'facebook';
    if (hostname.includes('weibo')) return 'weibo';
    
    return null;
  } catch {
    return null;
  }
}

export function getPlatformEmoji(platform: PlatformId | string | null): string {
  const emojis: Record<string, string> = {
    youtube: '🎬',
    instagram: '📸',
    tiktok: '🎵',
    twitter: '🐦',
    facebook: '📘',
    weibo: '🔴',
  };
  return emojis[platform || ''] || '📥';
}

export function getPlatformName(platform: PlatformId | string | null): string {
  const names: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    twitter: 'Twitter/X',
    facebook: 'Facebook',
    weibo: 'Weibo',
  };
  return names[platform || ''] || 'Unknown';
}
