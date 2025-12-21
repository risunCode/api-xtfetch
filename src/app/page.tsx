/**
 * Root Page - Redirect to API docs or show simple message
 */

export default function Home() {
    return (
        <main style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            background: '#0a0a0a',
            color: '#fafafa'
        }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚀 XTFetch API</h1>
            <p style={{ color: '#888' }}>Social Media Video Downloader Backend</p>
            <p style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#666' }}>
                API Endpoint: <code style={{ background: '#1a1a1a', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>/api</code>
            </p>
        </main>
    );
}
