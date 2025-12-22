# XTFetch Localization (i18n) Proposal

> **Goal**: Support multiple languages (English, Bahasa Indonesia) dengan auto-detect dari browser locale.

---

## 📋 Overview

### Supported Languages
| Code | Language | Status |
|------|----------|--------|
| `en` | English (US) | Default |
| `id` | Bahasa Indonesia | Priority |

### Auto-Detection Flow
```
1. Check localStorage preference (user override)
2. Check browser locale (navigator.language)
3. Fallback to English
```

---

## 🏗️ Architecture

### Option A: next-intl (Recommended)
```
Pros:
✅ Built for Next.js App Router
✅ Server & Client components support
✅ Type-safe translations
✅ Automatic locale detection
✅ SEO-friendly (locale in URL optional)

Cons:
❌ Additional dependency
❌ Slight learning curve
```

### Option B: Custom Implementation
```
Pros:
✅ No dependencies
✅ Full control
✅ Simpler for small apps

Cons:
❌ More boilerplate
❌ No built-in features
```

**Recommendation**: Option A (next-intl) for scalability and best practices.

---

## 📁 Proposed File Structure

```
src/
├── i18n/
│   ├── config.ts              # Locale config & types
│   ├── request.ts             # Server-side locale detection
│   └── messages/
│       ├── en.json            # English translations
│       └── id.json            # Indonesian translations
│
├── lib/
│   └── storage/
│       └── settings.ts        # Add language preference
│
├── components/
│   └── LanguageSwitcher.tsx   # Language toggle component
│
└── app/
    └── [locale]/              # Optional: locale-based routing
        └── ...pages
```

---

## 📝 Translation Keys Structure

### Namespace Organization
```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "confirm": "Confirm",
    "close": "Close",
    "back": "Back",
    "next": "Next"
  },
  
  "nav": {
    "home": "Home",
    "history": "History",
    "advanced": "Advanced",
    "settings": "Settings",
    "about": "About"
  },
  
  "home": {
    "title": "Free {platform} Downloader",
    "subtitle": "Paste URL → Auto-detect → Download",
    "badges": {
      "noWatermark": "No Watermark",
      "fastFree": "Fast & Free",
      "multiQuality": "Multiple Qualities",
      "noLogin": "No Login Required"
    }
  },
  
  "download": {
    "pasteUrl": "Paste video URL...",
    "paste": "Paste",
    "go": "Go",
    "downloading": "Downloading...",
    "progress": {
      "connecting": "Connecting...",
      "fetching": "Fetching page...",
      "extracting": "Extracting media...",
      "validating": "Validating URLs...",
      "almostDone": "Almost done..."
    },
    "tips": [
      "Paste any video URL to start",
      "Supports TikTok, Instagram, Facebook & more",
      "Auto-detects platform from URL"
    ]
  },
  
  "history": {
    "title": "Download History",
    "subtitle": "View and manage your past downloads",
    "empty": "No downloads yet",
    "privacy": {
      "title": "Your privacy matters.",
      "description": "Download history is stored locally on your device only."
    }
  },
  
  "settings": {
    "title": "Settings",
    "subtitle": "Customize your experience",
    "tabs": {
      "basic": "Basic",
      "cookies": "Cookies",
      "storage": "Storage",
      "integrations": "Integrations"
    },
    "theme": {
      "title": "Theme",
      "dark": "Dark",
      "light": "Light",
      "solarized": "Solarized"
    },
    "language": {
      "title": "Language",
      "auto": "Auto-detect",
      "en": "English",
      "id": "Bahasa Indonesia"
    },
    "notifications": {
      "title": "Notifications",
      "push": "Push Notifications",
      "enabled": "Receiving updates",
      "disabled": "Get notified"
    },
    "backup": {
      "title": "Full Backup",
      "export": "Export",
      "import": "Import",
      "description": "Export as ZIP containing history.json + settings.json"
    },
    "storage": {
      "cookies": "Cookies",
      "localStorage": "LocalStorage",
      "historyCache": "History & Cache",
      "resetAll": "Reset All"
    }
  },
  
  "about": {
    "title": "About XTFetch",
    "subtitle": "Social media downloader tanpa batas, tanpa ribet.",
    "story": {
      "title": "The Story",
      "content": "..."
    },
    "features": {
      "title": "Features",
      "noLimits": "No daily limits",
      "noWatermark": "No watermark",
      "autoDetect": "Auto-detect platform",
      "multiQuality": "Multiple quality",
      "noLogin": "No login required"
    }
  },
  
  "errors": {
    "invalidUrl": "Invalid URL",
    "fetchFailed": "Failed to fetch",
    "cookieRequired": "Cookie required",
    "cookieExpired": "Cookie expired",
    "maintenance": "Under maintenance",
    "rateLimit": "Too many requests"
  },
  
  "platforms": {
    "facebook": "Facebook",
    "instagram": "Instagram",
    "twitter": "Twitter/X",
    "tiktok": "TikTok",
    "weibo": "Weibo",
    "status": {
      "active": "Active",
      "maintenance": "Maintenance",
      "offline": "Offline"
    }
  },
  
  "maintenance": {
    "title": "Under Maintenance",
    "message": "We're working hard to improve your experience.",
    "checkStatus": "Check Status",
    "adminPanel": "Admin Panel"
  },
  
  "install": {
    "title": "Install XTFetch",
    "subtitle": "Get the full app experience on your device",
    "alreadyInstalled": "Already Installed!",
    "installNow": "Install Now",
    "howToInstall": "How to Install",
    "features": {
      "fast": "Lightning Fast",
      "notifications": "Push Notifications",
      "offline": "Works Offline"
    }
  },
  
  "notFound": {
    "title": "Page Not Found",
    "message": "Oops! The page you're looking for doesn't exist.",
    "goHome": "Go Home",
    "goBack": "Go Back"
  }
}
```

---

## 🔧 Implementation Steps

### Phase 1: Setup (Day 1)
1. Install `next-intl`
2. Create i18n config
3. Create translation files (en.json, id.json)
4. Setup middleware for locale detection
5. Add language preference to localStorage

### Phase 2: Core Components (Day 2-3)
1. Wrap app with IntlProvider
2. Create LanguageSwitcher component
3. Add language option to Settings page
4. Translate Sidebar navigation
5. Translate common UI components (Button, Modal, etc.)

### Phase 3: Pages (Day 4-6)
1. Home page
2. History page
3. Settings page
4. About page
5. Install page
6. Maintenance page
7. 404 page
8. Auth pages

### Phase 4: Components (Day 7-8)
1. DownloadForm
2. DownloadPreview
3. HistoryList
4. Announcements
5. Error messages & toasts

### Phase 5: Testing & Polish (Day 9-10)
1. Test all pages in both languages
2. Fix missing translations
3. Optimize bundle size
4. Add language detection tests

---

## 📊 Files to Modify

### High Priority (Core)
| File | Changes |
|------|---------|
| `src/app/layout.tsx` | Add IntlProvider wrapper |
| `src/middleware.ts` | Add locale detection |
| `src/components/Sidebar.tsx` | Translate nav labels |
| `src/app/settings/page.tsx` | Add language selector |
| `src/lib/storage/settings.ts` | Add language preference |

### Medium Priority (Pages)
| File | Translatable Content |
|------|---------------------|
| `src/app/page.tsx` | Hero text, badges, tips |
| `src/app/history/page.tsx` | Title, privacy notice |
| `src/app/about/page.tsx` | All content, changelog |
| `src/app/install/page.tsx` | Instructions, features |
| `src/app/maintenance/page.tsx` | Message, buttons |
| `src/app/not-found.tsx` | Error message |

### Lower Priority (Components)
| File | Translatable Content |
|------|---------------------|
| `src/components/DownloadForm.tsx` | Tips, progress text, errors |
| `src/components/DownloadPreview.tsx` | Labels, buttons |
| `src/components/HistoryList.tsx` | Empty state, labels |
| `src/components/Announcements.tsx` | (Dynamic from DB) |

---

## 🎨 UI Changes

### Settings Page - Language Section
```
┌─────────────────────────────────────┐
│ 🌐 Language                         │
├─────────────────────────────────────┤
│ ○ Auto-detect (Browser)             │
│ ● English                           │
│ ○ Bahasa Indonesia                  │
└─────────────────────────────────────┘
```

### Mobile Header - Language Toggle
```
┌─────────────────────────────────────┐
│ ☰  XTFetch    [🌐] [🎨] [⚙️] [🏠]  │
└─────────────────────────────────────┘
```

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "next-intl": "^3.x"
  }
}
```

---

## 🔐 LocalStorage Key

```typescript
// Key: 'lang_v1_pref'
// Values: 'auto' | 'en' | 'id'

export type LanguagePreference = 'auto' | 'en' | 'id';

export function getLanguage(): LanguagePreference {
  return localStorage.getItem('lang_v1_pref') as LanguagePreference || 'auto';
}

export function setLanguage(lang: LanguagePreference): void {
  localStorage.setItem('lang_v1_pref', lang);
}
```

---

## 📈 Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Setup | 2-3 hours | High |
| Core Components | 4-6 hours | High |
| Pages | 8-10 hours | Medium |
| Components | 4-6 hours | Medium |
| Testing | 2-3 hours | High |
| **Total** | **20-28 hours** | - |

---

## ✅ Acceptance Criteria

1. [ ] User can select language in Settings
2. [ ] Language preference persists across sessions
3. [ ] Auto-detect from browser locale works
4. [ ] All UI text is translated
5. [ ] No hardcoded strings in components
6. [ ] RTL support ready (for future Arabic/Hebrew)
7. [ ] SEO meta tags translated
8. [ ] Error messages translated
9. [ ] Toast notifications translated
10. [ ] Admin panel excluded (English only)

---

## 🚀 Future Languages (Roadmap)

| Language | Code | Priority |
|----------|------|----------|
| Japanese | `ja` | Medium |
| Chinese (Simplified) | `zh-CN` | Medium |
| Korean | `ko` | Low |
| Spanish | `es` | Low |
| Arabic | `ar` | Low (RTL) |

---

## 📝 Notes

1. **Admin Panel**: Keep English only (internal use)
2. **API Responses**: Keep English (technical)
3. **Changelog**: Keep English (developer-focused)
4. **Platform Names**: Keep original (Facebook, Instagram, etc.)
5. **Error Codes**: Keep English (debugging)

---

*Proposal created: December 20, 2025*
*Author: Kiro AI Assistant*
