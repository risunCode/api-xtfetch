/**
 * Common regex patterns for URL parsing across all platform scrapers
 */

export const PATTERNS = {
  twitter: {
    tweetId: /\/status(?:es)?\/(\d+)/,
    username: /(?:twitter|x)\.com\/(\w+)/,
  },
  instagram: {
    shortcode: /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    storyInfo: /\/stories\/([^/]+)\/(\d+)/,
    username: /instagram\.com\/([^/?]+)/,
  },
  youtube: {
    videoId: /(?:v=|\/|youtu\.be\/)([\w-]{11})(?:\?|&|$|\/)/,
  },
  tiktok: {
    videoId: /\/video\/(\d+)/,
    username: /@([^/?]+)/,
  },
};
