'use client';

import { useState } from 'react';

type DocTab = 'getting-started' | 'rate-limits' | 'errors';

const TABS: { id: DocTab; label: string; icon: string }[] = [
    { id: 'getting-started', label: 'Getting Started', icon: 'fa-rocket' },
    { id: 'rate-limits', label: 'Rate Limits', icon: 'fa-gauge-high' },
    { id: 'errors', label: 'Error Codes', icon: 'fa-triangle-exclamation' },
];

export function Documentation() {
    const [activeTab, setActiveTab] = useState<DocTab>('getting-started');

    return (
        <div className="section">
            <div className="section-header">
                <h2>
                    <i className="fa-solid fa-book"></i>
                    Documentation
                </h2>
            </div>

            <div className="doc-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`doc-tab ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        <i className={`fa-solid ${tab.icon}`}></i>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="glass-card doc-content">
                {activeTab === 'getting-started' && <GettingStarted />}
                {activeTab === 'rate-limits' && <RateLimits />}
                {activeTab === 'errors' && <ErrorCodes />}
            </div>
        </div>
    );
}

function GettingStarted() {
    return (
        <div className="doc-section">
            <h3>Quick Start</h3>
            <p>Make a GET request to extract video URLs from any supported platform:</p>
            
            <pre><code>{`curl "https://xtfetch-api-production.up.railway.app/api/v1/playground?url=YOUR_VIDEO_URL"`}</code></pre>

            <h3>Request Parameters</h3>
            <table className="doc-table">
                <thead>
                    <tr>
                        <th>Parameter</th>
                        <th>Type</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>url</code></td>
                        <td>string</td>
                        <td>The video URL to extract (required)</td>
                    </tr>
                </tbody>
            </table>

            <h3>Response Format</h3>
            <pre><code>{`{
  "success": true,
  "platform": "youtube",
  "title": "Video Title",
  "thumbnail": "https://...",
  "medias": [
    {
      "url": "https://...",
      "quality": "720p",
      "type": "video"
    }
  ]
}`}</code></pre>

            <h3>POST Request</h3>
            <p>You can also use POST with a JSON body:</p>
            <pre><code>{`curl -X POST "https://xtfetch-api-production.up.railway.app/api/v1/playground" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "YOUR_VIDEO_URL"}'`}</code></pre>
        </div>
    );
}

function RateLimits() {
    return (
        <div className="doc-section">
            <h3>Rate Limiting</h3>
            <p>Rate limits are applied per IP address to ensure fair usage:</p>

            <table className="doc-table">
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>Limit</th>
                        <th>Window</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>/api/v1/playground</code></td>
                        <td>5 requests</td>
                        <td>2 minutes</td>
                    </tr>
                    <tr>
                        <td><code>/api/v1/status</code></td>
                        <td>30 requests</td>
                        <td>1 minute</td>
                    </tr>
                    <tr>
                        <td><code>/api/v1/cookies</code></td>
                        <td>60 requests</td>
                        <td>1 minute</td>
                    </tr>
                    <tr>
                        <td><code>/api/health</code></td>
                        <td>100 requests</td>
                        <td>1 minute</td>
                    </tr>
                </tbody>
            </table>

            <h3>Rate Limit Headers</h3>
            <p>Response headers include rate limit information:</p>
            <pre><code>{`X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1703260800`}</code></pre>

            <h3>Exceeded Limit</h3>
            <p>When rate limit is exceeded, you'll receive a 429 response:</p>
            <pre><code>{`{
  "error": "Rate limit exceeded",
  "retryAfter": 120
}`}</code></pre>
        </div>
    );
}

function ErrorCodes() {
    return (
        <div className="doc-section">
            <h3>HTTP Status Codes</h3>
            <table className="doc-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>200</code></td>
                        <td>Success - video data extracted</td>
                    </tr>
                    <tr>
                        <td><code>400</code></td>
                        <td>Bad Request - invalid or missing URL</td>
                    </tr>
                    <tr>
                        <td><code>404</code></td>
                        <td>Not Found - video unavailable or deleted</td>
                    </tr>
                    <tr>
                        <td><code>429</code></td>
                        <td>Too Many Requests - rate limit exceeded</td>
                    </tr>
                    <tr>
                        <td><code>500</code></td>
                        <td>Server Error - extraction failed</td>
                    </tr>
                    <tr>
                        <td><code>503</code></td>
                        <td>Service Unavailable - platform down</td>
                    </tr>
                </tbody>
            </table>

            <h3>Error Response Format</h3>
            <pre><code>{`{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE"
}`}</code></pre>

            <h3>Common Error Codes</h3>
            <table className="doc-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>INVALID_URL</code></td>
                        <td>URL format is invalid</td>
                    </tr>
                    <tr>
                        <td><code>UNSUPPORTED_PLATFORM</code></td>
                        <td>Platform not supported</td>
                    </tr>
                    <tr>
                        <td><code>VIDEO_NOT_FOUND</code></td>
                        <td>Video doesn't exist or is private</td>
                    </tr>
                    <tr>
                        <td><code>EXTRACTION_FAILED</code></td>
                        <td>Failed to extract video data</td>
                    </tr>
                    <tr>
                        <td><code>RATE_LIMITED</code></td>
                        <td>Too many requests</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
