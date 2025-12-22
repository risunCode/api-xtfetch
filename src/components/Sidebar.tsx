'use client';

import { useState, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type NavSection = 'home' | 'docs';

interface SidebarProps {
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

// ═══════════════════════════════════════════════════════════════
// Theme - Solarized Only
// ═══════════════════════════════════════════════════════════════

function initTheme() {
    if (typeof window !== 'undefined') {
        document.documentElement.className = 'theme-solarized';
    }
}

// ═══════════════════════════════════════════════════════════════
// Navigation Config - Simple: Home & Docs only
// ═══════════════════════════════════════════════════════════════

const NAV_ITEMS: { id: NavSection; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: 'fa-home' },
    { id: 'docs', label: 'Documentation', icon: 'fa-book' },
];

// ═══════════════════════════════════════════════════════════════
// Sidebar Component
// ═══════════════════════════════════════════════════════════════

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
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

    const handleNavClick = (section: NavSection) => {
        onSectionChange(section);
        setMobileOpen(false);
    };

    return (
        <>
            {/* Mobile Header - No theme icon */}
            <div className="mobile-header">
                <button className="mobile-burger" onClick={() => setMobileOpen(!mobileOpen)}>
                    <i className={`fa-solid ${mobileOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
                </button>
                <div className="mobile-logo">
                    <div className="logo-icon">
                        <i className="fa-solid fa-bolt"></i>
                    </div>
                    <span>XTFetch API</span>
                </div>
                {/* Empty div for flex spacing */}
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
                    <div className="logo-icon">
                        <i className="fa-solid fa-bolt"></i>
                    </div>
                    <div>
                        <h1 className="logo-text">XTFetch</h1>
                        <span className="logo-sub">API Documentation</span>
                    </div>
                </div>

                {/* Navigation - Simple list */}
                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                        >
                            <i className={`fa-solid ${item.icon}`}></i>
                            <span>{item.label}</span>
                        </button>
                    ))}
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
    activeSection: NavSection;
    onSectionChange: (section: NavSection) => void;
}

export function SidebarLayout({ children, activeSection, onSectionChange }: LayoutProps) {
    return (
        <div className="app-layout">
            <Sidebar activeSection={activeSection} onSectionChange={onSectionChange} />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
