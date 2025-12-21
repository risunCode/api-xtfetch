/**
 * Root Layout - API Only (no UI)
 */

export const metadata = {
    title: 'XTFetch API',
    description: 'Social Media Video Downloader API',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
