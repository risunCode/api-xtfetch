/**
 * Bot Logging Utility
 * Simple logging that respects DEBUG environment variable
 * 
 * Usage:
 * import { log } from '@/bot/helpers';
 * log.debug('Processing...'); // Only shows if DEBUG=true
 * log.info('Success');        // Always shows
 * log.error('Failed', err);   // Always shows
 */

const IS_DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

export const log = {
  /** Debug log - only in development/debug mode */
  debug: (message: string) => {
    if (IS_DEBUG) console.log(`[Bot] ${message}`);
  },
  
  /** Info log - always shows */
  info: (message: string) => {
    console.log(`[Bot] ${message}`);
  },
  
  /** Error log - always shows */
  error: (message: string, err?: unknown) => {
    console.error(`[Bot] ${message}`, err || '');
  },
  
  /** Worker-specific debug log */
  worker: (message: string) => {
    if (IS_DEBUG) console.log(`[Worker] ${message}`);
  },
  
  /** Media-specific debug log */
  media: (message: string) => {
    if (IS_DEBUG) console.log(`[Media] ${message}`);
  },
};
