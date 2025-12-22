import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'XTFetch API - Social Media Video Downloader API',
    description: 'Free API for extracting video URLs from YouTube, Facebook, Instagram, Twitter, TikTok, and Weibo. No authentication required.',
    keywords: ['api', 'video downloader', 'youtube', 'facebook', 'instagram', 'twitter', 'tiktok', 'weibo'],
    authors: [{ name: 'risunCode', url: 'https://github.com/risunCode' }],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="theme-solarized">
            <head>
                {/* Google Fonts - JetBrains Mono */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                {/* FontAwesome CDN */}
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
                    integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                />
            </head>
            <body className="antialiased">{children}</body>
        </html>
    );
}
