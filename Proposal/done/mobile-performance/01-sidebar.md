# Audit Report: Sidebar.tsx

**File**: `src/components/Sidebar.tsx`
**Priority**: 🔴 Critical
**Lines**: ~290

---

## 🔍 Issues Found

### 1. 🔴 `backdrop-blur-md` on Mobile Header (Line 97)
```tsx
className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-md ..."
```
**Problem**: `backdrop-blur` is extremely expensive on mobile devices. It requires compositing and can cause significant lag, especially on older devices.

**Impact**: HIGH - This is rendered on EVERY page on mobile.

**Fix**:
```tsx
// Option A: Remove blur entirely on mobile
className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)] ..."

// Option B: Use solid background with slight transparency (no blur)
className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--bg-primary)]/95 ..."
```

---

### 2. 🔴 `backdrop-blur-sm` on Mobile Overlay (Line 196)
```tsx
className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
```
**Problem**: Same as above - backdrop blur on full-screen overlay.

**Impact**: HIGH - Triggered every time sidebar opens.

**Fix**:
```tsx
className="lg:hidden fixed inset-0 z-40 bg-black/60"
```

---

### 3. 🟡 Platform Config Recreated Every Render (Lines 76-84)
```tsx
const platformsConfig = [
    { id: 'facebook', icon: FacebookIcon, label: 'Facebook', color: 'text-blue-500' },
    // ... 5 more items
];
```
**Problem**: This array is recreated on every render, causing unnecessary object allocations.

**Impact**: MEDIUM - Causes extra GC pressure.

**Fix**: Move outside component or use `useMemo`:
```tsx
// Move OUTSIDE component (best)
const PLATFORMS_CONFIG = [
    { id: 'facebook', icon: FacebookIcon, label: 'Facebook', color: 'text-blue-500' },
    // ...
] as const;

// Inside component
const platforms = useMemo(() => 
    PLATFORMS_CONFIG.map(p => ({
        ...p,
        status: (platformStatus.find(s => s.id === p.id)?.status || 'active') as 'active' | 'maintenance' | 'offline'
    })),
    [platformStatus]
);
```

---

### 4. 🟡 `navLinks` Array Recreated Every Render (Lines 66-73)
```tsx
const navLinks = [
    { href: '/', labelKey: 'home', icon: Home },
    // ...
    ...(hideDocs === false ? [{ href: '/docs', labelKey: 'docs', icon: BookOpen }] : []),
    // ...
];
```
**Problem**: Array recreated on every render.

**Impact**: MEDIUM

**Fix**:
```tsx
const navLinks = useMemo(() => [
    { href: '/', labelKey: 'home', icon: Home },
    { href: '/history', labelKey: 'history', icon: History },
    { href: '/advanced', labelKey: 'advanced', icon: Wrench },
    ...(hideDocs === false ? [{ href: '/docs', labelKey: 'docs', icon: BookOpen }] : []),
    { href: '/settings', labelKey: 'settings', icon: Settings },
    { href: '/about', labelKey: 'about', icon: Info },
], [hideDocs]);
```

---

### 5. 🟡 `isActive` Function Recreated Every Render (Line 91)
```tsx
const isActive = (href: string) => pathname === href;
```
**Problem**: Function recreated on every render, passed to child component.

**Impact**: MEDIUM - Causes SidebarContent to re-render.

**Fix**:
```tsx
const isActive = useCallback((href: string) => pathname === href, [pathname]);
```

---

### 6. 🟡 `motion.img` with whileHover in SidebarContent (Line 237)
```tsx
<motion.img
    src="/icon.png"
    alt="XTFetch"
    whileHover={{ rotate: 10, scale: 1.05 }}
    className="w-11 h-11 rounded-xl shadow-lg shadow-[var(--accent-primary)]/20"
/>
```
**Problem**: Framer Motion adds overhead for simple hover effect. Also, `shadow-lg` with color is expensive.

**Impact**: LOW-MEDIUM

**Fix**:
```tsx
// Use CSS hover instead
<img
    src="/icon.png"
    alt="XTFetch"
    className="w-11 h-11 rounded-xl shadow-lg hover:rotate-3 hover:scale-105 transition-transform"
/>
```

---

### 7. 🟢 `useStatus()` Hook - Check SWR Config
```tsx
const { platforms: platformStatus } = useStatus();
```
**Problem**: Need to verify SWR revalidation settings. If polling too frequently, causes unnecessary re-renders.

**Impact**: Depends on config

**Action**: Check `src/hooks/useStatus.ts` for:
- `refreshInterval`
- `revalidateOnFocus`
- `revalidateOnReconnect`

---

### 8. 🟢 AnimatePresence for Theme Dropdown (Lines 143-166)
```tsx
<AnimatePresence>
    {themeOpen && (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            ...
        >
```
**Problem**: Framer Motion for simple dropdown. Overkill.

**Impact**: LOW

**Fix**: Use CSS transitions:
```tsx
<div className={`absolute right-0 top-full mt-2 w-36 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl z-50 transition-all duration-200 ${
    themeOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
}`}>
```

---

## 📊 Summary

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| backdrop-blur-md header | 🔴 Critical | HIGH | Easy |
| backdrop-blur-sm overlay | 🔴 Critical | HIGH | Easy |
| platformsConfig recreation | 🟡 Medium | MEDIUM | Easy |
| navLinks recreation | 🟡 Medium | MEDIUM | Easy |
| isActive recreation | 🟡 Medium | MEDIUM | Easy |
| motion.img hover | 🟡 Medium | LOW-MEDIUM | Easy |
| useStatus SWR config | 🟢 Low | Unknown | Check |
| AnimatePresence dropdown | 🟢 Low | LOW | Medium |

---

## ✅ Recommended Fixes (Priority Order)

1. **Remove backdrop-blur on mobile** - Immediate impact
2. **Memoize platformsConfig** - Move outside component
3. **Memoize navLinks** - useMemo with hideDocs dependency
4. **useCallback for isActive** - Prevent child re-renders
5. **Replace motion.img with CSS** - Reduce Framer Motion usage
6. **Check useStatus SWR config** - Verify polling interval

---

## 🔧 Optimized Code Preview

```tsx
// Move outside component
const PLATFORMS_CONFIG = [
    { id: 'facebook', icon: FacebookIcon, label: 'Facebook', color: 'text-blue-500' },
    { id: 'instagram', icon: InstagramIcon, label: 'Instagram', color: 'text-pink-500' },
    { id: 'twitter', icon: XTwitterIcon, label: 'Twitter/X', color: 'text-[var(--text-primary)]' },
    { id: 'tiktok', icon: TiktokIcon, label: 'TikTok', color: 'text-cyan-400' },
    { id: 'youtube', icon: YoutubeIcon, label: 'YouTube', color: 'text-red-500' },
    { id: 'weibo', icon: WeiboIcon, label: 'Weibo', color: 'text-orange-500' },
] as const;

export function SidebarLayout({ children }: SidebarProps) {
    // ... existing state ...

    // Memoized values
    const navLinks = useMemo(() => [
        { href: '/', labelKey: 'home', icon: Home },
        { href: '/history', labelKey: 'history', icon: History },
        { href: '/advanced', labelKey: 'advanced', icon: Wrench },
        ...(hideDocs === false ? [{ href: '/docs', labelKey: 'docs', icon: BookOpen }] : []),
        { href: '/settings', labelKey: 'settings', icon: Settings },
        { href: '/about', labelKey: 'about', icon: Info },
    ], [hideDocs]);

    const platforms = useMemo(() => 
        PLATFORMS_CONFIG.map(p => ({
            ...p,
            status: (platformStatus.find(s => s.id === p.id)?.status || 'active') as 'active' | 'maintenance' | 'offline'
        })),
        [platformStatus]
    );

    const isActive = useCallback((href: string) => pathname === href, [pathname]);

    // ... rest of component with backdrop-blur removed ...
}
```

---

*Audited: December 21, 2025*
