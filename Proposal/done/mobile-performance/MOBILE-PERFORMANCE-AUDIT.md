# Mobile Performance Audit Proposal

> **Issue**: UI lag dan berat di ponsel, padahal di laptop lancar
> **Suspected Causes**: Memory leak, excessive re-renders, heavy animations, unoptimized images, large bundle size

---

## 📋 Audit Scope

### Priority Levels
- 🔴 **Critical** - Likely causing major performance issues
- 🟡 **Medium** - Potential contributors to lag
- 🟢 **Low** - Minor optimizations

---

## 🔴 CRITICAL - Core UI Components

### 1. `src/components/Sidebar.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] useStatus() SWR hook - polling interval?
- [ ] Platform status mapping on every render
- [ ] AnimatePresence for mobile sidebar
- [ ] Theme dropdown with AnimatePresence
- [ ] Multiple useEffect hooks

**Recommendations**:
- [ ] Memoize platform config
- [ ] Check SWR revalidation settings
- [ ] Consider CSS transitions instead of Framer Motion for simple animations

---

### 2. `src/components/DownloadForm.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] URL validation on every keystroke
- [ ] Platform detection logic
- [ ] State updates frequency
- [ ] Animation on input focus

**Recommendations**:
- [ ] Debounce URL validation
- [ ] Memoize platform detection
- [ ] Use useCallback for handlers

---

### 3. `src/components/DownloadPreview.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Image loading without lazy load
- [ ] Video preview autoplay
- [ ] Download progress tracking
- [ ] Multiple format buttons re-rendering

**Recommendations**:
- [ ] Lazy load images
- [ ] Optimize video preview
- [ ] Memoize format list

---

### 4. `src/components/media/MediaGallery.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Multiple useEffect hooks
- [ ] File size fetching for each format
- [ ] Image loading in thumbnail strip
- [ ] Video autoplay on mobile
- [ ] Download progress state updates

**Recommendations**:
- [ ] Batch file size requests
- [ ] Lazy load thumbnails
- [ ] Optimize video handling for mobile

---

### 5. `src/components/HistoryList.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Rendering large lists without virtualization
- [ ] Image thumbnails loading
- [ ] IndexedDB queries
- [ ] Search/filter on every keystroke

**Recommendations**:
- [ ] Implement virtual scrolling for large lists
- [ ] Debounce search
- [ ] Paginate results

---

## 🟡 MEDIUM - Page Components

### 6. `src/app/page.tsx` (Home)
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Multiple hooks initialization
- [ ] Announcements fetching
- [ ] Service worker registration
- [ ] Animation on mount

---

### 7. `src/app/history/page.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] IndexedDB loading all history
- [ ] No pagination
- [ ] Export/Import large data

---

### 8. `src/app/settings/page.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Multiple tabs with heavy content
- [ ] Cookie status fetching
- [ ] Storage calculations

---

### 9. `src/app/advanced/page.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Multiple tabs (playground, fb-html, proxy, ai-chat)
- [ ] Rate limit polling
- [ ] Result rendering with JSON

---

## 🟡 MEDIUM - Hooks & State Management

### 10. `src/hooks/useStatus.ts`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] SWR polling interval
- [ ] Revalidation on focus
- [ ] Data transformation on every fetch

---

### 11. `src/hooks/useAnnouncements.ts`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Fetching on every page
- [ ] LocalStorage read/write frequency

---

### 12. `src/hooks/useUpdatePrompt.ts`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Service worker event listeners
- [ ] State updates

---

## 🟡 MEDIUM - Animation & Styling

### 13. `src/app/globals.css`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Complex CSS animations
- [ ] Backdrop blur effects (expensive on mobile)
- [ ] Gradient animations
- [ ] Box shadows

---

### 14. `src/components/AnimatedHeroText.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Text animation on home page
- [ ] Framer Motion variants

---

## 🟢 LOW - Supporting Components

### 15. `src/components/Header.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Mobile menu animation
- [ ] Platform icons rendering

---

### 16. `src/components/Announcements.tsx`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Animation on show/hide
- [ ] Multiple announcements rendering

---

### 17. `src/components/ui/` (UI Components)
**Status**: 🔍 Pending Audit
**Files**:
- Button.tsx
- Card.tsx
- Modal.tsx
- LoadingSpinner.tsx
- Skeleton.tsx

---

## 🔧 Storage & Data Layer

### 18. `src/lib/storage/indexed-db.ts`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Database initialization
- [ ] Query performance
- [ ] Data migration

---

### 19. `src/lib/storage/local-storage-db.ts`
**Status**: 🔍 Pending Audit
**Potential Issues**:
- [ ] Frequent read/write
- [ ] JSON parse/stringify overhead

---

## 📊 Audit Checklist

### Performance Metrics to Check
- [ ] First Contentful Paint (FCP)
- [ ] Largest Contentful Paint (LCP)
- [ ] Time to Interactive (TTI)
- [ ] Total Blocking Time (TBT)
- [ ] Cumulative Layout Shift (CLS)
- [ ] Memory usage over time
- [ ] JavaScript bundle size

### Common Issues to Look For
1. **Memory Leaks**
   - Event listeners not cleaned up
   - Intervals/timeouts not cleared
   - Subscriptions not unsubscribed
   - Large objects in closure

2. **Excessive Re-renders**
   - Missing useMemo/useCallback
   - Inline object/array props
   - Context updates triggering full tree re-render

3. **Heavy Animations**
   - Framer Motion on mobile
   - CSS backdrop-filter (blur)
   - Transform animations without will-change

4. **Image/Media Issues**
   - Unoptimized images
   - Missing lazy loading
   - Video autoplay on mobile

5. **Bundle Size**
   - Large dependencies
   - No code splitting
   - Unused imports

---

## 📁 Audit Reports (Per File)

Each file will have its own detailed report in:
```
Proposal/audit/
├── 01-sidebar.md
├── 02-download-form.md
├── 03-download-preview.md
├── 04-media-gallery.md
├── 05-history-list.md
├── 06-home-page.md
├── 07-history-page.md
├── 08-settings-page.md
├── 09-advanced-page.md
├── 10-hooks.md
├── 11-globals-css.md
├── 12-storage.md
└── summary.md
```

---

## 🎯 Expected Outcomes

1. **Identify** specific code causing mobile lag
2. **Document** each issue with line numbers
3. **Propose** fixes with code examples
4. **Prioritize** fixes by impact
5. **Implement** fixes incrementally

---

## 📅 Audit Progress

| # | File | Status | Issues Found | Severity |
|---|------|--------|--------------|----------|
| 1 | Sidebar.tsx | ✅ Done | 8 issues | 🔴 2 Critical |
| 2 | DownloadForm.tsx | ✅ Done | 8 issues | 🔴 3 Critical |
| 3 | DownloadPreview.tsx | ⏳ Pending | - | - |
| 4 | MediaGallery.tsx | ✅ Done | 8 issues | 🔴 3 Critical |
| 5 | HistoryList.tsx | ⏳ Pending | - | - |
| 6 | page.tsx (Home) | ⏳ Pending | - | - |
| 7 | history/page.tsx | ⏳ Pending | - | - |
| 8 | settings/page.tsx | ⏳ Pending | - | - |
| 9 | advanced/page.tsx | ⏳ Pending | - | - |
| 10 | Hooks (SWR) | ✅ Done | 1 minor | 🟢 Good |
| 11 | globals.css | ✅ Done | 8 issues | 🔴 3 Critical |
| 12 | Storage | ⏳ Pending | - | - |
| 13 | Admin Console | ✅ Done | 9 issues | 🔴 2 Critical |

---

## 🚨 Critical Issues Summary

### ✅ FIXED - Immediate Fixes Applied

| Issue | File | Line | Status |
|-------|------|------|--------|
| `backdrop-blur-md` on mobile header | Sidebar.tsx | 97 | ✅ Fixed |
| `backdrop-blur-sm` on overlay | Sidebar.tsx | 196 | ✅ Fixed |
| Timer updates every 50ms | DownloadForm.tsx | 72 | ✅ Fixed (1000ms) |
| `animate-spin-slow` always running | DownloadForm.tsx | 224 | ✅ Fixed (only when loading) |
| Tips rotation every 3s | DownloadForm.tsx | 103 | ✅ Fixed (5s + stops when URL entered) |
| Download progress spam | MediaGallery.tsx | 165 | ✅ Fixed (throttled to 500ms) |
| `backdrop-blur-sm` in modal | MediaGallery.tsx | 413 | ✅ Fixed |
| File size fetch loop | MediaGallery.tsx | 113 | ✅ Fixed (batch + parallel) |
| `.glass` backdrop-filter | globals.css | 218 | ✅ Fixed (desktop only) |
| `.animate-spin-slow` conic gradient | globals.css | 360 | ✅ Fixed (disabled on mobile) |
| `.shiny-border` animation | globals.css | 380 | ✅ Fixed (disabled on mobile) |
| `backdrop-blur-sm` mobile overlay | admin/layout.tsx | 340 | ✅ Fixed |
| `animate-pulse` always on | admin/page.tsx | 65 | ✅ Fixed |
| box-shadow blur radii | globals.css | various | ✅ Fixed (reduced + disabled on mobile) |
| Sidebar memoization | Sidebar.tsx | various | ✅ Fixed (useMemo/useCallback) |
| MediaGallery memoization | MediaGallery.tsx | various | ✅ Fixed (useMemo) |

---

## 📋 Quick Fix Checklist

```bash
# Files modified for immediate performance gains:

1. src/components/Sidebar.tsx
   - [x] Remove backdrop-blur-md from mobile header (line 97)
   - [x] Remove backdrop-blur-sm from overlay (line 196)
   - [x] Memoize platformsConfig (moved to const PLATFORMS_CONFIG)
   - [x] Memoize navLinks (useMemo)
   - [x] Memoize isActive (useCallback)
   - [x] Memoize platforms (useMemo)

2. src/components/DownloadForm.tsx
   - [x] Change timer interval from 50ms to 1000ms (line 72)
   - [x] Disable animate-spin-slow when not loading (line 224)
   - [x] Stop tips rotation when URL is entered (line 103)

3. src/components/media/MediaGallery.tsx
   - [x] Throttle download progress updates to 500ms (line 165)
   - [x] Remove backdrop-blur-sm from modal (line 413)
   - [x] Batch file size fetches (line 113)
   - [x] Memoize groupFormatsByItem (useMemo)
   - [x] Memoize itemIds (useMemo)

4. src/app/globals.css
   - [x] Add mobile media query to disable backdrop-filter
   - [x] Disable animate-spin-slow on mobile
   - [x] Disable shiny-border animation on mobile
   - [x] Reduce box-shadow blur radii (glass-card, btn-gradient)
   - [x] Disable hover transforms on mobile

5. src/app/admin/layout.tsx
   - [x] Remove backdrop-blur-sm from mobile overlay (line 340)

6. src/app/admin/page.tsx
   - [x] Remove animate-pulse from Activity icon (line 65)
```

---

*Created: December 21, 2025*
*Last Updated: December 21, 2025*
