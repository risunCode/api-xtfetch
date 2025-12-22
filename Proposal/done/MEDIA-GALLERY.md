# Media Gallery Component Proposal

## Overview
Unified media gallery component untuk preview dan download media dari hasil scraping. Responsive design dengan behavior berbeda untuk mobile dan desktop.

---

## Design Goals

1. **Unified Component** - Satu component untuk semua platform (FB, IG, TW, TT, Weibo, YT)
2. **Responsive** - Desktop: Modal overlay, Mobile: Fullscreen
3. **Performance** - Lazy loading, optimized thumbnails
4. **UX** - Smooth animations, intuitive gestures

---

## Component Structure

```
src/components/media/
├── MediaGallery.tsx        # Main gallery component
├── MediaModal.tsx          # Desktop modal wrapper
├── MediaFullscreen.tsx     # Mobile fullscreen wrapper
├── MediaPreview.tsx        # Individual media preview
├── MediaActions.tsx        # Download/share action buttons
├── MediaCarousel.tsx       # Swipeable carousel for multi-item
└── index.ts                # Barrel export
```

---

## UI/UX Specification

### Desktop (≥768px) - Modal Style

```
┌─────────────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║                                                       ║  │
│  ║                    [X] Close                          ║  │
│  ║  ┌─────────────────────────────────────────────────┐  ║  │
│  ║  │                                                 │  ║  │
│  ║  │                                                 │  ║  │
│  ║  │              MEDIA PREVIEW                      │  ║  │
│  ║  │           (Video/Image/Carousel)                │  ║  │
│  ║  │                                                 │  ║  │
│  ║  │    [◀]                              [▶]         │  ║  │
│  ║  │                                                 │  ║  │
│  ║  └─────────────────────────────────────────────────┘  ║  │
│  ║                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────┐  ║  │
│  ║  │ @author · Platform                              │  ║  │
│  ║  │ Caption text here...                            │  ║  │
│  ║  │                                                 │  ║  │
│  ║  │ ❤️ 1.2K  💬 234  🔄 56  👁️ 10K                   │  ║  │
│  ║  └─────────────────────────────────────────────────┘  ║  │
│  ║                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────┐  ║  │
│  ║  │ Quality: [HD 1080p] [SD 720p] [Audio]           │  ║  │
│  ║  │                                                 │  ║  │
│  ║  │ [📥 Download (12.5 MB)]  [📤 Discord]  [🔗 Copy] │  ║  │
│  ║  └─────────────────────────────────────────────────┘  ║  │
│  ║                                                       ║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│                     (backdrop blur)                         │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Centered modal with backdrop blur
- Click outside to close
- Keyboard navigation (Esc, Arrow keys)
- Max width: 800px, Max height: 90vh
- Smooth scale-in animation

---

### Mobile (<768px) - Fullscreen Style

```
┌─────────────────────────────┐
│ ← Back            ⋮ More    │  ← Header (sticky)
├─────────────────────────────┤
│                             │
│                             │
│                             │
│      MEDIA PREVIEW          │
│    (Full width, 16:9)       │
│                             │
│         ● ○ ○ ○             │  ← Carousel dots
│                             │
├─────────────────────────────┤
│ @author                     │
│ Platform · 2h ago           │
│                             │
│ Caption text here that can  │
│ be multiple lines...        │
│                             │
│ ❤️ 1.2K  💬 234  👁️ 10K     │
├─────────────────────────────┤
│ Quality                     │
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ HD  │ │ SD  │ │ MP3 │    │
│ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────┤
│                             │
│  [  📥 Download (12.5 MB)  ]│  ← Primary action
│                             │
│  [Discord]        [Copy]    │  ← Secondary actions
│                             │
└─────────────────────────────┘
```

**Features:**
- Full screen overlay (100vh)
- Swipe gestures (left/right for carousel, down to close)
- Bottom sheet style actions
- Safe area padding for notch devices

---

## Component Props

```typescript
interface MediaGalleryProps {
  // Data
  data: MediaData;
  platform: Platform;
  
  // State
  isOpen: boolean;
  onClose: () => void;
  
  // Optional
  initialIndex?: number;        // For carousel, start at specific item
  onDownloadComplete?: (entry: HistoryEntry) => void;
  
  // Customization
  showEngagement?: boolean;     // Show likes/comments/views
  showAuthor?: boolean;         // Show author info
  allowDiscord?: boolean;       // Show Discord button
}

interface MediaData {
  title: string;
  description?: string;
  author?: string;
  thumbnail?: string;
  url: string;                  // Source URL
  formats: MediaFormat[];
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
  responseTime?: number;
  usedCookie?: boolean;
}

interface MediaFormat {
  url: string;
  quality: string;              // "HD 1080p", "SD 720p", "Audio"
  type: 'video' | 'image' | 'audio';
  format?: string;              // "mp4", "jpg", "mp3"
  size?: string;                // "12.5 MB"
  thumbnail?: string;           // For carousel items
  itemId?: string;              // For carousel grouping
}
```

---

## Responsive Behavior

```typescript
// Hook for responsive detection
function useMediaGalleryMode(): 'modal' | 'fullscreen' {
  const [mode, setMode] = useState<'modal' | 'fullscreen'>('modal');
  
  useEffect(() => {
    const checkMode = () => {
      setMode(window.innerWidth < 768 ? 'fullscreen' : 'modal');
    };
    
    checkMode();
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);
  
  return mode;
}

// Main component
export function MediaGallery(props: MediaGalleryProps) {
  const mode = useMediaGalleryMode();
  
  if (!props.isOpen) return null;
  
  return mode === 'fullscreen' 
    ? <MediaFullscreen {...props} />
    : <MediaModal {...props} />;
}
```

---

## Animations

### Desktop Modal
```typescript
// Framer Motion variants
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};
```

### Mobile Fullscreen
```typescript
// Slide up animation
const fullscreenVariants = {
  hidden: { y: '100%' },
  visible: { y: 0 },
  exit: { y: '100%' }
};

// Swipe to close
const handleDragEnd = (event, info) => {
  if (info.offset.y > 100) {
    onClose();
  }
};
```

---

## Carousel Implementation

```typescript
interface CarouselState {
  currentIndex: number;
  items: MediaFormat[];
}

// Features:
// - Touch swipe (mobile)
// - Arrow keys (desktop)
// - Click arrows (desktop)
// - Dot indicators
// - Preload adjacent items
// - Thumbnail strip (desktop, optional)
```

---

## Download Progress Integration

```typescript
// Reuse existing download logic from DownloadPreview
// Show progress bar in action button

<Button onClick={handleDownload}>
  {isDownloading ? (
    <>
      <ProgressRing percent={progress} />
      {progress}% · {speed} MB/s
    </>
  ) : (
    <>
      <Download /> Download ({fileSize})
    </>
  )}
</Button>
```

---

## Accessibility

- **Keyboard Navigation**
  - `Esc` - Close gallery
  - `←` `→` - Navigate carousel
  - `Tab` - Focus action buttons
  - `Enter` - Activate focused button

- **Screen Reader**
  - `role="dialog"` with `aria-modal="true"`
  - `aria-label` for all buttons
  - Image alt text from caption/title

- **Focus Trap**
  - Focus stays within modal when open
  - Return focus to trigger element on close

---

## File Size Estimation

```typescript
// Fetch file size via HEAD request (existing logic)
async function getFileSize(url: string, platform: string): Promise<string> {
  const res = await fetch(`/api/proxy?url=${url}&platform=${platform}&head=1`);
  const size = res.headers.get('x-file-size');
  return size ? formatBytes(parseInt(size)) : 'Unknown';
}
```

---

## Integration Points

### 1. Homepage (DownloadForm result)
```tsx
<MediaGallery
  isOpen={!!mediaData}
  onClose={() => setMediaData(null)}
  data={mediaData}
  platform={detectedPlatform}
  onDownloadComplete={handleHistoryAdd}
/>
```

### 2. History Page (View past downloads)
```tsx
<MediaGallery
  isOpen={!!selectedHistory}
  onClose={() => setSelectedHistory(null)}
  data={selectedHistory}
  platform={selectedHistory.platform}
/>
```

### 3. Share Page (Shared links)
```tsx
<MediaGallery
  isOpen={true}
  onClose={() => router.push('/')}
  data={sharedData}
  platform={sharedPlatform}
/>
```

---

## Migration Plan

1. **Phase 1**: Create base components
   - MediaGallery, MediaModal, MediaFullscreen
   - Basic open/close functionality

2. **Phase 2**: Add media preview
   - Video player with controls
   - Image viewer with zoom
   - Carousel for multi-item

3. **Phase 3**: Add actions
   - Quality selector
   - Download with progress
   - Discord integration

4. **Phase 4**: Replace DownloadPreview
   - Update homepage to use MediaGallery
   - Migrate all download logic

5. **Phase 5**: Polish
   - Animations
   - Gestures
   - Accessibility audit

---

## Dependencies

- `framer-motion` - Animations (already installed)
- `react-swipeable` - Touch gestures (optional, can use framer-motion drag)
- Existing: `@/lib/utils/format-utils`, `@/lib/storage`, `@/lib/utils/discord-webhook`

---

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1 | 2-3 hours | High |
| Phase 2 | 3-4 hours | High |
| Phase 3 | 2-3 hours | High |
| Phase 4 | 2-3 hours | Medium |
| Phase 5 | 2-3 hours | Low |

**Total: ~12-16 hours**

---

## Open Questions

1. **Video Autoplay** - Autoplay on open or require user interaction?
2. **Zoom** - Pinch-to-zoom for images on mobile?
3. **Thumbnail Strip** - Show all carousel items as thumbnails on desktop?
4. **Share Button** - Add native share API integration?
5. **Keyboard Shortcuts** - Add more shortcuts (Space for play/pause)?

---

*Proposal by: Kiro + Developer*
*Date: December 21, 2025*
