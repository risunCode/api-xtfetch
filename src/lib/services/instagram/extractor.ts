/**
 * Instagram Media Extractor
 * Single source of truth for parsing media from Instagram responses
 * 
 * Handles extraction from:
 * - GraphQL API responses (posts, reels, TV)
 * - Embed page HTML
 * - Story API responses
 */

import { MediaFormat } from '@/lib/types';
import { utilAddFormat, utilDecodeUrl } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GraphQLMedia {
    __typename: string;
    id: string;
    shortcode: string;
    display_url: string;
    is_video: boolean;
    video_url?: string;
    owner?: { username: string; full_name?: string; id: string };
    edge_media_to_caption?: { edges: Array<{ node: { text: string } }> };
    edge_sidecar_to_children?: { edges: Array<{ node: GraphQLMediaNode }> };
    display_resources?: Array<{ src: string; config_width: number }>;
    taken_at_timestamp?: number;
    edge_media_preview_like?: { count: number };
    edge_media_to_comment?: { count: number };
    video_view_count?: number;
}

export interface GraphQLMediaNode {
    id: string;
    is_video: boolean;
    video_url?: string;
    display_url: string;
    display_resources?: Array<{ src: string; config_width: number }>;
}

export interface StoryItem {
    pk: string;
    media_type: number;
    video_versions?: Array<{ url: string; width: number }>;
    image_versions2?: { candidates: Array<{ url: string; width: number }> };
}

export type EngagementStats = {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHQL EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface GraphQLExtractionResult {
    formats: MediaFormat[];
    thumbnail: string;
    metadata: {
        author: string;
        authorName: string;
        caption: string;
        postedAt?: string;
        engagement?: EngagementStats;
    };
}

/**
 * Extract media from GraphQL API response
 */
export function extractFromGraphQL(media: GraphQLMedia, shortcode: string): GraphQLExtractionResult {
    const formats: MediaFormat[] = [];
    const author = media.owner?.username || '';
    const authorName = media.owner?.full_name || '';
    const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';
    let thumbnail = media.display_url || '';

    const postedAt = media.taken_at_timestamp
        ? new Date(media.taken_at_timestamp * 1000).toISOString()
        : undefined;

    const engagement: EngagementStats = {
        likes: media.edge_media_preview_like?.count || 0,
        comments: media.edge_media_to_comment?.count || 0,
        views: media.video_view_count || 0,
    };

    // Handle carousel (sidecar) posts
    if (media.edge_sidecar_to_children?.edges) {
        media.edge_sidecar_to_children.edges.forEach((edge, i) => {
            const node = edge.node;
            const itemId = node.id || `slide-${i}`;

            if (node.is_video && node.video_url) {
                utilAddFormat(formats, `Video ${i + 1}`, 'video', node.video_url, {
                    itemId,
                    thumbnail: node.display_url,
                    filename: `${author}_slide_${i + 1}`,
                });
            } else {
                const bestUrl = getBestImageUrl(node.display_resources, node.display_url);
                utilAddFormat(formats, `Image ${i + 1}`, 'image', bestUrl, {
                    itemId,
                    thumbnail: node.display_url,
                    filename: `${author}_slide_${i + 1}`,
                });
            }
        });

        // Set thumbnail from first slide if not already set
        if (!thumbnail && media.edge_sidecar_to_children.edges[0]?.node?.display_url) {
            thumbnail = media.edge_sidecar_to_children.edges[0].node.display_url;
        }
    }
    // Handle single video
    else if (media.is_video && media.video_url) {
        utilAddFormat(formats, 'Video', 'video', media.video_url, {
            itemId: media.id,
            thumbnail: media.display_url,
        });
    }
    // Handle single image
    else if (media.display_url) {
        const bestUrl = getBestImageUrl(media.display_resources, media.display_url);
        utilAddFormat(formats, 'Original', 'image', bestUrl, {
            itemId: media.id,
            thumbnail: media.display_url,
        });
    }

    return {
        formats,
        thumbnail,
        metadata: {
            author,
            authorName,
            caption,
            postedAt,
            engagement: (engagement.likes || engagement.comments || engagement.views) ? engagement : undefined,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBED EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmbedExtractionResult {
    formats: MediaFormat[];
    thumbnail: string;
    author: string;
}

/**
 * Extract media from embed page HTML
 */
export function extractFromEmbed(html: string): EmbedExtractionResult {
    const formats: MediaFormat[] = [];
    let thumbnail = '';

    // Extract video URL
    const videoMatch = html.match(/"video_url":"([^"]+)"/);
    if (videoMatch) {
        utilAddFormat(formats, 'Video', 'video', utilDecodeUrl(videoMatch[1]), {
            itemId: 'video-main',
        });
    }

    // Extract display image URL
    const imgMatch = html.match(/"display_url":"([^"]+)"/);
    if (imgMatch) {
        thumbnail = utilDecodeUrl(imgMatch[1]);
        // Only add as format if no video found
        if (!formats.length) {
            utilAddFormat(formats, 'Original', 'image', thumbnail, {
                itemId: 'image-main',
                thumbnail,
            });
        }
    }

    // Extract author
    const authorMatch = html.match(/"owner":\{"username":"([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : '';

    return {
        formats,
        thumbnail,
        author,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface StoryExtractionResult {
    formats: MediaFormat[];
    thumbnail: string;
}

/**
 * Extract media from a single story item
 */
export function extractFromStory(item: StoryItem): StoryExtractionResult {
    const formats: MediaFormat[] = [];
    let thumbnail = '';

    // Video story (media_type === 2)
    if (item.media_type === 2 && item.video_versions?.length) {
        const sorted = [...item.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
        if (sorted[0]?.url) {
            utilAddFormat(formats, 'HD Video', 'video', sorted[0].url, {
                itemId: `story-${item.pk}`,
            });
        }
        // Get thumbnail from image versions
        if (item.image_versions2?.candidates?.length) {
            thumbnail = item.image_versions2.candidates[0].url;
        }
    }
    // Image story
    else if (item.image_versions2?.candidates?.length) {
        const sorted = [...item.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
        if (sorted[0]?.url) {
            thumbnail = sorted[0].url;
            utilAddFormat(formats, 'Original', 'image', sorted[0].url, {
                itemId: `story-${item.pk}`,
                thumbnail,
            });
        }
    }

    return { formats, thumbnail };
}

/**
 * Extract media from multiple story items
 * Returns formats for all stories with the target story first
 */
export function extractFromStories(
    items: StoryItem[],
    targetStoryId?: string
): StoryExtractionResult {
    const formats: MediaFormat[] = [];
    let thumbnail = '';

    // Find target item or use first
    const targetItem = targetStoryId
        ? items.find(item => item.pk === targetStoryId) || items[0]
        : items[0];

    if (!targetItem) {
        return { formats: [], thumbnail: '' };
    }

    // Extract target story first
    const targetResult = extractFromStory(targetItem);
    formats.push(...targetResult.formats);
    thumbnail = targetResult.thumbnail;

    // Extract remaining stories
    if (items.length > 1) {
        items.forEach((item, idx) => {
            if (item.pk === targetItem.pk) return;

            if (item.media_type === 2 && item.video_versions?.length) {
                const sorted = [...item.video_versions].sort((a, b) => (b.width || 0) - (a.width || 0));
                if (sorted[0]?.url) {
                    utilAddFormat(formats, `Story ${idx + 1} (Video)`, 'video', sorted[0].url, {
                        itemId: `story-${item.pk}`,
                        thumbnail: item.image_versions2?.candidates?.[0]?.url,
                    });
                }
            } else if (item.image_versions2?.candidates?.length) {
                const sorted = [...item.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
                if (sorted[0]?.url) {
                    utilAddFormat(formats, `Story ${idx + 1} (Image)`, 'image', sorted[0].url, {
                        itemId: `story-${item.pk}`,
                        thumbnail: sorted[0].url,
                    });
                }
            }
        });
    }

    return { formats, thumbnail };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the best quality image URL from display_resources
 */
function getBestImageUrl(
    displayResources: Array<{ src: string; config_width: number }> | undefined,
    fallbackUrl: string
): string {
    if (displayResources?.length) {
        return displayResources[displayResources.length - 1].src;
    }
    return fallbackUrl;
}

/**
 * Determine content type from formats
 */
export function getContentType(formats: MediaFormat[]): 'video' | 'image' | 'mixed' {
    const hasVideo = formats.some(f => f.type === 'video');
    const isCarousel = formats.length > 1;
    return isCarousel ? 'mixed' : (hasVideo ? 'video' : 'image');
}

/**
 * Generate title from caption
 */
export function generateTitle(caption: string, fallback = 'Instagram Post'): string {
    if (!caption) return fallback;
    return caption.length > 80 ? caption.substring(0, 80) + '...' : caption;
}
