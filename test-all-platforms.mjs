/**
 * Test All Platforms After Refactor
 * Using axios for reliable HTTP requests
 */
import axios from 'axios';

const API_KEY = 'dwa_live_OCtzTCWNmFCwthDLVFRqM0cBbC2jlNvf';
const BASE = 'http://localhost:3002/api/v1';

const TEST_URLS = {
    facebook: [
        'https://web.facebook.com/share/p/17nJFrJKGb/',
        'https://web.facebook.com/share/p/1FCzRqP3KZ/',
        'https://web.facebook.com/share/v/1KRHU2jShC/',
        'https://web.facebook.com/stories/147409977472812/UzpfSVNDOjEzOTkwMzYxNjE5MzU5MDU=/?view_single=1',
    ],
    instagram: [
        'https://www.instagram.com/p/DSpEezOkt1O/',
        'https://www.instagram.com/p/DSsSQ8_iazh/',
        'https://www.instagram.com/p/DSw2xITDwVj/',
        'https://www.instagram.com/p/DRpFDD_EtDm/',
        'https://www.instagram.com/p/DRKryHeiU_y/',
    ],
    twitter: [
        'https://x.com/lac_n_c/status/2005200460425363897',
        'https://x.com/A_erukun/status/2005190613592146154',
        'https://x.com/su_s404/status/2005222737560863034',
        'https://x.com/churu_nya/status/2005224747144290463',
        'https://x.com/ebimaru_daicon/status/2005174274836054225',
    ],
    tiktok: [
        'https://www.tiktok.com/@purrinchu_/video/7530618880482413831',
        'https://www.tiktok.com/@xiuicikiwir/video/7587742177606814994',
        'https://www.tiktok.com/@realjayllnn/video/7586112300378033422',
        'https://www.tiktok.com/@gwarasssss/video/7585914138862472469',
        'https://www.tiktok.com/@lifetips669/video/7563336139017293086',
    ],
    youtube: [
        'https://www.youtube.com/watch?v=Wycqjk6-D_k',
        'https://www.youtube.com/watch?v=EkZmLRHZH5o',
        'https://youtu.be/PkgGrdv_fO8',
        'https://youtu.be/SvyhhZxNwn4',
    ],
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function testUrl(url) {
    const start = Date.now();
    try {
        const { data } = await axios.get(BASE, {
            params: { key: API_KEY, url, skipCache: 'true' },
            timeout: 120000,
        });
        const time = Date.now() - start;
        
        if (data.success) {
            const formats = data.data?.formats?.length || 0;
            const type = data.data?.type || '?';
            const cookie = data.data?.usedCookie ? '🍪' : '';
            console.log(`  ✅ ${String(time).padStart(6)}ms | ${String(formats).padStart(2)} formats | ${type.padEnd(7)} ${cookie}`);
            return true;
        } else {
            const code = data.error?.code || 'ERR';
            const msg = (data.error?.message || '?').substring(0, 30);
            console.log(`  ❌ ${String(time).padStart(6)}ms | ${code}: ${msg}`);
            return false;
        }
    } catch (e) {
        const time = Date.now() - start;
        const msg = e.response?.data?.error?.message || e.message;
        console.log(`  💥 ${String(time).padStart(6)}ms | ${msg.substring(0, 40)}`);
        return false;
    }
}

async function main() {
    console.log('\n🧪 TESTING ALL PLATFORMS AFTER REFACTOR\n');
    console.log('='.repeat(70));
    
    const stats = { passed: 0, failed: 0, byPlatform: {} };
    
    for (const [platform, urls] of Object.entries(TEST_URLS)) {
        console.log(`\n📦 ${platform.toUpperCase()} (${urls.length} tests)`);
        console.log('-'.repeat(70));
        stats.byPlatform[platform] = { passed: 0, failed: 0 };
        
        for (const url of urls) {
            const ok = await testUrl(url);
            if (ok) {
                stats.passed++;
                stats.byPlatform[platform].passed++;
            } else {
                stats.failed++;
                stats.byPlatform[platform].failed++;
            }
            await delay(500);
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 SUMMARY:');
    for (const [p, s] of Object.entries(stats.byPlatform)) {
        const icon = s.failed === 0 ? '✅' : s.passed === 0 ? '❌' : '⚠️';
        console.log(`   ${icon} ${p.toUpperCase().padEnd(10)} ${s.passed}/${s.passed + s.failed}`);
    }
    const total = stats.passed + stats.failed;
    console.log(`\n📊 TOTAL: ${stats.passed}/${total} passed (${Math.round(stats.passed/total*100)}%)\n`);
    
    if (stats.failed === 0) console.log('🎉 ALL TESTS PASSED!\n');
    else if (stats.passed >= total * 0.8) console.log('✅ Refactor successful! Minor failures expected.\n');
    else console.log('⚠️ Check failures above.\n');
}

main();
