# Audit Report: MediaGallery.tsx

**File**: `src/components/media/MediaGallery.tsx`
**Priority**: 🔴 Critical
**Lines**: ~480

---

## 🔍 Issues Found

### 1. 🔴 `backdrop-blur-sm` in Modal and Fullscreen Wrappers

#### ModalWrapper (Line 413)
```tsx
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
```

#### FullscreenWrapper Header (Line 447)
```tsx
className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[var(--bg-primary)]/90 backdrop-blur-sm border-b border-[var(--border-color)]"
```

**Problem**: `backdrop-blur` is expensive on mobile, especially on full-screen overlays.

**Impact**: HIGH - Affects every gallery open.

**Fix**:
```tsx
// ModalWrapper - remove blur
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"

// FullscreenWrapper - use solid background
className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[var(--bg-primary)] border-b border-[var(--border-color)]"
```

---

### 2. 🔴 File Size Fetching in useEffect (Lines 113-126)
```tsx
useEffect(() => {
  const fetchSizes = async () => {
    for (const format of currentFormats) {
      const key = format.url;
      if (fileSizes[key]) continue;
      try {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(format.url)}&platform=${platform}&head=1`);
        const size = res.headers.get('x-file-size');
        if (size && parseInt(size) > 0) {
          setFileSizes(prev => ({ ...prev, [key]: formatBytes(parseInt(size)) }));
        }
      } catch { /* ignore */ }
    }
  };
  if (isOpen) fetchSizes();
}, [currentFormats, platform, isOpen, fileSizes]);
```

**Problem**: 
1. Sequential fetches (one by one) - slow
2. `fileSizes` in dependency array causes infinite loop potential
3. State update for each format causes re-renders

**Impact**: HIGH - Multiple network requests + re-renders.

**Fix**:
```tsx
// Remove fileSizes from deps, use ref to track fetched
const fetchedUrls = useRef<Set<string>>(new Set());

useEffect(() => {
  if (!isOpen) return;
  
  const fetchSizes = async () => {
    const unfetched = currentFormats.filter(f => !fetchedUrls.current.has(f.url));
    if (unfetched.length === 0) return;
    
    // Parallel fetch
    const results = await Promise.allSettled(
      unfetched.map(async (format) => {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(format.url)}&platform=${platform}&head=1`);
        const size = res.headers.get('x-file-size');
        return { url: format.url, size: size ? formatBytes(parseInt(size)) : null };
      })
    );
    
    // Batch state update
    const newSizes: Record<string, string> = {};
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value.size) {
        newSizes[result.value.url] = result.value.size;
        fetchedUrls.current.add(unfetched[idx].url);
      }
    });
    
    if (Object.keys(newSizes).length > 0) {
      setFileSizes(prev => ({ ...prev, ...newSizes }));
    }
  };
  
  fetchSizes();
}, [currentFormats, platform, isOpen]);
```

---

### 3. 🔴 Download Progress Updates Too Frequent (Lines 165-185)
```tsx
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  loaded += value.length;

  const now = Date.now();
  const timeDiff = now - lastTime;
  let speed = downloadState.speed;

  if (timeDiff >= 500) {
    speed = ((loaded - lastLoaded) / timeDiff) * 1000;
    lastTime = now;
    lastLoaded = loaded;
  }

  const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
  setDownloadState({ status: 'downloading', progress, speed, loaded, total });
}
```

**Problem**: `setDownloadState` called on EVERY chunk read. Could be hundreds of times per second.

**Impact**: CRITICAL - Massive re-renders during download.

**Fix**:
```tsx
// Throttle state updates
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100; // Update UI every 100ms

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  loaded += value.length;

  const now = Date.now();
  
  // Only update state every 100ms
  if (now - lastUpdateTime >= UPDATE_INTERVAL) {
    const timeDiff = now - lastTime;
    if (timeDiff >= 500) {
      speed = ((loaded - lastLoaded) / timeDiff) * 1000;
      lastTime = now;
      lastLoaded = loaded;
    }
    
    const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
    setDownloadState({ status: 'downloading', progress, speed, loaded, total });
    lastUpdateTime = now;
  }
}
```

---

### 4. 🟡 `groupFormatsByItem` Called Every Render (Line 89)
```tsx
const groupedItems = groupFormatsByItem(data.formats || []);
```

**Problem**: Grouping logic runs on every render.

**Impact**: MEDIUM

**Fix**:
```tsx
const groupedItems = useMemo(() => 
  groupFormatsByItem(data.formats || []),
  [data.formats]
);
```

---

### 5. 🟡 `useMediaGalleryMode` Resize Listener (Lines 39-50)
```tsx
useEffect(() => {
  const checkMode = () => {
    setMode(window.innerWidth < 768 ? 'fullscreen' : 'modal');
  };
  checkMode();
  window.addEventListener('resize', checkMode);
  return () => window.removeEventListener('resize', checkMode);
}, []);
```

**Problem**: Resize event fires rapidly during resize. No debounce.

**Impact**: MEDIUM

**Fix**:
```tsx
useEffect(() => {
  let timeoutId: NodeJS.Timeout;
  
  const checkMode = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      setMode(window.innerWidth < 768 ? 'fullscreen' : 'modal');
    }, 100);
  };
  
  checkMode();
  window.addEventListener('resize', checkMode);
  return () => {
    window.removeEventListener('resize', checkMode);
    clearTimeout(timeoutId);
  };
}, []);
```

---

### 6. 🟡 Video Autoplay on Mobile (Line 290)
```tsx
<video
  src={`/api/proxy?url=${encodeURIComponent(selectedFormat.url)}&platform=${platform}&inline=1`}
  poster={currentThumbnail ? getProxiedThumbnail(currentThumbnail, platform) : undefined}
  className="w-full h-full object-contain"
  controls
  autoPlay
  loop
  playsInline
/>
```

**Problem**: `autoPlay` + `loop` on mobile can be resource intensive. Video starts playing immediately.

**Impact**: MEDIUM - Battery drain, data usage.

**Fix**:
```tsx
// Only autoplay on desktop, or require user interaction on mobile
<video
  src={...}
  poster={...}
  className="w-full h-full object-contain"
  controls
  autoPlay={mode === 'modal'} // Only autoplay on desktop
  loop={mode === 'modal'}
  playsInline
/>
```

---

### 7. 🟡 Thumbnail Images Not Lazy Loaded (Lines 320-330)
```tsx
{itemIds.map((itemId, idx) => {
  // ...
  return (
    <button key={idx} ...>
      {thumb ? (
        <Image
          src={getProxiedThumbnail(thumb, platform)}
          alt={`Item ${idx + 1}`}
          fill
          className="object-cover"
          unoptimized
        />
      ) : ...}
    </button>
  );
})}
```

**Problem**: All carousel thumbnails load immediately, even if not visible.

**Impact**: MEDIUM - Unnecessary network requests.

**Fix**:
```tsx
<Image
  src={getProxiedThumbnail(thumb, platform)}
  alt={`Item ${idx + 1}`}
  fill
  className="object-cover"
  unoptimized
  loading="lazy" // Add lazy loading
/>
```

---

### 8. 🟢 Framer Motion Drag on FullscreenWrapper (Lines 437-445)
```tsx
<motion.div
  key="fullscreen"
  initial={{ y: '100%' }}
  animate={{ y: 0 }}
  exit={{ y: '100%' }}
  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
  drag="y"
  dragConstraints={{ top: 0, bottom: 0 }}
  dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.y > 100) onClose();
  }}
  ...
>
```

**Problem**: Drag gesture tracking on full-screen element. Can be janky on low-end devices.

**Impact**: LOW-MEDIUM

**Fix**: Consider removing drag-to-close on very low-end devices, or use CSS-based solution.

---

## 📊 Summary

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| backdrop-blur in wrappers | 🔴 Critical | HIGH | Easy |
| File size fetch loop | 🔴 Critical | HIGH | Medium |
| Download progress spam | 🔴 Critical | CRITICAL | Easy |
| groupFormatsByItem no memo | 🟡 Medium | MEDIUM | Easy |
| Resize listener no debounce | 🟡 Medium | MEDIUM | Easy |
| Video autoplay on mobile | 🟡 Medium | MEDIUM | Easy |
| Thumbnails not lazy | 🟡 Medium | MEDIUM | Easy |
| Drag gesture overhead | 🟢 Low | LOW-MEDIUM | Medium |

---

## ✅ Recommended Fixes (Priority Order)

1. **Throttle download progress updates** - Immediate impact
2. **Remove backdrop-blur** - Easy win
3. **Batch file size fetches** - Reduce network + re-renders
4. **Memoize groupFormatsByItem** - Easy
5. **Debounce resize listener** - Easy
6. **Conditional video autoplay** - Easy
7. **Lazy load thumbnails** - Easy

---

## 🔧 Quick Wins Code

```tsx
// 1. Throttle download progress (add before while loop)
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 100;

// Inside while loop, wrap setDownloadState:
if (Date.now() - lastUpdateTime >= UPDATE_INTERVAL) {
  setDownloadState({ ... });
  lastUpdateTime = Date.now();
}

// 2. Remove backdrop-blur
// ModalWrapper:
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"

// 3. Memoize grouping
const groupedItems = useMemo(() => groupFormatsByItem(data.formats || []), [data.formats]);

// 4. Conditional autoplay
autoPlay={mode === 'modal'}
loop={mode === 'modal'}
```

---

*Audited: December 21, 2025*
