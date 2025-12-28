/**
 * Bot Queue Module
 * Exports queue infrastructure for concurrent download processing
 */

// Queue configuration
export { QUEUE_CONFIG, getRedisConnection, closeRedisConnection } from './config';

// Download queue and types
export {
    downloadQueue,
    isQueueAvailable,
    getWorkerConnection,
    addJobWithBackpressure,
    type DownloadJobData,
} from './downloadQueue';

// Worker
export { initWorker, closeWorker, downloadWorker, setBotApi } from './worker';
