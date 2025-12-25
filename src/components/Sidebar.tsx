'use client';

import { useState, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════
// Theme - Solarized Only
// ═══════════════════════════════════════════════════════════════

function initTheme() {
    if (typeof window !== 'undefined') {
        document.documentElement.className = 'theme-solarized';
    }
}

// ═══════════════════════════════════════════════════════════════
// Sidebar Component
// ═══════════════════════════════════════════════════════════════

export function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const sidebarRef = useRef<HTMLElement>(null);

    useEffect(() => {
        initTheme();
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (mobileOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
                setMobileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [mobileOpen]);

    return (
        <>
            {/* Mobile Header */}
            <div className="mobile-header">
                <button className="mobile-burger" onClick={() => setMobileOpen(!mobileOpen)}>
                    <i className={`fa-solid ${mobileOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
                </button>
                <div className="mobile-logo">
                    <img src="/icon.png" alt="XTFetch" className="logo-img" />
                    <span>XTFetch API</span>
                </div>
                <div style={{ width: 40 }}></div>
            </div>

            {/* Mobile Overlay */}
            <div 
                className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} 
                onClick={() => setMobileOpen(false)} 
            />

            {/* Sidebar */}
            <aside ref={sidebarRef} className={`sidebar ${mobileOpen ? 'open' : ''}`}>
                {/* Logo */}
                <div className="sidebar-header">
                    <img src="/icon.png" alt="XTFetch" className="logo-img" />
                    <div>
                        <h1 className="logo-text">XTFetch API</h1>
                        <span className="logo-sub">powered by risunCode</span>
                    </div>
                </div>

                {/* Navigation - Home only */}
                <nav className="sidebar-nav">
                    <button className="nav-item active">
                        <i className="fa-solid fa-home"></i>
                        <span>Home</span>
                    </button>
                </nav>

                {/* Footer */}
                <div className="sidebar-footer">
                    <div className="footer-info">
                        <a href="https://github.com/risunCode" target="_blank" rel="noopener noreferrer">
                            <i className="fa-brands fa-github"></i>
                        </a>
                        <span>© 2025 risunCode</span>
                        <span className="version">v1.0.0</span>
                    </div>
                </div>
            </aside>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════
// Layout Wrapper
// ═══════════════════════════════════════════════════════════════

interface LayoutProps {
    children: React.ReactNode;
}

export function SidebarLayout({ children }: LayoutProps) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
