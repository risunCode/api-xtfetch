'use client';

import { useState, useEffect } from 'react';

type Status = 'online' | 'slow' | 'offline' | 'checking';

// ═══════════════════════════════════════════════════════════════
// Endpoints Config (Hidden: cookies, health)
// ═══════════════════════════════════════════════════════════════

const ENDPOINTS = [
    {
        method: 'GET' as const,
        path: '/api/v1/playground',
        description: 'Free API testing - extract media from URL',
        rateLimit: '5 req / 2 min',
    },
    {
        method: 'POST' as const,
        path: '/api/v1/playground',
        description: 'Same as GET, accepts JSON body with url parameter',
        rateLimit: '5 req / 2 min',
    },
    {
        method: 'GET' as const,
        path: '/api/v1/status',
        description: 'Service status & platform availability',
        rateLimit: '30 req / min',
    },
];

const PLATFORMS = [
    { name: 'YouTube', icon: 'fa-youtube', color: '#ff0000' },
    { name: 'Facebook', icon: 'fa-facebook', color: '#1877f2' },
    { name: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
    { name: 'Twitter/X', icon: 'fa-x-twitter', color: 'var(--text-primary)' },
    { name: 'TikTok', icon: 'fa-tiktok', color: 'var(--text-primary)' },
    { name: 'Weibo', icon: 'fa-weibo', color: '#e6162d' },
];

// ═══════════════════════════════════════════════════════════════
// Home Page Component
// ═══════════════════════════════════════════════════════════════

export function HomePage() {
    const [status, setStatus] = useState<Status>('checking');
    const [url, setUrl] = useState('');
    const [response, setResponse] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [responseTime, setResponseTime] = useState<number | null>(null);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const start = Date.now();
            const res = await fetch('/api/health');
            const time = Date.now() - start;
            setStatus(res.ok ? (time < 1000 ? 'online' : 'slow') : 'offline');
        } catch {
            setStatus('offline');
        }
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setUrl(text);
        } catch {
            // Clipboard access denied
        }
    };

    const handleTest = () => {
        setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    };

    const sendRequest = async () => {
        if (!url.trim()) {
            setResponse(JSON.stringify({ error: 'Please enter a URL' }, null, 2));
            return;
        }

        setLoading(true);
        setResponse(null);
        const start = Date.now();

        try {
            const res = await fetch(`/api/v1/playground?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            const time = Date.now() - start;
            setResponseTime(time);
            setResponse(JSON.stringify(data, null, 2));
            setStatus(time < 2000 ? 'online' : time < 5000 ? 'slow' : 'offline');
        } catch (err) {
            setResponse(JSON.stringify({
                error: err instanceof Error ? err.message : 'Request failed'
            }, null, 2));
            setStatus('offline');
        }

        setLoading(false);
    };

    const statusLabels = {
        online: 'All Systems Operational',
        slow: 'Degraded Performance',
        offline: 'Service Unavailable',
        checking: 'Checking...',
    };

    return (
        <div className="section">
            {/* ═══════════════════════════════════════════════════════════
                Overview Section
               ═══════════════════════════════════════════════════════════ */}
            <div className="section-header">
                <h2>
                    <i className="fa-solid fa-home"></i>
                    Social Media Downloader
                </h2>
                <div className="status-indicator">
                    <span className={`traffic-light ${status}`}></span>
                    <span>{statusLabels[status]}</span>
                </div>
            </div>

            <p className="section-desc">
                Free API for extracting video URLs from social media platforms.
                No authentication required for public endpoints.
            </p>

            <div className="feature-grid">
                <div className="glass-card feature-card">
                    <div className="feature-icon green">
                        <i className="fa-solid fa-download"></i>
                    </div>
                    <h3>Download Videos</h3>
                    <p>Extract direct video URLs from social media posts</p>
                </div>

                <div className="glass-card feature-card">
                    <div className="feature-icon blue">
                        <i className="fa-solid fa-globe"></i>
                    </div>
                    <h3>6 Platforms</h3>
                    <p>YouTube, Facebook, Instagram, Twitter, TikTok, Weibo</p>
                </div>

                <div className="glass-card feature-card">
                    <div className="feature-icon purple">
                        <i className="fa-solid fa-bolt"></i>
                    </div>
                    <h3>Fast & Free</h3>
                    <p>No API key required for public endpoints</p>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════
                API Playground Section
               ═══════════════════════════════════════════════════════════ */}
            <h3 className="subsection-title">
                <i className="fa-solid fa-terminal"></i>
                API Playground
            </h3>

            <div className="glass-card console-card">
                <div className="console-header">
                    <div className="traffic-lights">
                        <span className="light red"></span>
                        <span className="light yellow"></span>
                        <span className="light green"></span>
                    </div>
                    <div className="console-endpoint">
                        <span className="method-badge get">GET</span>
                        <code>/api/v1/playground?url=</code>
                    </div>
                </div>

                <div className="console-body">
                    <div className="console-input">
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && url.trim() && sendRequest()}
                            placeholder="Paste YouTube, Facebook, Instagram, TikTok, Twitter, or Weibo URL..."
                            className="input-url"
                        />
                    </div>
                    
                    <div className="console-tip">
                        <i className="fa-solid fa-lightbulb"></i>
                        <span>Tip: Rate limit 5 requests per 2 minutes. Supports cookies for private content!</span>
                    </div>

                    <div className="console-actions">
                        <button
                            onClick={handlePaste}
                            className="btn-action"
                            title="Paste from clipboard"
                        >
                            <i className="fa-solid fa-paste"></i>
                            <span>Paste</span>
                        </button>
                        <button
                            onClick={handleTest}
                            className="btn-action"
                            title="Use test URL (YouTube)"
                        >
                            <i className="fa-solid fa-flask"></i>
                            <span>Test</span>
                        </button>
                        <button
                            onClick={sendRequest}
                            disabled={loading || !url.trim()}
                            className="btn-run"
                        >
                            {loading ? (
                                <i className="fa-solid fa-spinner fa-spin"></i>
                            ) : (
                                <i className="fa-solid fa-play"></i>
                            )}
                            <span>Run</span>
                        </button>
                    </div>
                </div>

                {response && (
                    <div className="console-response">
                        <div className="response-header">
                            <span>Response</span>
                            {responseTime && (
                                <span className="response-time">
                                    <i className="fa-solid fa-clock"></i>
                                    {responseTime}ms
                                </span>
                            )}
                        </div>
                        <pre><code>{response}</code></pre>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════
                Public Endpoints Section
               ═══════════════════════════════════════════════════════════ */}
            <h3 className="subsection-title">
                <i className="fa-solid fa-code"></i>
                Public Endpoints
            </h3>

            <div className="endpoints-list">
                {ENDPOINTS.map((ep, i) => (
                    <div key={i} className="glass-card endpoint-card">
                        <div className="endpoint-header">
                            <span className={`method-badge ${ep.method.toLowerCase()}`}>
                                {ep.method}
                            </span>
                            <code>{ep.path}</code>
                        </div>
                        <p>{ep.description}</p>
                        <span className="rate-limit">
                            <i className="fa-solid fa-gauge-high"></i>
                            {ep.rateLimit}
                        </span>
                    </div>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════
                Supported Platforms Section
               ═══════════════════════════════════════════════════════════ */}
            <h3 className="subsection-title">
                <i className="fa-solid fa-globe"></i>
                Supported Platforms
            </h3>

            <div className="platforms-grid">
                {PLATFORMS.map((p, i) => (
                    <div key={i} className="glass-card platform-card">
                        <i className={`fa-brands ${p.icon}`} style={{ color: p.color }}></i>
                        <span>{p.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
