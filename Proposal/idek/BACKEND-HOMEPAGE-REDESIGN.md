# Backend Homepage Redesign Proposal

## Overview
Redesign backend API homepage to match frontend XTFetch style - same sidebar layout, same theme system, same visual language.

## Current Issues
- ❌ Sidebar style doesn't match frontend
- ❌ No theme switcher (frontend has Dark/Light/Solarized)
- ❌ Different visual language (cards, buttons, colors)
- ❌ No logo/branding consistency
- ❌ Layout feels disconnected from main product

## Design Goals
1. **Match Frontend Exactly** - Same sidebar width (280px), same colors, same fonts
2. **Theme Support** - Dark/Light/Solarized like frontend
3. **Consistent Branding** - Same logo, same gradient text, same glass cards
4. **API-Focused Content** - Playground, endpoints, docs (not download features)

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR (280px)              │ MAIN CONTENT                     │
│                              │                                   │
│ ┌──────────────────────────┐ │ ┌─────────────────────────────┐  │
│ │ 🔷 XTFetch API           │ │ │ Section Header              │  │
│ │    API Documentation     │ │ │ + Status Badge              │  │
│ └──────────────────────────┘ │ └─────────────────────────────┘  │
│                              │                                   │
│ NAVIGATION                   │ ┌─────────────────────────────┐  │
│ ├─ 🏠 Overview              │ │ Content Area                 │  │
│ ├─ 🎮 Playground            │ │ (changes based on nav)       │  │
│ ├─ 📡 Endpoints             │ │                              │  │
│ └─ 📚 Documentation         │ │                              │  │
│                              │ │                              │  │
│ SERVICES                     │ │                              │  │
│ ├─ 📥 XTFetch-Downloader    │ │                              │  │
│ └─ 👁️ XTFetch-Watch (Soon)  │ │                              │  │
│                              │ │                              │  │
│ ──────────────────────────── │ │                              │  │
│ Theme: [🌙] [☀️] [✨]        │ │                              │  │
│ © 2025 risunCode            │ └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sidebar Menu Structure

### Navigation
| Icon | Label | Content |
|------|-------|---------|
| 🏠 | Overview | Welcome, features, quick stats |
| 🎮 | Playground | API Console with traffic light |
| 📡 | Endpoints | List of all public endpoints |
| 📚 | Documentation | Getting started, rate limits, errors |

### Services
| Icon | Label | Status |
|------|-------|--------|
| 📥 | XTFetch-Downloader | Active |
| 👁️ | XTFetch-Watch | Coming Soon |

### Footer
- Theme switcher (3 buttons: Dark/Light/Solarized)
- Copyright: © 2025 risunCode
- Version: v1.0.0

---

## Theme System (Copy from Frontend)

### CSS Variables
```css
/* Dark Theme (default) */
.theme-dark {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-card: #1c2128;
  --accent-primary: #58a6ff;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --border-color: #30363d;
}

/* Light Theme */
.theme-light {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-card: #ffffff;
  --accent-primary: #6366f1;
  --text-primary: #1a1a1a;
  --text-secondary: #525252;
  --border-color: #e5e5e5;
}

/* Solarized Theme */
.theme-solarized {
  --bg-primary: #fdf6e3;
  --bg-secondary: #eee8d5;
  --bg-card: #ffffff;
  --accent-primary: #5046e5;
  --text-primary: #1c1917;
  --text-secondary: #3f3f46;
  --border-color: #d6d3d1;
}
```

---

## Components to Build

### 1. Sidebar Component
- Fixed 280px width
- Logo header with icon + "XTFetch API"
- Navigation links with active state (gradient border)
- Services section with status badges
- Theme switcher in footer
- Responsive: hamburger menu on mobile

### 2. Overview Page
- Welcome message
- 3 feature cards (glass-card style):
  - 📥 Download Videos
  - 🌐 6 Platforms
  - ⚡ Fast & Free
- API Status indicator

### 3. Playground Page
- Traffic light status (online/slow/offline)
- URL input with gradient button
- Response viewer (dark code block)
- Response time display

### 4. Endpoints Page
- List of endpoints with:
  - Method badge (GET=green, POST=blue)
  - Path
  - Description
  - Rate limit

### 5. Documentation Page
- Tabs: Getting Started | Rate Limits | Error Codes
- Code examples with syntax highlighting
- Tables for reference data

---

## File Changes

### Files to Create/Modify
```
api-xtfetch/src/app/
├── page.tsx          # Main page with sidebar + content
├── layout.tsx        # Root layout (fonts, meta)
└── globals.css       # All styles (themes, components)
```

### Dependencies
- No new dependencies needed
- Use CDN for:
  - JetBrains Mono font (Google Fonts)
  - FontAwesome icons (cdnjs)

---

## Implementation Steps

### Phase 1: CSS Foundation
1. Copy theme variables from frontend globals.css
2. Add theme classes (theme-dark, theme-light, theme-solarized)
3. Add glass-card, gradient-text, btn-gradient styles
4. Add sidebar styles

### Phase 2: Layout Structure
1. Create sidebar component with navigation
2. Add theme switcher functionality
3. Add mobile responsive hamburger menu
4. Create main content area

### Phase 3: Content Pages
1. Overview with feature cards
2. Playground with API console
3. Endpoints list
4. Documentation with tabs

### Phase 4: Polish
1. Add animations (fade-in, hover effects)
2. Test all themes
3. Test mobile responsiveness
4. Verify build passes

---

## Visual Reference

### Colors to Match
| Element | Dark | Light | Solarized |
|---------|------|-------|-----------|
| Background | #0d1117 | #ffffff | #fdf6e3 |
| Sidebar | #161b22 | #f5f5f5 | #eee8d5 |
| Card | #1c2128 | #ffffff | #ffffff |
| Accent | #58a6ff | #6366f1 | #5046e5 |
| Text | #e6edf3 | #1a1a1a | #1c1917 |

### Spacing
- Sidebar width: 280px
- Content padding: 24px-48px
- Card padding: 20px-24px
- Border radius: 12px-16px

### Typography
- Font: JetBrains Mono
- Logo: 18px bold
- Headers: 20-24px bold
- Body: 13-14px
- Small: 11-12px

---

## Estimated Time
- Phase 1 (CSS): 15 min
- Phase 2 (Layout): 20 min
- Phase 3 (Content): 25 min
- Phase 4 (Polish): 10 min
- **Total: ~70 min**

---

## Approval Checklist
- [ ] Layout matches frontend sidebar style
- [ ] All 3 themes work correctly
- [ ] Mobile responsive with hamburger menu
- [ ] API Playground functional
- [ ] Build passes without errors
- [ ] No TypeScript/lint warnings
