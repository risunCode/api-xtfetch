/**
 * Bot Monitoring Utilities
 * 
 * Provides memory monitoring, performance metrics, and health checks
 * for the Telegram bot to prevent OOM kills and track performance.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  heapUsagePercent: number;
}

export interface BotMetrics {
  downloadsProcessed: number;
  downloadsFailed: number;
  averageProcessingTimeMs: number;
  queuedJobs: number;
  activeWorkers: number;
  lastUpdated: Date;
  // Error tracking metrics
  errorsByType: Record<string, number>;
  queueDepthHistory: number[];
  peakQueueDepth: number;
}

export interface HealthStatus {
  healthy: boolean;
  memoryOk: boolean;
  queueOk: boolean;
  redisOk: boolean;
  issues: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Memory warning threshold (MB) */
export const MEMORY_WARNING_THRESHOLD_MB = 400;

/** Memory critical threshold (MB) - should trigger alerts */
export const MEMORY_CRITICAL_THRESHOLD_MB = 700;

/** Maximum heap usage percentage before warning */
export const HEAP_USAGE_WARNING_PERCENT = 80;

// ============================================================================
// METRICS STORAGE
// ============================================================================

// In-memory metrics (reset on restart)
const metrics: BotMetrics = {
  downloadsProcessed: 0,
  downloadsFailed: 0,
  averageProcessingTimeMs: 0,
  queuedJobs: 0,
  activeWorkers: 0,
  lastUpdated: new Date(),
  // New metrics
  errorsByType: {},
  queueDepthHistory: [],
  peakQueueDepth: 0,
};

// Processing time samples for rolling average
const processingTimes: number[] = [];
const MAX_SAMPLES = 100;

// ============================================================================
// MEMORY MONITORING
// ============================================================================

/**
 * Get current memory statistics
 */
export function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  
  return {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
    heapUsagePercent: Math.round((usage.heapUsed / usage.heapTotal) * 100),
  };
}

/**
 * Check if memory usage is within safe limits
 */
export function isMemorySafe(): boolean {
  const stats = getMemoryStats();
  return stats.heapUsedMB < MEMORY_WARNING_THRESHOLD_MB;
}

/**
 * Check if memory is at critical level
 */
export function isMemoryCritical(): boolean {
  const stats = getMemoryStats();
  return stats.heapUsedMB >= MEMORY_CRITICAL_THRESHOLD_MB;
}

/**
 * Log memory status with appropriate level
 */
export function logMemoryStatus(): void {
  const stats = getMemoryStats();
  const status = `Heap: ${stats.heapUsedMB}MB/${stats.heapTotalMB}MB (${stats.heapUsagePercent}%), RSS: ${stats.rssMB}MB`;
  
  if (stats.heapUsedMB >= MEMORY_CRITICAL_THRESHOLD_MB) {
    console.error(`[Monitor] CRITICAL MEMORY: ${status}`);
  } else if (stats.heapUsedMB >= MEMORY_WARNING_THRESHOLD_MB) {
    console.warn(`[Monitor] High memory: ${status}`);
  } else {
    console.log(`[Monitor] Memory OK: ${status}`);
  }
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

/**
 * Record a successful download
 */
export function recordDownloadSuccess(processingTimeMs: number): void {
  metrics.downloadsProcessed++;
  metrics.lastUpdated = new Date();
  
  // Update rolling average
  processingTimes.push(processingTimeMs);
  if (processingTimes.length > MAX_SAMPLES) {
    processingTimes.shift();
  }
  
  metrics.averageProcessingTimeMs = Math.round(
    processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
  );
}

/**
 * Record a failed download
 */
export function recordDownloadFailure(): void {
  metrics.downloadsFailed++;
  metrics.lastUpdated = new Date();
}

/**
 * Record error by type for tracking error patterns
 */
export function recordErrorByType(errorType: string): void {
  if (!metrics.errorsByType) {
    metrics.errorsByType = {};
  }
  metrics.errorsByType[errorType] = (metrics.errorsByType[errorType] || 0) + 1;
}

/**
 * Record queue depth for tracking queue patterns
 */
export function recordQueueDepth(depth: number): void {
  if (!metrics.queueDepthHistory) {
    metrics.queueDepthHistory = [];
  }
  metrics.queueDepthHistory.push(depth);
  
  // Keep last 100 samples
  if (metrics.queueDepthHistory.length > 100) {
    metrics.queueDepthHistory.shift();
  }
  
  // Track peak
  if (!metrics.peakQueueDepth || depth > metrics.peakQueueDepth) {
    metrics.peakQueueDepth = depth;
  }
}

/**
 * Update queue metrics
 */
export function updateQueueMetrics(queued: number, active: number): void {
  metrics.queuedJobs = queued;
  metrics.activeWorkers = active;
  metrics.lastUpdated = new Date();
}

/**
 * Get current metrics
 */
export function getMetrics(): BotMetrics {
  return { ...metrics };
}

/**
 * Get success rate percentage
 */
export function getSuccessRate(): number {
  const total = metrics.downloadsProcessed + metrics.downloadsFailed;
  if (total === 0) return 100;
  return Math.round((metrics.downloadsProcessed / total) * 100);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Perform comprehensive health check
 */
export async function checkHealth(): Promise<HealthStatus> {
  const issues: string[] = [];
  const memoryStats = getMemoryStats();
  
  // Memory check
  const memoryOk = memoryStats.heapUsedMB < MEMORY_CRITICAL_THRESHOLD_MB;
  if (!memoryOk) {
    issues.push(`Critical memory usage: ${memoryStats.heapUsedMB}MB`);
  } else if (memoryStats.heapUsedMB >= MEMORY_WARNING_THRESHOLD_MB) {
    issues.push(`High memory usage: ${memoryStats.heapUsedMB}MB`);
  }
  
  // Queue check (basic - just check if metrics are stale)
  const queueOk = true; // Will be updated when queue is integrated
  
  // Redis check (basic)
  let redisOk = true;
  try {
    const { redis } = await import('@/lib/database');
    if (redis) {
      await redis.ping();
    } else {
      redisOk = false;
      issues.push('Redis not configured');
    }
  } catch (error) {
    redisOk = false;
    issues.push('Redis connection failed');
  }
  
  return {
    healthy: memoryOk && queueOk && redisOk,
    memoryOk,
    queueOk,
    redisOk,
    issues,
  };
}

// ============================================================================
// MONITORING INTERVAL
// ============================================================================

let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic monitoring
 * @param intervalMs - Monitoring interval in milliseconds (default: 60000 = 1 minute)
 */
export function startMonitoring(intervalMs = 60000): void {
  if (monitoringInterval) {
    console.log('[Monitor] Already running');
    return;
  }
  
  console.log(`[Monitor] Starting with ${intervalMs}ms interval`);
  
  monitoringInterval = setInterval(() => {
    const stats = getMemoryStats();
    
    // Only log if there's something notable
    if (stats.heapUsedMB >= MEMORY_WARNING_THRESHOLD_MB) {
      logMemoryStatus();
    }
    
    // Log metrics summary periodically
    const successRate = getSuccessRate();
    if (metrics.downloadsProcessed > 0 || metrics.downloadsFailed > 0) {
      console.log(
        `[Monitor] Stats: ${metrics.downloadsProcessed} ok, ${metrics.downloadsFailed} failed ` +
        `(${successRate}%), avg ${metrics.averageProcessingTimeMs}ms`
      );
    }
  }, intervalMs);
}

/**
 * Stop periodic monitoring
 */
export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('[Monitor] Stopped');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getMemoryStats,
  isMemorySafe,
  isMemoryCritical,
  logMemoryStatus,
  recordDownloadSuccess,
  recordDownloadFailure,
  recordErrorByType,
  recordQueueDepth,
  updateQueueMetrics,
  getMetrics,
  getSuccessRate,
  checkHealth,
  startMonitoring,
  stopMonitoring,
};
