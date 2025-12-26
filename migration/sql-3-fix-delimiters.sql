-- ============================================================================
-- FIX: Function Delimiters ($ → $$)
-- Run this AFTER sql-2-seed.sql if you get delimiter errors
-- ============================================================================

-- Drop and recreate all functions with correct $$ delimiters

DROP FUNCTION IF EXISTS update_timestamp() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS increment_api_key_success(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS increment_api_key_error(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS reset_expired_cooldowns() CASCADE;
DROP FUNCTION IF EXISTS validate_special_referral(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS use_special_referral(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS record_download_stat(TEXT, VARCHAR, VARCHAR, BOOLEAN, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS record_error_log(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, VARCHAR, INET, TEXT, TEXT) CASCADE;

-- Function: update_timestamp()
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: handle_new_user()
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, referral_code, first_joined, last_seen)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        'XTF' || upper(substr(md5(random()::text), 1, 8)),
        NOW(),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: increment_api_key_success()
CREATE OR REPLACE FUNCTION increment_api_key_success(key_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE api_keys 
    SET total_requests = total_requests + 1, 
        success_count = success_count + 1, 
        last_used = NOW() 
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: increment_api_key_error()
CREATE OR REPLACE FUNCTION increment_api_key_error(key_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE api_keys 
    SET total_requests = total_requests + 1, 
        error_count = error_count + 1, 
        last_used = NOW() 
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: reset_expired_cooldowns()
CREATE OR REPLACE FUNCTION reset_expired_cooldowns()
RETURNS void AS $$
BEGIN
    UPDATE admin_cookie_pool 
    SET status = 'healthy', cooldown_until = NULL
    WHERE status = 'cooldown' 
      AND cooldown_until IS NOT NULL 
      AND cooldown_until < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: validate_special_referral()
CREATE OR REPLACE FUNCTION validate_special_referral(ref_code VARCHAR)
RETURNS TABLE(is_valid BOOLEAN, assigned_role user_role, error_msg TEXT) AS $$
DECLARE
    ref_record RECORD;
BEGIN
    SELECT * INTO ref_record FROM special_referrals WHERE code = ref_code AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Invalid referral code'::TEXT;
        RETURN;
    END IF;
    
    IF ref_record.expires_at IS NOT NULL AND ref_record.expires_at < NOW() THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Referral code has expired'::TEXT;
        RETURN;
    END IF;
    
    IF ref_record.max_uses IS NOT NULL AND ref_record.current_uses >= ref_record.max_uses THEN
        RETURN QUERY SELECT false, 'user'::user_role, 'Referral code has reached max uses'::TEXT;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT true, ref_record.role, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: use_special_referral()
CREATE OR REPLACE FUNCTION use_special_referral(ref_code VARCHAR)
RETURNS user_role AS $$
DECLARE
    ref_record RECORD;
BEGIN
    SELECT * INTO ref_record FROM special_referrals WHERE code = ref_code AND is_active = true FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN 'user'::user_role; 
    END IF;
    
    UPDATE special_referrals SET current_uses = current_uses + 1 WHERE id = ref_record.id;
    
    IF ref_record.max_uses IS NOT NULL AND (ref_record.current_uses + 1) >= ref_record.max_uses THEN
        UPDATE special_referrals SET is_active = false WHERE id = ref_record.id;
    END IF;
    
    RETURN ref_record.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: record_download_stat()
CREATE OR REPLACE FUNCTION record_download_stat(
    p_platform TEXT,
    p_country VARCHAR(2) DEFAULT 'XX',
    p_source VARCHAR(20) DEFAULT 'web',
    p_success BOOLEAN DEFAULT true,
    p_response_time INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO download_stats (date, platform, country, source, total_requests, success_count, error_count, avg_response_time)
    VALUES (
        CURRENT_DATE,
        p_platform,
        COALESCE(p_country, 'XX'),
        COALESCE(p_source, 'web'),
        1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        p_response_time
    )
    ON CONFLICT (date, platform, country, source)
    DO UPDATE SET
        total_requests = download_stats.total_requests + 1,
        success_count = download_stats.success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
        error_count = download_stats.error_count + CASE WHEN p_success THEN 0 ELSE 1 END,
        avg_response_time = CASE 
            WHEN p_response_time IS NOT NULL THEN 
                COALESCE((download_stats.avg_response_time * download_stats.total_requests + p_response_time) / (download_stats.total_requests + 1), p_response_time)
            ELSE download_stats.avg_response_time
        END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: record_error_log()
CREATE OR REPLACE FUNCTION record_error_log(
    p_platform TEXT,
    p_error_type TEXT,
    p_error_code TEXT,
    p_error_message TEXT,
    p_error_stack TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_api_key_id VARCHAR(20) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO error_logs (
        platform, error_type, error_code, error_message, error_stack,
        user_id, api_key_id, ip_address, user_agent, request_url
    )
    VALUES (
        p_platform, p_error_type, p_error_code, p_error_message, p_error_stack,
        p_user_id, p_api_key_id, p_ip_address, p_user_agent, p_request_url
    )
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers
DROP TRIGGER IF EXISTS trigger_users_updated ON users;
DROP TRIGGER IF EXISTS trigger_cookie_pool_updated ON admin_cookie_pool;
DROP TRIGGER IF EXISTS trigger_browser_profiles_updated ON browser_profiles;
DROP TRIGGER IF EXISTS trigger_ai_keys_updated ON ai_api_keys;
DROP TRIGGER IF EXISTS trigger_download_stats_updated ON download_stats;
DROP TRIGGER IF EXISTS trigger_alert_config_updated ON alert_config;
DROP TRIGGER IF EXISTS trigger_service_config_updated ON service_config;
DROP TRIGGER IF EXISTS trigger_system_config_updated ON system_config;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER trigger_users_updated 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_cookie_pool_updated 
    BEFORE UPDATE ON admin_cookie_pool 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_browser_profiles_updated 
    BEFORE UPDATE ON browser_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_ai_keys_updated 
    BEFORE UPDATE ON ai_api_keys 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_download_stats_updated 
    BEFORE UPDATE ON download_stats 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_alert_config_updated 
    BEFORE UPDATE ON alert_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_service_config_updated 
    BEFORE UPDATE ON service_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_system_config_updated 
    BEFORE UPDATE ON system_config 
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- END OF FIX
-- ============================================================================
