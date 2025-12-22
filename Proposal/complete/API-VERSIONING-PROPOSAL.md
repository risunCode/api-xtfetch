# 🔄 XTFetch API Versioning & Restructuring Proposal

> **Goal**: Implement proper API versioning with backward compatibility and clear separation between public/admin endpoints

**Status**: 📋 **PROPOSAL** - Awaiting Review  
**Priority**: 🔥 **HIGH** - Foundation for future API evolution  
**Estimated Time**: ~4-6 hours  

---

## 📋 Executive Summary

Restructure XTFetch API with proper versioning to support:
- **Backward compatibility** for existing integrations
- **Clear separation** between public and admin APIs
- **Future-proof versioning** for API evolution
- **Better developer experience** with intuitive endpoints

---

## 🎯 Current State Analysis

### Current API Structure (Flat)
```
/api                           → Main download (auto-detect)
/api/playground               → Guest testing
/api/proxy                    → Media proxy
/api/status                   → Service status
/api/announcements            → Public announcements
/api/push/subscribe           → Push subscription

/api/admin/*                  → Admin endpoints (18 total)
├── /api/admin/auth           → Authentication
├── /api/admin/services       → Platform management
├── /api/admin/cookies/*      → Cookie management (5 endpoints)
├── /api/admin/users          → User management
├── /api/admin/stats          → Analytics
├── /api/admin/settings       → Global settings
├── /api/admin/push           → Push management
└── ... (10 more endpoints)
```

### Issues with Current Structure
❌ **No versioning** - Breaking changes affect all users  
❌ **Mixed concerns** - Public and admin APIs not clearly separated  
❌ **No legacy support** - Old integrations will break  
❌ **Inconsistent naming** - Some endpoints don't follow REST conventions  
❌ **No rate limiting separation** - Same limits for different user types  

---

## 🏗️ Proposed New API Structure

### 1. **Versioned Public APIs**
```
/api/v1/                      → Version 1 Public APIs
├── /                         → Premium API (GET with query params)
│   └── ?key={API_KEY}&url={URL}  → Direct browser access
├── /publicservices           → Free homepage API (POST, auto-detect)
├── /playground               → Guest testing (moved from /api/playground)
├── /proxy                    → Media proxy (moved from /api/proxy)
├── /status                   → Service status (moved from /api/status)
├── /announcements            → Public announcements (moved)
└── /push/subscribe           → Push subscription (moved)
```

### 2. **Admin APIs (No Versioning)**
```
/api/admin/                   → Admin APIs (no versioning needed)
├── /auth                     → Authentication
├── /services                 → Platform management
├── /cookies/                 → Cookie management
│   ├── /pool                 → Cookie pool CRUD
│   ├── /status               → Pool health status
│   ├── /health-check         → Manual health check
│   └── /migrate              → Cookie encryption migration
├── /users                    → User management
├── /apikeys                  → API key management
├── /stats                    → Analytics & dashboard
├── /settings                 → Global settings
├── /push                     → Push notifications
├── /cache                    → Cache management
├── /alerts                   → System alerts
├── /browser-profiles/        → Browser profile management
├── /useragents/pool          → User agent pool
└── /playground-examples      → Playground examples
```

### 3. **Service Tiers**
```
Premium Tier (API Key Required):
├── /api/v1?key={API_KEY}&url={URL}
│   ├── Higher rate limits (100+ req/min)
│   ├── Direct browser access (GET request)
│   ├── Auto-detect platform from URL
│   └── Clean, simple endpoint

Free Tier (Rate Limited):
├── /api/v1/publicservices (POST request)
│   ├── Lower rate limits (5-10 req/min)
│   ├── For homepage/website usage
│   ├── Auto-detect platform from URL
│   └── No API key required
```

---

## 📊 Detailed API Mapping

### Public API Endpoints (v1)

| New Endpoint | Method | Description | Rate Limit | Auth Required |
|--------------|--------|-------------|------------|---------------|
| `GET /api/v1?key={API_KEY}&url={URL}` | GET | Premium API (direct browser access) | 100/min per API key | API Key in query |
| `POST /api/v1/publicservices` | POST | Free homepage API (auto-detect) | 10/min per IP | None |
| `GET /api/v1/playground?url={URL}` | GET | Guest testing (browser-friendly) | 5/2min per IP | None |
| `POST /api/v1/playground` | POST | Guest testing (API integration) | 5/2min per IP | None |
| `GET /api/v1/proxy?url={URL}` | GET | Media proxy | 120/min per IP | None |
| `GET /api/v1/status` | GET | Service status | 30/min per IP | None |
| `GET /api/v1/announcements` | GET | Public announcements | 10/min per IP | None |
| `POST /api/v1/push/subscribe` | POST | Push subscription | 5/min per IP | None |

### Admin API Endpoints (No Versioning)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/admin/auth` | POST | Admin authentication |
| `GET\|POST\|PATCH /api/admin/services` | Multiple | Platform management |
| `GET\|POST\|DELETE /api/admin/cookies/pool` | Multiple | Cookie pool CRUD |
| `GET /api/admin/cookies/status` | GET | Cookie pool status |
| `POST /api/admin/cookies/health-check` | POST | Manual health check |
| `POST /api/admin/cookies/migrate` | POST | Cookie migration |
| `GET\|POST\|PATCH\|DELETE /api/admin/users` | Multiple | User management |
| `GET\|POST\|DELETE /api/admin/apikeys` | Multiple | API key management |
| `GET /api/admin/stats` | GET | Analytics dashboard |
| `GET\|POST /api/admin/settings` | Multiple | Global settings |
| `GET\|POST /api/admin/push` | Multiple | Push notifications |
| `DELETE /api/admin/cache` | DELETE | Cache management |
| `GET\|POST\|PATCH /api/admin/alerts` | Multiple | System alerts |
| `GET\|POST\|PATCH\|DELETE /api/admin/browser-profiles` | Multiple | Browser profiles |
| `GET\|POST\|DELETE /api/admin/useragents/pool` | Multiple | User agent pool |
| `GET /api/admin/playground-examples` | GET | Playground examples |

### Usage Examples

#### Premium API (Browser Direct Access)
```
https://api-xtfetch.vercel.app/api/v1?key=xtf_abc123def456&url=https://twitter.com/user/status/123
```

#### Playground API (Browser Testing - No API Key)
```
https://api-xtfetch.vercel.app/api/v1/playground?url=https://twitter.com/user/status/123
```

#### Free API (Homepage/Website Integration)
```javascript
fetch('/api/v1/publicservices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://twitter.com/user/status/123' })
});
```

---

## 🔧 Implementation Plan

### Phase 1: Create New Versioned Structure (2-3 hours)

#### 1.1 Create v1 Public API Routes
```bash
src/app/api/v1/
├── route.ts                  # Premium API (GET with query params)
├── publicservices/route.ts   # Free homepage API (POST)
├── playground/route.ts       # Guest testing
├── proxy/route.ts           # Media proxy
├── status/route.ts          # Service status
├── announcements/route.ts   # Public announcements
└── push/
    └── subscribe/route.ts   # Push subscription
```

#### 1.2 Create Admin API Routes (No Versioning)
```bash
src/app/api/admin/
├── auth/route.ts
├── services/route.ts
├── cookies/
│   ├── pool/route.ts
│   ├── status/route.ts
│   ├── health-check/route.ts
│   └── migrate/route.ts
├── users/route.ts
├── apikeys/route.ts
├── stats/route.ts
├── settings/route.ts
├── push/route.ts
├── cache/route.ts
├── alerts/route.ts
├── browser-profiles/
│   ├── route.ts
│   └── [id]/route.ts
├── useragents/
│   └── pool/route.ts
└── playground-examples/route.ts
```

#### 1.3 Copy Logic from Current Routes
- Copy existing route handlers to new versioned locations
- Update import paths if needed
- Ensure all functionality is preserved

### Phase 2: Update Current Routes (1 hour)

#### 2.1 Keep Current Routes for Backward Compatibility
```typescript
// src/app/api/route.ts - Keep existing functionality
// No redirects needed, maintain current behavior
export async function POST(request: NextRequest) {
    // Keep existing logic for backward compatibility
    // This becomes the "legacy" endpoint that still works
}
```

#### 2.2 Add Service Tier Detection
```typescript
// Detect if request has API key for premium tier
function detectServiceTier(request: NextRequest): 'premium' | 'free' {
    const apiKey = request.nextUrl.searchParams.get('key') || 
                   request.headers.get('X-API-Key');
    return apiKey ? 'premium' : 'free';
}
```

### Phase 3: Update Middleware & Rate Limiting (1 hour)

#### 3.1 Service Tier Rate Limiting
```typescript
// src/middleware.ts
const rateLimits = {
    'premium': {
        '/api/v1': { requests: 100, window: 60000 }, // 100/min with API key
    },
    'free': {
        '/api/v1/publicservices': { requests: 10, window: 60000 }, // 10/min no key
        '/api/v1/playground': { requests: 5, window: 120000 }, // 5/2min (GET & POST)
        '/api/v1/proxy': { requests: 30, window: 60000 },
    },
    'admin': {
        '/api/admin/*': { requests: 200, window: 60000 }, // Higher limits for admin
    }
};
```

#### 3.2 Service Tier Detection
```typescript
function getServiceTier(pathname: string, request: NextRequest): string {
    if (pathname.startsWith('/api/admin/')) return 'admin';
    
    const apiKey = request.nextUrl.searchParams.get('key') || 
                   request.headers.get('X-API-Key');
    
    if (pathname === '/api/v1' && apiKey) return 'premium';
    return 'free';
}
```

### Phase 4: Update Documentation (1 hour)

#### 4.1 Update README.md
- Document new versioned endpoints
- Add migration guide
- Update examples to use v1 endpoints
- Add deprecation timeline

#### 4.2 Add API Documentation
```bash
docs/
├── api-v1.md                # v1 API documentation
├── migration-guide.md       # Migration from legacy to v1
└── versioning-policy.md     # API versioning policy
```

---

## 🔄 Migration Strategy

### For Existing Users

#### 1. **Immediate (No Breaking Changes)**
- All current endpoints continue to work
- Automatic redirects to v1 endpoints
- Deprecation headers inform about new endpoints

#### 2. **Gradual Migration (3-6 months)**
- Users update to v1 endpoints at their own pace
- Legacy endpoints show deprecation warnings
- Documentation guides migration process

#### 3. **Sunset Legacy (6-12 months)**
- Legacy endpoints return 410 Gone
- All traffic uses versioned endpoints
- Clean, maintainable API structure

### Migration Examples

#### Before (Legacy)
```javascript
// Old way
const response = await fetch('/api', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://twitter.com/...' })
});
```

#### After (v1)
```javascript
// Premium API (Browser direct access)
// https://api-xtfetch.vercel.app/api/v1?key=xtf_abc123&url=https://twitter.com/...

// Free API (Homepage)
const response = await fetch('/api/v1/publicservices', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://twitter.com/...' })
});
```

---

## 📈 Benefits

### 1. **Backward Compatibility**
✅ Existing integrations continue working  
✅ Gradual migration timeline  
✅ No immediate breaking changes  

### 2. **Future-Proof Architecture**
✅ Easy to add v2, v3, etc.  
✅ Independent versioning for public/admin APIs  
✅ Clear deprecation and sunset process  

### 3. **Better Developer Experience**
✅ Intuitive endpoint naming (`/download` vs `/api`)  
✅ Clear separation of concerns  
✅ Comprehensive documentation  

### 4. **Improved Maintainability**
✅ Organized file structure  
✅ Version-specific rate limiting  
✅ Easier to add new features  

---

## 🚨 Risks & Mitigation

### Risk 1: **Redirect Performance Impact**
- **Impact**: 301 redirects add ~50ms latency
- **Mitigation**: Temporary, users will migrate to direct v1 calls
- **Timeline**: 3-6 months for most users to migrate

### Risk 2: **Increased Complexity**
- **Impact**: More files and routes to maintain
- **Mitigation**: Clear documentation and consistent patterns
- **Benefit**: Long-term maintainability improvement

### Risk 3: **User Confusion**
- **Impact**: Users might not understand versioning
- **Mitigation**: Clear migration guide and examples
- **Communication**: Blog post, GitHub announcement

---

## 📋 File Structure Changes

### New Directory Structure
```
src/app/api/
├── v1/                      # Public API v1
│   ├── route.ts             # Premium API (GET with query params)
│   ├── publicservices/route.ts # Free homepage API (POST)
│   ├── playground/route.ts
│   ├── proxy/route.ts
│   ├── status/route.ts
│   ├── announcements/route.ts
│   └── push/
│       └── subscribe/route.ts
├── admin/                   # Admin API (no versioning)
│   ├── auth/route.ts
│   ├── services/route.ts
│   ├── cookies/
│   ├── users/route.ts
│   ├── apikeys/route.ts
│   ├── stats/route.ts
│   ├── settings/route.ts
│   ├── push/route.ts
│   ├── cache/route.ts
│   ├── alerts/route.ts
│   ├── browser-profiles/
│   ├── useragents/
│   └── playground-examples/route.ts
├── route.ts                 # Keep existing (backward compatibility)
├── playground/route.ts      # Keep existing
├── proxy/route.ts          # Keep existing
├── status/route.ts         # Keep existing
├── announcements/route.ts  # Keep existing
└── push/
    └── subscribe/route.ts  # Keep existing
```

---

## 🎯 Success Metrics

### Technical Metrics
- ✅ **Zero downtime** during migration
- ✅ **<100ms** additional latency from redirects
- ✅ **100%** backward compatibility maintained
- ✅ **All tests pass** after restructuring

### User Experience Metrics
- 📊 **Migration rate**: % of users using v1 endpoints
- 📊 **Error rate**: No increase in API errors
- 📊 **Support tickets**: Minimal migration-related issues
- 📊 **Documentation views**: Migration guide usage

---

## 🗓️ Timeline

### Week 1: Implementation
- **Day 1-2**: Create v1 public API structure
- **Day 3-4**: Create v1 admin API structure  
- **Day 5**: Add legacy redirects and middleware updates
- **Day 6-7**: Testing and documentation

### Week 2: Deployment & Communication
- **Day 1**: Deploy to staging environment
- **Day 2-3**: Integration testing
- **Day 4**: Deploy to production
- **Day 5**: Announce migration to users
- **Day 6-7**: Monitor and fix any issues

### Month 2-4: Migration Period
- Monitor usage metrics
- Help users migrate
- Collect feedback

### Month 6: Legacy Sunset
- Remove legacy redirects
- Clean up old route files
- Celebrate clean API! 🎉

---

## 🔍 Testing Strategy

### 1. **Automated Tests**
```bash
# Test all v1 endpoints
npm run test:api:v1

# Test legacy redirects
npm run test:api:legacy

# Test admin v1 endpoints
npm run test:api:admin:v1
```

### 2. **Integration Tests**
- Test redirect functionality
- Verify response headers
- Check rate limiting per version
- Validate authentication flows

### 3. **Performance Tests**
- Measure redirect latency
- Load test v1 endpoints
- Compare performance with legacy

---

## 📝 Documentation Updates

### 1. **README.md Updates**
```markdown
## 🚀 API Endpoints

### Public API (v1)
- `GET /api/v1?key={API_KEY}&url={URL}` - Premium API (direct browser access)
- `POST /api/v1/publicservices` - Free homepage API (auto-detect)
- `GET /api/v1/playground?url={URL}` - Guest testing (browser-friendly)
- `POST /api/v1/playground` - Guest testing (API integration)
- `GET /api/v1/status` - Service status

### Legacy Support (Deprecated)
- `POST /api` → Redirects to `/api/v1/download`
- Migration guide: [docs/migration-guide.md](./docs/migration-guide.md)
```

### 2. **New Documentation Files**
- `docs/api-v1.md` - Complete v1 API reference
- `docs/migration-guide.md` - Step-by-step migration
- `docs/versioning-policy.md` - API versioning strategy

---

## 🎉 Conclusion

This API versioning proposal provides:

✅ **Backward compatibility** - No breaking changes  
✅ **Future-proof architecture** - Easy to evolve  
✅ **Better organization** - Clear separation of concerns  
✅ **Improved DX** - Intuitive endpoint naming  
✅ **Maintainable codebase** - Organized structure  

**Ready for implementation once approved!** 🚀

---

## 📞 Next Steps

1. **Review this proposal** - Check all endpoints and structure
2. **Approve implementation** - Give green light to proceed
3. **Execute migration** - Follow the implementation plan
4. **Monitor & support** - Help users migrate smoothly

**Estimated completion**: 1-2 weeks from approval

---

*Proposal created on December 21, 2025 - XTFetch API Versioning Project*