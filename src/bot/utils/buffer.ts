/**
 * Buffer management utilities with proper cleanup for media fetching
 */

// ============================================================================
// Constants
// ============================================================================

export const MAX_TELEGRAM_FILESIZE = 50 * 1024 * 1024; // 50MB
export const DEFAULT_TIMEOUT = 25000; // 25s
export const DEFAULT_RETRIES = 3;

// CDN headers for Facebook/Instagram
const CDN_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'video',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
};

// ============================================================================
// Types
// ============================================================================

export interface FetchOptions {
  maxRetries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  onProgress?: (bytes: number) => void;
}

// ============================================================================
// Logging Helpers
// ============================================================================

function logInfo(message: string, ...args: unknown[]): void {
  console.log(`[Buffer] ${message}`, ...args);
}

function logError(message: string, ...args: unknown[]): void {
  console.error(`[Buffer] ${message}`, ...args);
}

function logDebug(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG) {
    console.debug(`[Buffer] ${message}`, ...args);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds (2s, 4s, 8s, ...)
 */
function getBackoffDelay(attempt: number): number {
  return Math.pow(2, attempt + 1) * 1000;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Suggest garbage collection if available
 */
export function suggestGC(): void {
  if (global.gc) {
    try {
      global.gc();
      logDebug('Garbage collection suggested');
    } catch {
      // GC not available or failed, ignore
    }
  }
}

// ============================================================================
// Core Fetch Functions
// ============================================================================

/**
 * Pre-check filesize without downloading using HEAD request
 * @param url - URL to check
 * @returns File size in bytes, or null if unavailable
 */
export async function getFilesizeFromHead(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for HEAD

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: CDN_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      logDebug(`HEAD request failed with status ${response.status}`);
      return null;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size)) {
        logDebug(`File size from HEAD: ${(size / 1024 / 1024).toFixed(2)}MB`);
        return size;
      }
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logDebug('HEAD request timed out');
    } else {
      logDebug('HEAD request failed:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch URL with retry logic and exponential backoff
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Buffer containing the response body
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Buffer> {
  const {
    maxRetries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT,
    headers = {},
    onProgress,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        logInfo(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
        await sleep(delay);
      }

      logDebug(`Fetching URL (attempt ${attempt + 1}/${maxRetries + 1}): ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { ...CDN_HEADERS, ...headers },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read response as array buffer with progress tracking
      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (response.body && onProgress && totalBytes > 0) {
        // Stream with progress tracking
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedBytes += value.length;
          onProgress(receivedBytes);

          logDebug(`Download progress: ${((receivedBytes / totalBytes) * 100).toFixed(1)}%`);
        }

        // Combine chunks into buffer
        const buffer = Buffer.concat(chunks);
        logInfo(`Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
        return buffer;
      } else {
        // Simple fetch without progress
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        logInfo(`Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
        return buffer;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'AbortError') {
        logError(`Request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`);
      } else {
        logError(`Fetch failed (attempt ${attempt + 1}):`, lastError.message);
      }

      // Don't retry on certain errors
      if (lastError.message.includes('HTTP 404') || lastError.message.includes('HTTP 403')) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Fetch failed after all retries');
}

// ============================================================================
// ManagedBuffer Class
// ============================================================================

/**
 * Class for safe buffer handling with explicit cleanup
 */
export class ManagedBuffer {
  private buffer: Buffer | null = null;
  /**
   * Fetch data from URL and store in managed buffer
   * @param url - URL to fetch
   * @param options - Fetch options
   * @returns The fetched buffer
   */
  async fetch(url: string, options?: FetchOptions): Promise<Buffer> {
    // Release any existing buffer first
    this.release();

    this.buffer = await fetchWithRetry(url, options);
    return this.buffer;
  }

  /**
   * Get the current buffer (may be null if released)
   */
  getBuffer(): Buffer | null {
    return this.buffer;
  }

  /**
   * Get the size of the current buffer in bytes
   */
  getSize(): number {
    return this.buffer?.length ?? 0;
  }

  /**
   * Check if buffer exists and has data
   */
  hasData(): boolean {
    return this.buffer !== null && this.buffer.length > 0;
  }

  /**
   * Explicitly release the buffer and suggest GC
   */
  release(): void {
    if (this.buffer) {
      const size = this.buffer.length;
      this.buffer = null;
      logDebug(`Buffer released: ${(size / 1024 / 1024).toFixed(2)}MB`);
      suggestGC();
    }
  }
}

// ============================================================================
// Function-based Cleanup Pattern
// ============================================================================

/**
 * Fetch with automatic cleanup using callback pattern
 * Ensures buffer is released after callback completes (success or error)
 * 
 * @param url - URL to fetch
 * @param callback - Async callback that receives the buffer
 * @param options - Fetch options
 * @returns Result of the callback
 * 
 * @example
 * const result = await fetchWithCleanup(url, async (buffer) => {
 *   await sendVideo(buffer);
 *   return { success: true };
 * });
 */
export async function fetchWithCleanup<T>(
  url: string,
  callback: (buffer: Buffer) => Promise<T>,
  options?: FetchOptions
): Promise<T> {
  let buffer: Buffer | null = null;

  try {
    buffer = await fetchWithRetry(url, options);
    return await callback(buffer);
  } finally {
    // Explicitly release buffer reference
    buffer = null;
    suggestGC();
  }
}

/**
 * Wrapper for operations that need buffer management
 * Provides a cleaner API for common use cases
 * 
 * @example
 * await withManagedBuffer(async (manager) => {
 *   const buffer = await manager.fetch(url);
 *   if (buffer.length > MAX_TELEGRAM_FILESIZE) {
 *     throw new Error('File too large');
 *   }
 *   await sendVideo(buffer);
 * });
 */
export async function withManagedBuffer<T>(
  operation: (manager: ManagedBuffer) => Promise<T>
): Promise<T> {
  const manager = new ManagedBuffer();

  try {
    return await operation(manager);
  } finally {
    manager.release();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file size is within Telegram's limit
 */
export function isWithinTelegramLimit(bytes: number): boolean {
  return bytes <= MAX_TELEGRAM_FILESIZE;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
