/**
 * Bot Internationalization (i18n)
 * Simple language support for Telegram bot
 * 
 * Supported: English (default), Bahasa Indonesia
 */

export type BotLanguage = 'en' | 'id';

// ============================================================================
// TRANSLATIONS
// ============================================================================

const translations = {
    en: {
        // Start command
        start_welcome: `*Welcome to DownAria Bot* 🎬

Your personal social media downloader.

*How to use:*
Just paste any video link and I'll download it for you.

*Supported platforms:*
• YouTube • Instagram • TikTok • Twitter/X
• Facebook • Weibo • BiliBili • Reddit
• SoundCloud • Pixiv
• Erome • Eporner • PornHub • Rule34Video

*Features:*
• HD & SD quality options
• Audio extraction
• Photo albums support
• Fast & reliable

Type /help for more info or /menu for options.`,

        start_welcome_back: `*Welcome back!* 👋

Just paste a video link to download.

/menu - Show options
/help - Usage guide`,

        // Menu
        menu_title: `📋 *DownAria Bot Menu*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Send a video link from:

• *YouTube* - Videos & Shorts
• *Instagram* - Reels, Posts, Stories
• *TikTok* - Videos
• *Twitter/X* - Video tweets
• *Facebook* - Videos & Reels
• *Weibo* - Videos
• *BiliBili, Reddit, SoundCloud*
• *Pixiv*
• *Erome, Eporner, PornHub, Rule34Video*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

        // Privacy
        privacy_title: `🔒 *Privacy Policy*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Data we store:*
• Telegram User ID (for identification)
• Username (optional, for display)
• Daily download count
• Download history (URL & platform)

*Data we DON'T store:*
• Your private messages
• Downloaded video content
• Other contact information

*Data usage:*
• Rate limiting
• Anonymous usage statistics
• Service improvement

*Your rights:*
• Request data deletion: contact @suntaw
• Auto-delete after 90 days of inactivity

*Security:*
• Data stored encrypted
• Not sold to third parties
• Admin-only access

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

By using this bot, you agree to this policy.

Website: https://downaria.vercel.app`,

        // Help
        help_title: `❓ *How to Use DownAria Bot*

*Step 1:* Copy a video link
*Step 2:* Paste it here
*Step 3:* Choose quality (if available)
*Step 4:* Download complete!

*Supported platforms:*
YouTube, Instagram, TikTok, Twitter/X, Facebook, Weibo,
BiliBili, Reddit, SoundCloud,
Pixiv, Erome, Eporner, PornHub, Rule34Video

*Commands:*
/start - Start bot
/menu - Show menu
/mystatus - Your stats
/history - Download history
/donate - Support & VIP info
/privacy - Privacy policy
/help - This message

*Limits (Free):*
• 8 downloads per day
• 4 second cooldown

*VIP (Donator):* Unlimited downloads, no cooldown

Contact: @suntaw`,

        // Download messages
        processing: '⏳ Processing {platform}...',
        download_complete: '📥 Download complete!',
        select_quality: '📥 Select quality:',
        select_quality_youtube: '📥 Select quality:\n\n⚠️ File sizes are estimates. Final size may differ after merge.',

        // Errors
        error_generic: '❌ Download failed. Please try again.',
        error_unsupported: '❌ Unsupported link.',
        error_rate_limit: '⏳ Please wait {seconds}s before next download.',
        error_limit_reached: '🚫 Limit reached ({used}/{limit}). Resets in {reset}.',
        error_banned: '🚫 Your account is suspended.',
        error_not_found: '❌ Media not found.',
        error_format_unavailable: '❌ Format not available.',
        error_session_expired: '⏰ Session expired. Please send the URL again.',

        // Unknown input
        unknown_command: `❓ Unknown command

Available commands:
/start - Start bot
/help - How to use
/menu - Show menu
/mystatus - Your stats
/history - Download history
/donate - Support & VIP`,

        unknown_text: `🔗 Send me a video link!

Supported: YouTube, Instagram, TikTok, X, Facebook, Weibo

Type /help for more info.`,

        // Quality buttons
        btn_hd: '🎬 HD',
        btn_sd: '📹 SD',
        btn_audio: '🎵 Audio',
        btn_original: '🔗 Original',
        btn_cancel: '❌ Cancel',
        btn_retry: '🔄 Retry',

        // Menu buttons
        btn_mystatus: '📊 My Status',
        btn_history: '📜 History',
        btn_donate: '💝 Donate',
        btn_privacy: '🔒 Privacy',
        btn_website: '🌐 Website',
        btn_help: '❓ Help',
        btn_menu: '📋 Menu',
        btn_language: '🌐 Language',

        // Filesize
        filesize_unknown: 'Size unknown',
    },

    id: {
        // Start command
        start_welcome: `*Selamat datang di DownAria Bot* 🎬

Downloader media sosial pribadi Anda.

*Cara pakai:*
Cukup tempel link video dan saya akan mendownloadnya.

*Platform yang didukung:*
• YouTube • Instagram • TikTok
• Twitter/X • Facebook • Weibo

*Fitur:*
• Pilihan kualitas HD & SD
• Ekstrak audio
• Dukungan album foto
• Cepat & handal

Ketik /help untuk info lebih lanjut atau /menu untuk opsi.`,

        start_welcome_back: `*Selamat datang kembali!* 👋

Tempel link video untuk download.

/menu - Tampilkan opsi
/help - Panduan penggunaan`,

        // Menu
        menu_title: `📋 *Menu DownAria Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kirim link video dari:

• *YouTube* - Video & Shorts
• *Instagram* - Reels, Posts, Stories
• *TikTok* - Video
• *Twitter/X* - Video tweets
• *Facebook* - Video & Reels
• *Weibo* - Video

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

        // Privacy
        privacy_title: `🔒 *Kebijakan Privasi*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Data yang kami simpan:*
• Telegram User ID (untuk identifikasi)
• Username (opsional, untuk display)
• Jumlah download harian
• Riwayat download (URL & platform)

*Data yang TIDAK kami simpan:*
• Pesan pribadi Anda
• Konten video yang didownload
• Informasi kontak lainnya

*Penggunaan data:*
• Rate limiting (batasan download)
• Statistik penggunaan (anonim)
• Peningkatan layanan

*Hak Anda:*
• Minta hapus data: hubungi @suntaw
• Data dihapus otomatis setelah 90 hari tidak aktif

*Keamanan:*
• Data disimpan terenkripsi
• Tidak dijual ke pihak ketiga
• Akses terbatas hanya untuk admin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dengan menggunakan bot ini, Anda menyetujui kebijakan ini.

Website: https://downaria.vercel.app`,

        // Help
        help_title: `❓ *Cara Menggunakan DownAria Bot*

*Langkah 1:* Salin link video
*Langkah 2:* Tempel di sini
*Langkah 3:* Pilih kualitas (jika tersedia)
*Langkah 4:* Download selesai!

*Platform yang didukung:*
YouTube, Instagram, TikTok, Twitter/X, Facebook, Weibo

*Perintah:*
/start - Mulai bot
/menu - Tampilkan menu
/mystatus - Status Anda
/history - Riwayat download
/donate - Donasi & info VIP
/privacy - Kebijakan privasi
/help - Pesan ini

*Batasan (Gratis):*
• 8 download per hari
• Jeda 4 detik

*VIP (Donatur):* Download tanpa batas, tanpa jeda

Kontak: @suntaw`,

        // Download messages
        processing: '⏳ Memproses {platform}...',
        download_complete: '📥 Download selesai!',
        select_quality: '📥 Pilih kualitas:',
        select_quality_youtube: '📥 Pilih kualitas:\n\n⚠️ Ukuran file adalah estimasi. Hasil akhir bisa berbeda setelah proses merge.',

        // Errors
        error_generic: '❌ Download gagal. Silakan coba lagi.',
        error_unsupported: '❌ Link tidak didukung.',
        error_rate_limit: '⏳ Tunggu {seconds} detik sebelum download berikutnya.',
        error_limit_reached: '🚫 Batas tercapai ({used}/{limit}). Reset dalam {reset}.',
        error_banned: '🚫 Akun Anda ditangguhkan.',
        error_not_found: '❌ Media tidak ditemukan.',
        error_format_unavailable: '❌ Format tidak tersedia.',
        error_session_expired: '⏰ Sesi berakhir. Silakan kirim URL lagi.',

        // Unknown input
        unknown_command: `❓ Perintah tidak dikenal

Perintah tersedia:
/start - Mulai bot
/help - Cara pakai
/menu - Tampilkan menu
/mystatus - Status Anda
/history - Riwayat download
/donate - Donasi & VIP`,

        unknown_text: `🔗 Kirim link video!

Didukung: YouTube, Instagram, TikTok, X, Facebook, Weibo

Ketik /help untuk info lebih lanjut.`,

        // Quality buttons
        btn_hd: '🎬 HD',
        btn_sd: '📹 SD',
        btn_audio: '🎵 Audio',
        btn_original: '🔗 Asli',
        btn_cancel: '❌ Batal',
        btn_retry: '🔄 Coba Lagi',

        // Menu buttons
        btn_mystatus: '📊 Status Saya',
        btn_history: '📜 Riwayat',
        btn_donate: '💝 Donasi',
        btn_privacy: '🔒 Privasi',
        btn_website: '🌐 Website',
        btn_help: '❓ Bantuan',
        btn_menu: '📋 Menu',
        btn_language: '🌐 Bahasa',

        // Filesize
        filesize_unknown: 'Ukuran tidak diketahui',
    },
} as const;

type TranslationKey = keyof typeof translations.en;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect language from Telegram language_code
 * Returns 'id' for Indonesian, 'en' for everything else
 */
export function detectLanguage(languageCode?: string): BotLanguage {
    if (!languageCode) return 'en';
    
    // Indonesian
    if (languageCode.startsWith('id') || languageCode.startsWith('in')) {
        return 'id';
    }
    
    return 'en';
}

/**
 * Get translation by key
 */
export function t(key: TranslationKey, lang: BotLanguage = 'en', params?: Record<string, string | number>): string {
    let text: string = translations[lang]?.[key] || translations.en[key] || key;
    
    // Replace parameters
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
    }
    
    return text;
}

/**
 * Format filesize to human readable
 */
export function formatFilesize(bytes?: number, lang: BotLanguage = 'en'): string {
    if (!bytes || bytes <= 0) {
        return t('filesize_unknown', lang);
    }
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// escapeMarkdown is now in helpers/caption.ts
export { escapeMarkdown as escapeMarkdownV2 } from '../helpers';

export { translations };
export type { TranslationKey };
