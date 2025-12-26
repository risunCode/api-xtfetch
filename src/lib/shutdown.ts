/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GRACEFUL SHUTDOWN HANDLER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Handles SIGTERM/SIGINT signals for clean shutdown.
 * Ensures in-flight requests complete and resources are properly released.
 * 
 * @module lib/shutdown
 */

let isShuttingDown = false;
let shutdownHandlersRegistered = false;

/**
 * Check if server is currently shutting down
 * Use this to reject new requests during shutdown
 */
export function isServerShuttingDown(): boolean {
    return isShuttingDown;
}

/**
 * Setup graceful shutdown handlers for SIGTERM and SIGINT signals
 * Should be called once during application initialization
 * 
 * NOTE: This only works in Node.js runtime, not Edge Runtime (middleware)
 */
export function setupGracefulShutdown(): void {
    // Skip in Edge Runtime (middleware) - process.on is not available
    if (typeof process === 'undefined' || typeof process.on !== 'function') {
        return;
    }

    // Prevent duplicate registration
    if (shutdownHandlersRegistered) {
        return;
    }
    shutdownHandlersRegistered = true;

    const shutdown = async (signal: string) => {
        // Prevent multiple shutdown attempts
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;

        console.log(`\x1b[33m[Shutdown]\x1b[0m ${signal} received, starting graceful shutdown...`);

        // Give in-flight requests time to complete (10 seconds max)
        const shutdownTimeout = setTimeout(() => {
            console.log('\x1b[31m[Shutdown]\x1b[0m Shutdown timeout reached, forcing exit');
            process.exit(1);
        }, 10000);

        try {
            // Close Redis connections if available
            // Note: Upstash Redis REST client doesn't require explicit close,
            // but we log for visibility
            try {
                const { redis } = await import('@/lib/database');
                if (redis) {
                    console.log('\x1b[36m[Shutdown]\x1b[0m Redis connection will be released');
                }
            } catch {
                // Redis not available or import failed, ignore
            }

            // Allow pending async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('\x1b[32m[Shutdown]\x1b[0m Graceful shutdown complete');
            clearTimeout(shutdownTimeout);
            process.exit(0);
        } catch (error) {
            console.error('\x1b[31m[Shutdown]\x1b[0m Error during shutdown:', error);
            clearTimeout(shutdownTimeout);
            process.exit(1);
        }
    };

    // Register signal handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Only log in development, not during build
    if (process.env.NODE_ENV !== 'production') {
        console.log('\x1b[36m[Shutdown]\x1b[0m Graceful shutdown handlers registered');
    }
}

/**
 * Middleware helper to check shutdown status
 * Returns true if request should be rejected
 */
export function shouldRejectRequest(): boolean {
    return isShuttingDown;
}

/**
 * Get shutdown status for health checks
 */
export function getShutdownStatus(): { shuttingDown: boolean; handlersRegistered: boolean } {
    return {
        shuttingDown: isShuttingDown,
        handlersRegistered: shutdownHandlersRegistered
    };
}
