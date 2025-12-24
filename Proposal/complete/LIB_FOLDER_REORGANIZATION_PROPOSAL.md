# Proposal: Reorganisasi Folder `lib/`

## Masalah Saat Ini

Root folder `lib/` terlalu kotor dengan 10 file besar:

| File | Lines | Fungsi |
|------|-------|--------|
| `utils.ts` | 1033 | Security, format, error, transform, validation |
| `config.ts` | 951 | Platform config, service config, system config |
| `cookies.ts` | 867 | Cookie parser, pool, admin cookies |
| `http.ts` | 712 | HTTP client, headers, user agents, profiles |
| `cache.ts` | 594 | Redis cache wrapper |
| `auth.ts` | 478 | Auth verify, API keys |
| `supabase.ts` | 254 | Supabase client, stats, tracking |
| `youtube-storage.ts` | 195 | YouTube download storage |
| `shutdown.ts` | 88 | Graceful shutdown |
| `redis.ts` | 45 | Redis client |

**Total: ~5,217 lines di root!**

---

## Solusi: Grouping by Domain

```
src/lib/
├── index.ts                    # Main barrel export
│
├── database/                   # Database clients
│   ├── supabase.ts            # Supabase client + stats
│   ├── redis.ts               # Redis client
│   └── index.ts
│
├── http/                       # HTTP layer
│   ├── client.ts              # httpGet, httpPost, httpHead
│   ├── headers.ts             # Headers, user agents, profiles
│   └── index.ts
│
├── auth/                       # Authentication
│   ├── session.ts             # authVerify*, session functions
│   ├── apikeys.ts             # apiKey* functions
│   └── index.ts
│
├── config/                     # Configuration
│   ├── platform.ts            # platform* functions, PLATFORM_CONFIGS
│   ├── service.ts             # serviceConfig* functions
│   ├── system.ts              # sysConfig* functions
│   └── index.ts
│
├── cookies/                    # Cookie management
│   ├── parser.ts              # cookieParse, cookieValidate
│   ├── pool.ts                # cookiePool* functions
│   ├── admin.ts               # adminCookie* functions
│   └── index.ts
│
├── cache/                      # Caching layer
│   ├── index.ts               # cache* functions (single file OK)
│
├── security/                   # Security utilities
│   ├── index.ts               # security* functions
│
├── utils/                      # General utilities
│   ├── format.ts              # formatBytes, formatSpeed, etc
│   ├── transform.ts           # transform* functions
│   ├── error.ts               # error*, utilErrorResponse, etc
│   ├── media.ts               # utilAddFormat, utilExtractMeta, etc
│   └── index.ts
│
├── services/                   # Platform scrapers (SUDAH RAPI ✅)
│   ├── shared/
│   ├── facebook/
│   ├── instagram/
│   ├── youtube/
│   │   ├── scraper.ts
│   │   ├── storage.ts         # ytDownload*, ytSession* (PINDAH KESINI!)
│   │   └── index.ts
│   └── ...
│
├── integrations/               # External integrations (KEEP)
├── types/                      # TypeScript types (KEEP)
├── url/                        # URL pipeline (KEEP)
└── shutdown.ts                 # Graceful shutdown (KEEP - small)
```

---

## Mapping File Lama → Baru

| Lama | Baru | Notes |
|------|------|-------|
| `auth.ts` | `auth/session.ts` + `auth/apikeys.ts` | Split by concern |
| `config.ts` | `config/platform.ts` + `config/service.ts` + `config/system.ts` | Split by domain |
| `cookies.ts` | `cookies/parser.ts` + `cookies/pool.ts` + `cookies/admin.ts` | Split by concern |
| `http.ts` | `http/client.ts` + `http/headers.ts` | Split client vs headers |
| `utils.ts` | `security/` + `utils/format.ts` + `utils/transform.ts` + `utils/error.ts` + `utils/media.ts` | Split by domain |
| `cache.ts` | `cache/index.ts` | Keep as-is (cohesive) |
| `supabase.ts` | `database/supabase.ts` | Move to database/ |
| `redis.ts` | `database/redis.ts` | Move to database/ |
| `youtube-storage.ts` | `services/youtube/storage.ts` | Move to services/youtube/ |
| `shutdown.ts` | `shutdown.ts` | Keep at root (small) |

---

## Import Changes

### Before
```typescript
import { httpGet, httpGetUserAgent, BROWSER_HEADERS } from '@/lib/http';
import { authVerifySession, apiKeyValidate } from '@/lib/auth';
import { platformDetect, serviceConfigGet } from '@/lib/config';
```

### After
```typescript
import { httpGet } from '@/lib/http';
import { authVerifySession } from '@/lib/auth';
import { platformDetect } from '@/lib/config';
```

**NO backward compatibility!** Semua import harus di-update langsung ke path baru.

---

## Execution Plan

### Phase 1: Create folder structure
1. Create `database/`, `http/`, `auth/`, `config/`, `cookies/`, `cache/`, `security/`, `utils/`, `youtube/`
2. Create `index.ts` barrel exports di setiap folder

### Phase 2: Split files
1. Split `auth.ts` → `auth/session.ts` + `auth/apikeys.ts`
2. Split `config.ts` → `config/platform.ts` + `config/service.ts` + `config/system.ts`
3. Split `cookies.ts` → `cookies/parser.ts` + `cookies/pool.ts` + `cookies/admin.ts`
4. Split `http.ts` → `http/client.ts` + `http/headers.ts`
5. Split `utils.ts` → `security/index.ts` + `utils/*.ts`
6. Move `cache.ts` → `cache/index.ts`
7. Move `supabase.ts` → `database/supabase.ts`
8. Move `redis.ts` → `database/redis.ts`
9. Move `youtube-storage.ts` → `youtube/storage.ts`

### Phase 3: Update imports
1. Update ALL imports across project to new paths
2. Delete old files from root
3. NO barrel export di `lib/index.ts` - import langsung dari subfolder

### Phase 4: Validate
1. Run `npm run build`
2. Test endpoints

---

## Benefits

1. **Organized by domain** - Easy to find related code
2. **Smaller files** - Easier to maintain (~200-400 lines each)
3. **Better tree-shaking** - Import only what you need
4. **Clean imports** - No alias/re-export mess
5. **Consistent with services/** - Same folder-per-domain pattern

---

## Estimated Effort

- 5 subagents, ~10-15 minutes each
- Total: ~1 hour including validation
