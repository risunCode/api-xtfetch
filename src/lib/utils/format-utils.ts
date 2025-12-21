/**
 * Format Utilities
 * Shared formatting functions for bytes, speed, duration
 */

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSec: number): { mb: string; mbit: string } {
    const mbps = bytesPerSec / (1024 * 1024);
    const mbitps = (bytesPerSec * 8) / (1024 * 1024);
    return {
        mb: mbps.toFixed(2) + ' MB/s',
        mbit: mbitps.toFixed(1) + ' Mbit/s'
    };
}

export function parseFileSizeToBytes(sizeStr: string): number | undefined {
    const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB)/i);
    if (!match) return undefined;
    
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
        case 'GB': return num * 1024 * 1024 * 1024;
        case 'MB': return num * 1024 * 1024;
        case 'KB': return num * 1024;
        default: return undefined;
    }
}
