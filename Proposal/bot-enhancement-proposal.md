# 🤖 DownAria Bot Enhancement Proposal

## Executive Summary

Proposal untuk meningkatkan UX Telegram Bot @downariaxt_bot dengan fitur download yang lebih interaktif - pilihan quality, audio only, dan handling multiple media.

---

## 📋 Current Issues

### 1. Database Schema Missing Column
```
Error: Could not find the 'last_download_at' column of 'bot_users'
```

### 2. Download Flow Kurang Interaktif
- Langsung download tanpa pilihan
- Tidak ada pilihan quality (HD/SD)
- Tidak ada opsi Audio Only
- Judul di-truncate (terlalu pendek)
- Multiple photos tidak di-handle dengan baik

---

## 🎯 New Download Flow

### Flow by Content Type

#### 1. Video (Non-YouTube) → Langsung Send + Quality Options
```
User: [sends TikTok/IG/FB/Twitter URL]
Bot: ⏳ Processing...
Bot: [LANGSUNG KIRIM VIDEO + Keyboard pilihan]
     **TikTok**
     Full title here...
     @author
     [🎬 HD] [📹 SD] [🎵 Audio] [🔗 Original]
```

#### 2. YouTube → Preview Thumbnail + Quality Options
```
User: [sends YouTube URL]
Bot: ⏳ Processing...
Bot: [THUMBNAIL + Info + Keyboard]
     **YouTube**
     Full title here...
     @channel
     [🎬 HD] [📹 SD] [🎵 Audio] [🔗 Original]
User: [pilih quality]
Bot: ⏳ Converting...
Bot: [sends video/audio]
```

#### 3. Photos (Single) → Langsung Send
```
User: [sends IG post with 1 photo]
Bot: ⏳ Processing...
Bot: [LANGSUNG KIRIM FOTO]
     **Instagram**
     Caption here...
     @author
     [� OriginDal]
```

#### 4. Photos (Multiple/Carousel) → Send as Album
```
User: [sends IG carousel with 4 photos]
Bot: ⏳ Processing...
Bot: [KIRIM SEMUA FOTO SEKALIGUS SEBAGAI ALBUM]
     Photo 1, Photo 2, Photo 3, Photo 4
     (Telegram Media Group - bukan slider!)
     
     **Instagram**
     Caption here...
     @author
     [🔗 Original]
```

---

## 🎨 Message Designs

### Video Message (Non-YouTube)
```
┌────────────────────────────────────┐
│ [📹 VIDEO LANGSUNG DIKIRIM]        │
│                                    │
│ **TikTok**                         │
│                                    │
│ Full Title Here Without Any        │
│ Truncation Because User Wants      │
│ To See The Complete Title          │
│                                    │
│ @username                          │
│                                    │
│ [🎬 HD] [📹 SD] [🎵 Audio]         │
│ [🔗 Original]                      │
└────────────────────────────────────┘
```

### YouTube Preview (Needs Conversion)
```
┌────────────────────────────────────┐
│ [🖼️ THUMBNAIL IMAGE]               │
│                                    │
│ **YouTube**                        │
│                                    │
│ Full Title Here Without Any        │
│ Truncation                         │
│                                    │
│ @channelname                       │
│                                    │
│ [🎬 HD] [📹 SD] [🎵 Audio]         │
│ [🔗 Original]                      │
└────────────────────────────────────┘
```

### Single Photo
```
┌────────────────────────────────────┐
│ [📷 FOTO LANGSUNG DIKIRIM]         │
│                                    │
│ **Instagram**                      │
│                                    │
│ Caption here...                    │
│ @username                          │
│                                    │
│ [🔗 Original]                      │
└────────────────────────────────────┘
```

### Multiple Photos (Album)
```
┌────────────────────────────────────┐
│ [📷 FOTO 1] [📷 FOTO 2]            │
│ [📷 FOTO 3] [📷 FOTO 4]            │
│ (Telegram Media Group)             │
│                                    │
│ **Instagram**                      │
│ Caption here...                    │
│ @username                          │
│                                    │
│ [🔗 Original]                      │
└────────────────────────────────────┘
```

---

## 📱 Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER SENDS URL                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Detect Content │
                    │      Type       │
                    └─────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ YouTube │          │  Video  │          │  Photo  │
   │         │          │(Others) │          │         │
   └─────────┘          └─────────┘          └─────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Send THUMBNAIL│    │ Send VIDEO    │    │ Single/Multi? │
│ + Quality Btns│    │ + Quality Btns│    └───────────────┘
└───────────────┘    └───────────────┘           │
        │                     │          ┌───────┴───────┐
        ▼                     │          ▼               ▼
┌───────────────┐             │    ┌──────────┐   ┌──────────┐
│ User selects  │             │    │  Single  │   │ Multiple │
│ HD/SD/Audio   │             │    │  Photo   │   │  Photos  │
└───────────────┘             │    └──────────┘   └──────────┘
        │                     │          │               │
        ▼                     │          ▼               ▼
┌───────────────┐             │    ┌──────────┐   ┌──────────┐
│ Convert &     │             │    │ Send     │   │ Send as  │
│ Send Media    │             │    │ Photo    │   │ Album    │
└───────────────┘             │    │ directly │   │ (Group)  │
        │                     │    └──────────┘   └──────────┘
        └─────────────────────┴──────────┴───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Done! Clean    │
                    │  user message   │
                    └─────────────────┘
```

---

## 📋 Command List

| Command | Description |
|---------|-------------|
| `/start` | Memulai bot & menampilkan welcome message |
| `/help` | Panduan penggunaan bot |
| `/menu` | Menampilkan menu utama dengan keyboard |
| `/mystatus` | Cek status download & premium |
| `/history` | Lihat riwayat download terakhir |
| `/premium` | Info langganan premium |
| `/privacy` | Kebijakan privasi pengguna |
| `/settings` | Pengaturan bot (bahasa, notifikasi) |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/stats` | Statistik bot |
| `/broadcast <msg>` | Kirim pesan ke semua user |
| `/ban <user_id>` | Ban user |
| `/unban <user_id>` | Unban user |
| `/givepremium <user_id>` | Berikan premium ke user |
| `/maintenance on/off` | Mode maintenance |

---

## � Privacy Policy (/privacy)

```
🔒 *Kebijakan Privasi DownAria Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Data yang Kami Simpan:*
• Telegram User ID (untuk identifikasi)
• Username (opsional, untuk display)
• Jumlah download harian
• Riwayat download (URL & platform)

*Data yang TIDAK Kami Simpan:*
• Pesan pribadi Anda
• Konten video yang didownload
• Informasi kontak lainnya

*Penggunaan Data:*
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

Dengan menggunakan bot ini, Anda menyetujui 
kebijakan privasi di atas.

Website: https://downaria.vercel.app
```

---

## 🏠 Menu Command (/menu)

```
📋 *Menu DownAria Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kirim link video dari platform berikut:

• **YouTube** - Video & Shorts
• **Instagram** - Reels, Posts, Stories
• **TikTok** - Video
• **Twitter/X** - Video tweets
• **Facebook** - Video & Reels
• **Weibo** - Video

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[📊 My Status] [📜 History]
[💎 Premium] [🔒 Privacy]
[🌐 Website] [❓ Help]
```

---

## 🔧 Technical Implementation

### 1. Content Type Detection

```typescript
type ContentType = 'video' | 'youtube' | 'photo_single' | 'photo_album';

function detectContentType(result: DownloadResult): ContentType {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const images = result.formats?.filter(f => f.type === 'image') || [];
    
    // YouTube always needs preview (conversion required)
    if (result.platform === 'youtube') {
        return 'youtube';
    }
    
    // Has video → send video directly
    if (videos.length > 0) {
        return 'video';
    }
    
    // Photos
    if (images.length > 1) {
        return 'photo_album';
    }
    
    return 'photo_single';
}
```

### 2. Send Media by Type

```typescript
async function sendMediaByType(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    const contentType = detectContentType(result);
    
    switch (contentType) {
        case 'youtube':
            // Send thumbnail + quality buttons (needs conversion)
            return await sendYouTubePreview(ctx, result, originalUrl);
            
        case 'video':
            // Send video directly + quality buttons for re-download
            return await sendVideoDirectly(ctx, result, originalUrl);
            
        case 'photo_album':
            // Send all photos as media group (album)
            return await sendPhotoAlbum(ctx, result, originalUrl);
            
        case 'photo_single':
            // Send single photo
            return await sendSinglePhoto(ctx, result, originalUrl);
    }
}
```

### 3. Send Photo Album (Media Group)

```typescript
async function sendPhotoAlbum(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    const images = result.formats?.filter(f => f.type === 'image') || [];
    
    if (images.length === 0) return false;
    
    // Build media group (max 10 photos per group)
    const mediaGroup: InputMediaPhoto[] = images.slice(0, 10).map((img, index) => ({
        type: 'photo',
        media: new InputFile({ url: img.url }),
        // Caption only on first photo
        caption: index === 0 ? buildCaption(result) : undefined,
        parse_mode: index === 0 ? 'Markdown' : undefined,
    }));
    
    try {
        // Send as album (media group)
        await ctx.replyWithMediaGroup(mediaGroup);
        
        // Send keyboard separately (can't attach to media group)
        await ctx.reply('📥 Download complete!', {
            reply_markup: new InlineKeyboard().url('🔗 Original', originalUrl),
        });
        
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_ALBUM');
        return false;
    }
}
```

### 4. Caption Builder (Full Title, Bold Platform)

```typescript
function buildCaption(result: DownloadResult): string {
    const name = botUrlGetPlatformName(result.platform!);
    
    let caption = `**${name}**\n\n`;
    
    // Full title (NO TRUNCATION!)
    if (result.title) {
        caption += `${result.title}\n`;
    }
    
    // Author
    if (result.author) {
        caption += `${result.author}`;
    }
    
    return caption;
}
```

### 5. Quality Keyboard (Video Only)

```typescript
function buildVideoKeyboard(
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    
    // Detect available qualities
    const hasHD = videos.some(v => 
        v.quality.includes('1080') || 
        v.quality.includes('720') || 
        v.quality.toLowerCase().includes('hd')
    );
    const hasSD = videos.some(v => 
        v.quality.includes('480') || 
        v.quality.includes('360') || 
        v.quality.toLowerCase().includes('sd')
    );
    
    // Row 1: Quality options
    if (hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
    if (hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
    keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
    
    // Row 2: Original URL
    keyboard.row();
    keyboard.url('🔗 Original', originalUrl);
    
    return keyboard;
}
```

---

## 📁 Files to Modify/Create

| File | Changes |
|------|---------|
| `src/bot/handlers/url.ts` | New flow by content type |
| `src/bot/handlers/callback.ts` | Handle `dl:*` callbacks |
| `src/bot/types.ts` | Update SessionData, add ContentType |
| `src/bot/commands/menu.ts` | NEW: /menu command |
| `src/bot/commands/privacy.ts` | NEW: /privacy command |
| `src/bot/keyboards/index.ts` | Export video keyboard |

---

## 🗄️ Database Fix

Run this SQL in Supabase:
```sql
ALTER TABLE bot_users 
ADD COLUMN IF NOT EXISTS last_download_at TIMESTAMPTZ;
```

---

## 📅 Implementation Steps

| Step | Task | Time |
|------|------|------|
| 1 | Fix DB schema (`last_download_at`) | 5 min |
| 2 | Create `/menu` command | 15 min |
| 3 | Create `/privacy` command | 10 min |
| 4 | Add `detectContentType()` | 10 min |
| 5 | Implement `sendVideoDirectly()` | 20 min |
| 6 | Implement `sendYouTubePreview()` | 25 min |
| 7 | Implement `sendPhotoAlbum()` | 25 min |
| 8 | Implement `sendSinglePhoto()` | 15 min |
| 9 | Update main URL handler | 20 min |
| 10 | Add callback handler for `dl:*` | 30 min |
| 11 | Test & debug | 30 min |

**Total: ~3.5 hours**

---

## ✅ Acceptance Criteria

- [ ] **Video (non-YT)**: Langsung kirim video + quality buttons
- [ ] **YouTube**: Kirim thumbnail preview + quality buttons → user pilih → convert & send
- [ ] **Single Photo**: Langsung kirim foto + Original URL button
- [ ] **Multiple Photos**: Kirim sebagai album (media group, bukan slider!)
- [ ] Preview shows **bold platform name** (no emoji)
- [ ] Preview shows FULL title (no truncation)
- [ ] Preview shows author
- [ ] Quality buttons: HD, SD, Audio (video only)
- [ ] Original URL button (always)
- [ ] `/menu` command shows main menu
- [ ] `/privacy` command shows privacy policy
- [ ] Stats NOT shown unless user requests via `/mystatus`

---

## 🔗 Links

- **Website**: https://downaria.vercel.app
- **Admin Contact**: @suntaw

---

## 🚀 Future Enhancements (Phase 2)

1. **Batch Download** - Send multiple URLs, download all
2. **Quality Preference** - Remember user's preferred quality
3. **Auto-download** - Option to skip preview for faster downloads
4. **File Size Display** - Show estimated size before download
5. **Language Selection** - Multi-language support

---

*Proposal by: Kiro AI Assistant*
*Date: December 26, 2024*
*Version: 2.2 - Smart Content Detection + Album Support*
