'use client';

import { useState } from 'react';
import { SidebarLayout, NavSection } from '@/components/Sidebar';
import { HomePage } from '@/components/sections/Home';
import { Documentation } from '@/components/sections/Documentation';

export default function Page() {
    const [activeSection, setActiveSection] = useState<NavSection>('home');

    const renderContent = () => {
        switch (activeSection) {
            case 'home':
                return <HomePage />;
            case 'docs':
                return <Documentation />;
            default:
                return <HomePage />;
        }
    };

    return (
        <SidebarLayout activeSection={activeSection} onSectionChange={setActiveSection}>
            {renderContent()}
        </SidebarLayout>
    );
}
