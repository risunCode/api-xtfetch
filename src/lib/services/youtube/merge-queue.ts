/**
 * YouTube Merge Queue & Concurrency Control
 * 
 * Production-ready solution for handling multiple merge requests:
 * 1. Semaphore - Limits concurrent yt-dlp/ffmpeg processes
 * 2. Per-IP Rate Limiting - Prevents abuse from single user
 * 3. Queue Status - Track active/waiting requests
 * 4. Disk Space Check - Prevent disk full errors
 * 
 * @module merge-queue
 */

import { statfsSync } from 'fs';
import { tmpdir } from 'os';

// ============================================================================
// Configuration
// ============================================================================

/** Max concurrent merge operations (keep low for container environments) */
const MAX_CONCURRENT = parseInt(process.env.MERGE_MAX_CONCURRENT || '2', 10);

/** Max requests per IP in time window */
const RATE_LIMIT_PER_IP = parseInt(process.env.MERGE_RATE_LIMIT || '5', 10);

/** Rate limit time window in ms (default: 10 minutes) */
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.MERGE_RATE_WINDOW || '600000', 10);

/** Max queue size before rejecting new requests */
const MAX_QUEUE_SIZE = parseInt(process.env.MERGE_MAX_QUEUE || '20', 10);

/** Min free disk space in bytes (default: 100MB - realistic for Railway/Render) */
const MIN_FREE_DISK_BYTES = parseInt(process.env.MERGE_MIN_DISK || '104857600', 10);

/** Request timeout in ms (default: 5 minutes) */
const REQUEST_TIMEOUT_MS = parseInt(process.env.MERGE_TIMEOUT || '300000', 10);

// ============================================================================
// Semaphore (Concurrency Limiter)
// ============================================================================

interface QueuedRequest {
    id: string;
    ip: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
}

class MergeSemaphore {
    private running = 0;
    private queue: QueuedRequest[] = [];
    
    /** Acquire a slot - waits if at capacity */
    async acquire(id: string, ip: string): Promise<void> {
        // Check queue size limit
        if (this.queue.length >= MAX_QUEUE_SIZE) {
            throw new Error(`Server busy - ${this.queue.length} requests in queue. Try again later.`);
        }
        
        if (this.running < MAX_CONCURRENT) {
            this.running++;
            console.log(`[merge-queue] Acquired slot for ${id} (${this.running}/${MAX_CONCURRENT} active)`);
            return;
        }
        
        // Wait in queue
        return new Promise((resolve, reject) => {
            const request: QueuedRequest = { 
                id, 
                ip, 
                resolve: () => {
                    this.running++;
                    console.log(`[merge-queue] Dequeued ${id} (${this.running}/${MAX_CONCURRENT} active, ${this.queue.length} waiting)`);
                    resolve();
                }, 
                reject,
                timestamp: Date.now()
            };
            
            this.queue.push(request);
            console.log(`[merge-queue] Queued ${id} at position ${this.queue.length}`);
            
            // Timeout handler
            setTimeout(() => {
                const idx = this.queue.findIndex(r => r.id === id);
                if (idx !== -1) {
                    this.queue.splice(idx, 1);
                    reject(new Error('Request timed out in queue'));
                }
            }, REQUEST_TIMEOUT_MS);
        });
    }
    
    /** Release a slot */
    release(id: string): void {
        this.running = Math.max(0, this.running - 1);
        console.log(`[merge-queue] Released slot for ${id} (${this.running}/${MAX_CONCURRENT} active)`);
        
        // Process next in queue
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) {
                next.resolve();
            }
        }
    }
    
    /** Get current status */
    getStatus(): { active: number; queued: number; maxConcurrent: number } {
        return {
            active: this.running,
            queued: this.queue.length,
            maxConcurrent: MAX_CONCURRENT
        };
    }
}

// Singleton instance
const semaphore = new MergeSemaphore();

// ============================================================================
// Per-IP Rate Limiting
// ============================================================================

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

const ipRateLimits = new Map<string, RateLimitEntry>();

/** Check and update rate limit for IP */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = ipRateLimits.get(ip);
    
    // Clean up old entries periodically
    if (ipRateLimits.size > 1000) {
        for (const [key, val] of ipRateLimits) {
            if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) {
                ipRateLimits.delete(key);
            }
        }
    }
    
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // New window
        ipRateLimits.set(ip, { count: 1, windowStart: now });
        return { 
            allowed: true, 
            remaining: RATE_LIMIT_PER_IP - 1,
            resetIn: RATE_LIMIT_WINDOW_MS
        };
    }
    
    if (entry.count >= RATE_LIMIT_PER_IP) {
        const resetIn = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
        return { 
            allowed: false, 
            remaining: 0,
            resetIn
        };
    }
    
    entry.count++;
    return { 
        allowed: true, 
        remaining: RATE_LIMIT_PER_IP - entry.count,
        resetIn: RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)
    };
}

// ============================================================================
// Disk Space Check
// ============================================================================

/** Check if enough disk space available */
function checkDiskSpace(): { ok: boolean; freeBytes: number; minRequired: number } {
    try {
        const stats = statfsSync(tmpdir());
        const freeBytes = stats.bfree * stats.bsize;
        return {
            ok: freeBytes >= MIN_FREE_DISK_BYTES,
            freeBytes,
            minRequired: MIN_FREE_DISK_BYTES
        };
    } catch {
        // If we can't check, assume it's ok
        return { ok: true, freeBytes: 0, minRequired: MIN_FREE_DISK_BYTES };
    }
}

// ============================================================================
// Exports
// ============================================================================

export interface MergeQueueResult {
    allowed: boolean;
    error?: string;
    queuePosition?: number;
    rateLimitRemaining?: number;
    rateLimitResetIn?: number;
}

/**
 * Request permission to start a merge operation
 * Checks rate limit, disk space, and acquires semaphore slot
 */
export async function mergeQueueAcquire(id: string, ip: string): Promise<MergeQueueResult> {
    // 1. Check rate limit
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
        const resetMinutes = Math.ceil(rateLimit.resetIn / 60000);
        return {
            allowed: false,
            error: `Rate limit exceeded. Try again in ${resetMinutes} minute(s).`,
            rateLimitRemaining: 0,
            rateLimitResetIn: rateLimit.resetIn
        };
    }
    
    // 2. Check disk space
    const disk = checkDiskSpace();
    if (!disk.ok) {
        console.error(`[merge-queue] Low disk space: ${disk.freeBytes} bytes free`);
        return {
            allowed: false,
            error: 'Server storage full. Please try again later.'
        };
    }
    
    // 3. Acquire semaphore slot (may wait in queue)
    try {
        await semaphore.acquire(id, ip);
        return {
            allowed: true,
            rateLimitRemaining: rateLimit.remaining,
            rateLimitResetIn: rateLimit.resetIn
        };
    } catch (e) {
        return {
            allowed: false,
            error: e instanceof Error ? e.message : 'Queue error'
        };
    }
}

/**
 * Release semaphore slot after merge completes
 */
export function mergeQueueRelease(id: string): void {
    semaphore.release(id);
}

/**
 * Get current queue status
 */
export function mergeQueueStatus(): {
    active: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
    rateLimitPerIp: number;
    rateLimitWindowMinutes: number;
} {
    const status = semaphore.getStatus();
    return {
        ...status,
        maxQueue: MAX_QUEUE_SIZE,
        rateLimitPerIp: RATE_LIMIT_PER_IP,
        rateLimitWindowMinutes: Math.round(RATE_LIMIT_WINDOW_MS / 60000)
    };
}
