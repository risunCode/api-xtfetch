# Audit Report: globals.css

**File**: `src/app/globals.css`
**Priority**: 🟡 Medium
**Lines**: ~450

---

## 🔍 Issues Found

### 1. 🔴 `backdrop-filter: blur()` in Multiple Places

#### `.glass` class (Lines 218-222)
```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}
```

#### `.frost-glass` class (Lines 225-230)
```css
.frost-glass {
  background: var(--bg-primary)/80;
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border-bottom: 1px solid var(--border-color)/50;
}
```

**Problem**: `backdrop-filter: blur()` is one of the most expensive CSS properties on mobile. It requires:
1. Rendering everything behind the element
2. Applying blur filter (GPU intensive)
3. Compositing the result

**Impact**: HIGH - Every element using these classes causes performance hit.

**Fix**:
```css
/* Option A: Remove blur entirely */
.glass {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

/* Option B: Use solid semi-transparent background */
.glass {
  background: rgba(var(--bg-card-rgb), 0.95);
  border: 1px solid var(--glass-border);
}

/* Option C: Only enable blur on desktop */
.glass {
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
}

@media (min-width: 1024px) {
  .glass {
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}
```

---

### 2. 🔴 `animate-spin-slow` with Conic Gradient (Lines 360-390)
```css
@property --border-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes spin-border {
  to {
    --border-angle: 360deg;
  }
}

.animate-spin-slow {
  animation: spin-border 3s linear infinite;
}

.animate-spin-slow::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(from var(--border-angle), ...);
  /* ... mask properties ... */
}
```

**Problem**: 
1. CSS `@property` animation is expensive
2. `conic-gradient` recalculated every frame
3. Mask compositing adds overhead
4. Runs infinitely even when not visible

**Impact**: HIGH - Constant GPU usage.

**Fix**:
```css
/* Option A: Simpler static border */
.animate-spin-slow {
  border: 2px solid var(--accent-primary);
  border-radius: inherit;
}

/* Option B: Only animate on hover/focus */
.animate-spin-slow {
  /* No animation by default */
}

.animate-spin-slow:hover,
.animate-spin-slow:focus-within {
  animation: spin-border 3s linear infinite;
}

/* Option C: Use simpler animation */
@keyframes pulse-border {
  0%, 100% { border-color: var(--accent-primary); }
  50% { border-color: var(--accent-secondary); }
}

.animate-spin-slow {
  animation: pulse-border 2s ease-in-out infinite;
}
```

---

### 3. 🔴 `.shiny-border` Animation (Lines 395-420)
```css
.shiny-border::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(from var(--border-angle, 0deg), ...);
  /* ... mask properties ... */
  animation: spin-border 4s linear infinite;
  opacity: 0.6;
}
```

**Problem**: Same as above - expensive conic gradient animation running infinitely.

**Impact**: HIGH

**Fix**: Same approach - disable by default, enable on hover only.

---

### 4. 🟡 `.skeleton` Shimmer Animation (Lines 340-355)
```css
.skeleton {
  background: linear-gradient(90deg,
      var(--bg-secondary) 25%,
      var(--bg-card) 50%,
      var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Problem**: Infinite animation. If skeleton is shown for long time, wastes resources.

**Impact**: MEDIUM - Only affects loading states.

**Fix**:
```css
/* Limit animation iterations */
.skeleton {
  animation: shimmer 1.5s ease-in-out 3; /* Only 3 iterations */
}

/* Or use reduced motion */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--bg-secondary);
  }
}
```

---

### 5. 🟡 `.glass-card:hover` Box Shadow (Lines 238-243)
```css
.glass-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-primary);
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.1);
}
```

**Problem**: Large blur radius (30px) box-shadow on hover. Expensive to render.

**Impact**: MEDIUM - Only on hover.

**Fix**:
```css
.glass-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-primary);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15); /* Smaller, sharper shadow */
}
```

---

### 6. 🟡 `.btn-gradient` Box Shadow (Lines 255-260)
```css
.btn-gradient {
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}

.btn-gradient:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
}
```

**Problem**: Large blur shadows, especially on hover.

**Impact**: MEDIUM

**Fix**:
```css
.btn-gradient {
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
}

.btn-gradient:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}
```

---

### 7. 🟢 `scroll-behavior: smooth` (Line 200)
```css
html {
  scroll-behavior: smooth;
}
```

**Problem**: Can cause jank on low-end devices during scroll.

**Impact**: LOW

**Fix**: Already handled by `prefers-reduced-motion` media query.

---

### 8. 🟢 Platform Tab Box Shadows (Lines 295-310)
```css
.platform-tab.facebook.active {
  border-color: var(--facebook);
  box-shadow: 0 0 20px rgba(24, 119, 242, 0.2);
}
```

**Problem**: Multiple platform-specific shadows.

**Impact**: LOW - Only on active state.

**Fix**: Reduce blur radius:
```css
.platform-tab.facebook.active {
  box-shadow: 0 0 10px rgba(24, 119, 242, 0.15);
}
```

---

## 📊 Summary

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| backdrop-filter blur | 🔴 Critical | HIGH | Medium |
| animate-spin-slow conic | 🔴 Critical | HIGH | Medium |
| shiny-border animation | 🔴 Critical | HIGH | Medium |
| skeleton shimmer infinite | 🟡 Medium | MEDIUM | Easy |
| glass-card hover shadow | 🟡 Medium | MEDIUM | Easy |
| btn-gradient shadows | 🟡 Medium | MEDIUM | Easy |
| scroll-behavior smooth | 🟢 Low | LOW | N/A |
| platform tab shadows | 🟢 Low | LOW | Easy |

---

## ✅ Recommended Fixes (Priority Order)

1. **Remove/disable backdrop-filter on mobile** - Biggest impact
2. **Disable spin animations by default** - Enable only on interaction
3. **Reduce box-shadow blur radii** - Smaller = faster
4. **Limit skeleton animation iterations** - Don't run forever

---

## 🔧 Mobile-Optimized CSS

```css
/* Disable expensive effects on mobile */
@media (max-width: 768px) {
  .glass,
  .frost-glass {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: var(--bg-card) !important;
  }
  
  .animate-spin-slow,
  .shiny-border::before {
    animation: none !important;
  }
  
  .glass-card:hover,
  .btn-gradient:hover {
    box-shadow: none !important;
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .animate-spin-slow,
  .shiny-border::before,
  .skeleton {
    animation: none !important;
  }
}
```

---

*Audited: December 21, 2025*
