'use client';

import { SidebarLayout } from '@/components/Sidebar';
import { HomePage } from '@/components/sections/Home';

export default function Page() {
    return (
        <SidebarLayout>
            <HomePage />
        </SidebarLayout>
    );
}
