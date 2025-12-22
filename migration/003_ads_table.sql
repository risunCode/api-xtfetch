-- Migration: Create ads table for advertisement banners
-- Run this in Supabase SQL Editor

-- Create ads table
CREATE TABLE IF NOT EXISTS ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT NOT NULL,
    link_text VARCHAR(50) DEFAULT 'Shop Now',
    platform VARCHAR(20), -- shopee, tokopedia, lazada, etc
    badge_text VARCHAR(30), -- "🔥 Hot Deal", "⚡ Flash Sale"
    badge_color VARCHAR(20) DEFAULT 'orange', -- orange, red, green, blue, purple, yellow
    is_active BOOLEAN DEFAULT true,
    dismissable BOOLEAN DEFAULT true, -- can user close the ad?
    pages TEXT[] DEFAULT ARRAY['home'], -- pages to show: home, history, advanced
    priority INT DEFAULT 0, -- higher = show first
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    click_count INT DEFAULT 0,
    impression_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active ads query
CREATE INDEX IF NOT EXISTS idx_ads_active ON ads (is_active, priority DESC) WHERE is_active = true;

-- Create function to increment click count
CREATE OR REPLACE FUNCTION increment_ad_clicks(ad_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE ads SET click_count = click_count + 1 WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to increment impression count (batch)
CREATE OR REPLACE FUNCTION increment_ad_impressions(ad_ids UUID[])
RETURNS void AS $$
BEGIN
    UPDATE ads SET impression_count = impression_count + 1 WHERE id = ANY(ad_ids);
END;
$$ LANGUAGE plpgsql;

-- Insert sample ad for testing
INSERT INTO ads (title, description, image_url, link_url, link_text, platform, badge_text, badge_color, is_active, priority)
VALUES (
    'Diskon 50% Semua Produk!',
    'Promo spesial akhir tahun. Belanja sekarang dan dapatkan diskon hingga 50% untuk semua produk pilihan.',
    'https://cf.shopee.co.id/file/id-11134207-7r98t-lzqj8qj8qj8qj8',
    'https://shopee.co.id',
    '🛒 Belanja Sekarang',
    'shopee',
    '🔥 Hot Deal',
    'orange',
    true,
    10
);

-- Grant permissions (adjust based on your RLS setup)
-- ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public can read active ads" ON ads FOR SELECT USING (is_active = true);
-- CREATE POLICY "Admins can manage ads" ON ads FOR ALL USING (auth.role() = 'admin');
