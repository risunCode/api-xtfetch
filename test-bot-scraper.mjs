/**
 * Test Facebook URL via publicservices API (same as frontend)
 * Run: node test-bot-scraper.mjs
 */

const API_BASE = 'http://localhost:3002';
const TEST_URL = 'https://web.facebook.com/share/r/1CPJehZiaz';

async function testScraper() {
    console.log('=== Testing Facebook via API ===\n');
    console.log('API:', API_BASE);
    console.log('URL:', TEST_URL);
    console.log('');

    const apiUrl = `${API_BASE}/api/v1/publicservices`;
    
    console.log('Calling:', apiUrl);
    console.log('');

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:3001',
                'Referer': 'http://localhost:3001/',
            },
            body: JSON.stringify({ url: TEST_URL, skipCache: true }),
        });

        const data = await response.json();
        
        console.log('Status:', response.status);
        console.log('Success:', data.success);
        
        if (data.success && data.data) {
            console.log('\n=== Result ===');
            console.log('Platform:', data.meta?.platform);
            console.log('Title:', data.data.title?.substring(0, 50) + '...');
            console.log('Author:', data.data.author);
            console.log('Thumbnail:', data.data.thumbnail ? 'YES' : 'NO');
            console.log('Formats:', data.data.formats?.length || 0);
            
            if (data.data.formats?.length > 0) {
                console.log('\n=== Formats ===');
                data.data.formats.forEach((f, i) => {
                    console.log(`${i + 1}. ${f.quality} (${f.type}) - ${f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) + 'MB' : 'unknown size'}`);
                });
            }
        } else {
            console.log('\n=== Error ===');
            console.log('Error:', data.error);
            console.log('ErrorCode:', data.errorCode);
        }
        
    } catch (error) {
        console.error('Fetch error:', error.message);
    }
}

testScraper();
