/**
 * YouTube Scraper
 */
export { scrapeYouTube, isYouTubeUrl, extractYouTubeId } from './scraper';

/**
 * YouTube Extractor
 */
export {
    extractFormats,
    extractMetadata,
    type YtDlpFormat,
    type YtDlpOutput,
    type ExtractedMetadata,
} from './extractor';

/**
 * YouTube Storage
 */
export {
    // Types
    type YouTubeFormat,
    type YouTubeSession,
    type PreparedDownload,
    // Config
    YOUTUBE_DOWNLOAD_BASE,
    SESSION_EXPIRY_MS,
    DOWNLOAD_EXPIRY_MS,
    // Session functions
    ytSessionHash,
    ytSessionGet,
    ytSessionSet,
    ytSessionDelete,
    // Download functions
    ytDownloadGet,
    ytDownloadSet,
    ytDownloadDelete,
    // Cleanup functions
    ytCleanupExpired,
    ytEnsureDownloadDir,
    // Helpers
    extractVideoId,
    formatBytes,
    qualityToHeight,
} from './storage';
