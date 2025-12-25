'use client';

import { useState, useEffect } from 'react';

type Status = 'online' | 'slow' | 'offline' | 'checking';

// ═══════════════════════════════════════════════════════════════
// Services Config
// ═══════════════════════════════════════════════════════════════

const SERVICES = [
    {
        id: 'downaria',
        name: 'DownAria',
        description: 'Download videos from YouTube, Facebook, Instagram, TikTok, Twitter & more',
        icon: '/icon.png',
        color: '#8b5cf6',
        url: 'https://downaria.vercel.app',
        status: 'active' as const,
    },
    {
        id: 'coming-1',
        name: 'Coming Soon',
        description: 'New service coming soon...',
        icon: null,
        faIcon: 'fa-rocket',
        color: '#6b7280',
        url: null,
        status: 'soon' as const,
    },
    {
        id: 'coming-2',
        name: 'Coming Soon',
        description: 'New service coming soon...',
        icon: null,
        faIcon: 'fa-wand-magic-sparkles',
        color: '#6b7280',
        url: null,
        status: 'soon' as const,
    },
    {
        id: 'coming-3',
        name: 'Coming Soon',
        description: 'New service coming soon...',
        icon: null,
        faIcon: 'fa-cube',
        color: '#6b7280',
        url: null,
        status: 'soon' as const,
    },
];

// ═══════════════════════════════════════════════════════════════
// Home Page Component
// ═══════════════════════════════════════════════════════════════

export function HomePage() {
    const [status, setStatus] = useState<Status>('checking');

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

    const statusLabels = {
        online: 'All Systems Operational',
        slow: 'Degraded Performance',
        offline: 'Service Unavailable',
        checking: 'Checking...',
    };

    return (
        <div className="section">
            {/* Header */}
            <div className="section-header">
                <h2>
                    <i className="fa-solid fa-bolt"></i>
                    XTFetch API
                </h2>
                <div className="status-indicator">
                    <span className={`traffic-light ${status}`}></span>
                    <span>{statusLabels[status]}</span>
                </div>
            </div>

            <p className="section-desc">
                Homepage powered by risunCode. Download videos, and more coming soon!
            </p>

            {/* Services Grid */}
            <div className="services-grid">
                {SERVICES.map((service) => (
                    <a
                        key={service.id}
                        href={service.url || '#'}
                        target={service.url ? '_blank' : undefined}
                        rel={service.url ? 'noopener noreferrer' : undefined}
                        className={`glass-card service-card ${service.status === 'soon' ? 'coming-soon' : ''}`}
                        onClick={(e) => !service.url && e.preventDefault()}
                    >
                        <div className="service-icon" style={{ background: service.status === 'active' ? `${service.color}20` : undefined }}>
                            {service.icon ? (
                                <img src={service.icon} alt={service.name} />
                            ) : (
                                <i className={`fa-solid ${service.faIcon}`} style={{ color: service.color }}></i>
                            )}
                        </div>
                        <div className="service-info">
                            <h3>{service.name}</h3>
                            <p>{service.description}</p>
                        </div>
                        {service.status === 'active' ? (
                            <div className="service-badge active">
                                <i className="fa-solid fa-arrow-up-right-from-square"></i>
                            </div>
                        ) : (
                            <div className="service-badge soon">
                                <i className="fa-solid fa-clock"></i>
                            </div>
                        )}
                    </a>
                ))}
            </div>

            {/* About Section */}
            <h3 className="subsection-title">
                <i className="fa-solid fa-circle-info"></i>
                About
            </h3>

            <div className="glass-card about-card">
                <p>
                    This is the backend API server for risunCode services. 
                    For documentation and usage, visit the respective service pages.
                </p>
                <div className="about-links">
                    <a href="https://github.com/risunCode" target="_blank" rel="noopener noreferrer">
                        <i className="fa-brands fa-github"></i>
                        GitHub
                    </a>
                    <a href="https://downaria.vercel.app/docs" target="_blank" rel="noopener noreferrer">
                        <i className="fa-solid fa-book"></i>
                        API Docs
                    </a>
                </div>
            </div>
        </div>
    );
}
