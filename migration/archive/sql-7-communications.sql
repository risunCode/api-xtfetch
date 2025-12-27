-- ============================================================================
-- COMMUNICATIONS TABLES (Jan 2025)
-- Announcements, Banner Ads, Compact Ads, Push Notifications
-- ============================================================================

-- ============================================================================
-- 1. ANNOUNCEMENTS
-- Alert banners shown on specific pages, dismissable with 12h cooldown
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error', 'promo')),
    
    -- Display settings
    icon VARCHAR(50),                    -- Emoji or icon name
    link_url TEXT,                       -- Optional CTA link
    link_text VARCHAR(100),              -- CTA button text
    
    -- Targeting - which pages to show
    show_on_home BOOLEAN DEFAULT true,
    show_on_history BOOLEAN DEFAULT false,
    show_on_settings BOOLEAN DEFAULT false,
    show_on_docs BOOLEAN DEFAULT false,
    
    -- Scheduling
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,                -- NULL = no end date
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 0,              -- Higher = shown first
    
    -- Tracking
    views INT DEFAULT 0,
    dismisses INT DEFAULT 0,
    clicks INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Index for active announcements query
CREATE INDEX IF NOT EXISTS idx_announcements_active 
ON announcements (enabled, start_date, end_date) 
WHERE enabled = true;

-- ============================================================================
-- 2. BANNER ADS
-- Large image banners (like the Shopee ad in screenshot)
-- ============================================================================
CREATE TABLE IF NOT EXISTS banner_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    name VARCHAR(200) NOT NULL,          -- Internal name
    image_url TEXT NOT NULL,             -- Banner image URL
    link_url TEXT NOT NULL,              -- Click destination
    alt_text VARCHAR(200),               -- Accessibility
    
    -- Display settings
    placement VARCHAR(50) DEFAULT 'home' CHECK (placement IN ('home', 'result', 'history', 'all')),
    position VARCHAR(20) DEFAULT 'bottom' CHECK (position IN ('top', 'middle', 'bottom')),
    
    -- Styling
    badge_text VARCHAR(50),              -- e.g. "🔥 Test banner dipencet jg bole"
    badge_color VARCHAR(20) DEFAULT 'yellow',
    sponsor_text VARCHAR(100),           -- e.g. "Shopee"
    
    -- Scheduling
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 0,
    
    -- Tracking
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_banner_ads_active 
ON banner_ads (enabled, placement, start_date, end_date) 
WHERE enabled = true;

-- ============================================================================
-- 3. COMPACT ADS
-- Small ads with GIF/image, link, and preview
-- ============================================================================
CREATE TABLE IF NOT EXISTS compact_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    name VARCHAR(200) NOT NULL,
    title VARCHAR(100) NOT NULL,         -- Ad title
    description TEXT,                    -- Short description
    image_url TEXT NOT NULL,             -- GIF or image URL
    link_url TEXT NOT NULL,              -- Click destination
    
    -- Preview settings
    preview_title VARCHAR(200),          -- Link preview title
    preview_description TEXT,            -- Link preview description
    preview_image TEXT,                  -- Link preview image (og:image)
    
    -- Display settings
    placement VARCHAR(50) DEFAULT 'all' CHECK (placement IN ('home-input', 'home-bottom', 'about', 'all')),
    size VARCHAR(20) DEFAULT 'medium' CHECK (size IN ('small', 'medium', 'large')),
    
    -- Scheduling
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 0,
    
    -- Tracking
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_compact_ads_active 
ON compact_ads (enabled, placement, start_date, end_date) 
WHERE enabled = true;

-- ============================================================================
-- 4. PUSH SUBSCRIPTIONS
-- Store user push notification subscriptions (VAPID)
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Subscription data (from browser)
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,                -- Public key
    auth TEXT NOT NULL,                  -- Auth secret
    
    -- User info (optional - can be anonymous)
    user_id UUID REFERENCES auth.users(id),
    
    -- Device info
    user_agent TEXT,
    device_type VARCHAR(20),             -- desktop, mobile, tablet
    browser VARCHAR(50),
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    
    -- Tracking
    last_used TIMESTAMPTZ DEFAULT NOW(),
    total_sent INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active 
ON push_subscriptions (enabled) 
WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
ON push_subscriptions (user_id) 
WHERE user_id IS NOT NULL;

-- ============================================================================
-- 5. PUSH NOTIFICATIONS LOG
-- Track sent push notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    icon TEXT,                           -- Notification icon URL
    image TEXT,                          -- Big image URL
    badge TEXT,                          -- Badge icon URL
    
    -- Action
    click_url TEXT,                      -- URL to open on click
    
    -- Targeting
    target VARCHAR(20) DEFAULT 'all' CHECK (target IN ('all', 'users', 'guests', 'specific')),
    target_user_ids UUID[],              -- For specific targeting
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    
    -- Stats
    total_sent INT DEFAULT 0,
    total_delivered INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    total_failed INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_status 
ON push_notifications (status, scheduled_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Announcements: Public read, admin write
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_public_read" ON announcements
    FOR SELECT USING (enabled = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW()));

CREATE POLICY "announcements_admin_all" ON announcements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Banner Ads: Public read, admin write
ALTER TABLE banner_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banner_ads_public_read" ON banner_ads
    FOR SELECT USING (enabled = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW()));

CREATE POLICY "banner_ads_admin_all" ON banner_ads
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Compact Ads: Public read, admin write
ALTER TABLE compact_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compact_ads_public_read" ON compact_ads
    FOR SELECT USING (enabled = true AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW()));

CREATE POLICY "compact_ads_admin_all" ON compact_ads
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Push Subscriptions: User can manage own, admin can read all
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_own" ON push_subscriptions
    FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "push_subscriptions_admin_read" ON push_subscriptions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Push Notifications: Admin only
ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_notifications_admin_all" ON push_notifications
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to increment ad impressions
CREATE OR REPLACE FUNCTION increment_ad_impression(ad_type TEXT, ad_id UUID)
RETURNS VOID AS $$
BEGIN
    IF ad_type = 'banner' THEN
        UPDATE banner_ads SET impressions = impressions + 1 WHERE id = ad_id;
    ELSIF ad_type = 'compact' THEN
        UPDATE compact_ads SET impressions = impressions + 1 WHERE id = ad_id;
    ELSIF ad_type = 'announcement' THEN
        UPDATE announcements SET views = views + 1 WHERE id = ad_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment ad clicks
CREATE OR REPLACE FUNCTION increment_ad_click(ad_type TEXT, ad_id UUID)
RETURNS VOID AS $$
BEGIN
    IF ad_type = 'banner' THEN
        UPDATE banner_ads SET clicks = clicks + 1 WHERE id = ad_id;
    ELSIF ad_type = 'compact' THEN
        UPDATE compact_ads SET clicks = clicks + 1 WHERE id = ad_id;
    ELSIF ad_type = 'announcement' THEN
        UPDATE announcements SET clicks = clicks + 1 WHERE id = ad_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment announcement dismisses
CREATE OR REPLACE FUNCTION increment_announcement_dismiss(announcement_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE announcements SET dismisses = dismisses + 1 WHERE id = announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
