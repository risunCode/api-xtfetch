┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (1 Project)                     │
│              https://xxxxx.supabase.co                      │
├─────────────────────────────────────────────────────────────┤
│  • 1 Database (PostgreSQL)                                  │
│  • 1 Auth System                                            │
│  • 2 API Keys:                                              │
│    ├── Anon Key (public) → Frontend & Backend              │
│    └── Service Role Key (secret) → Backend only            │
└─────────────────────────────────────────────────────────────┘
                    ▲                    ▲
                    │                    │
        ┌───────────┘                    └───────────┐
        │                                            │
┌───────┴────────┐                          ┌────────┴───────┐
│   FRONTEND     │                          │    BACKEND     │
│  (Port 3001)   │                          │  (Port 3002)   │
├────────────────┤                          ├────────────────┤
│ Uses:          │                          │ Uses:          │
│ • Anon Key     │                          │ • Anon Key     │
│                │                          │ • Service Key  │
│ Can:           │                          │                │
│ • Login user   │                          │ Can:           │
│ • Read public  │                          │ • Everything   │
│                │                          │ • Admin ops    │
└────────────────┘                          └────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                    REDIS (1 Database)                       │
│              https://xxxxx.upstash.io                       │
├─────────────────────────────────────────────────────────────┤
│  • 1 Redis Instance                                         │
│  • Used for: Rate limiting, Caching                         │
│  • Credentials: URL + Token                                 │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ (Backend only)
                              │
                    ┌─────────┴─────────┐
                    │     BACKEND       │
                    │   (Port 3002)     │
                    ├───────────────────┤
                    │ Uses:             │
                    │ • Redis URL       │
                    │ • Redis Token     │
                    │                   │
                    │ For:              │
                    │ • Rate limiting   │
                    │ • API caching     │
                    └───────────────────┘

        ┌───────────────────┐
        │    FRONTEND       │
        │  (Port 3001)      │
        ├───────────────────┤
        │ ❌ NO Redis       │
        │ ❌ NO connection  │
        └───────────────────┘
