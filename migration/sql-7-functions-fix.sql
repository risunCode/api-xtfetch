-- ============================================================================
-- FIX: RPC FUNCTIONS FOR COMMUNICATIONS (Run after sql-7-communications.sql)
-- ============================================================================

-- Drop existing functions if they exist (to fix delimiter issue)
DROP FUNCTION IF EXISTS increment_ad_impression(TEXT, UUID);
DROP FUNCTION IF EXISTS increment_ad_click(TEXT, UUID);
DROP FUNCTION IF EXISTS increment_announcement_dismiss(UUID);

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
