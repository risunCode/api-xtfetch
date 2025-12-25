/**
 * /privacy command - Shows privacy policy
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';

export const privacyComposer = new Composer<BotContext>();

const PRIVACY_MESSAGE = `🔒 *Kebijakan Privasi DownAria Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Data yang Kami Simpan:*
• Telegram User ID \\(untuk identifikasi\\)
• Username \\(opsional, untuk display\\)
• Jumlah download harian
• Riwayat download \\(URL & platform\\)

*Data yang TIDAK Kami Simpan:*
• Pesan pribadi Anda
• Konten video yang didownload
• Informasi kontak lainnya

*Penggunaan Data:*
• Rate limiting \\(batasan download\\)
• Statistik penggunaan \\(anonim\\)
• Peningkatan layanan

*Hak Anda:*
• Minta hapus data: hubungi @suntaw
• Data dihapus otomatis setelah 90 hari tidak aktif

*Keamanan:*
• Data disimpan terenkripsi
• Tidak dijual ke pihak ketiga
• Akses terbatas hanya untuk admin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dengan menggunakan bot ini, Anda menyetujui kebijakan privasi di atas\\.

Website: https://downaria\\.vercel\\.app`;

const privacyKeyboard = new InlineKeyboard()
    .url('🌐 Website', 'https://downaria.vercel.app')
    .text('📋 Menu', 'cmd:menu');

privacyComposer.command('privacy', async (ctx) => {
    await ctx.reply(PRIVACY_MESSAGE, {
        parse_mode: 'MarkdownV2',
        reply_markup: privacyKeyboard,
    });
});
