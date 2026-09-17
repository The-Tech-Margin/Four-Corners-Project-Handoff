-- Last updated: 2026-04-10
-- Admin dashboard RPCs: content analytics, performance metrics, super_admin role.
--
-- Adds super_admin to app_role enum, seeds sonia@thetechmargin.com,
-- and creates 7 RPC functions for the Content and Performance admin tabs.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add super_admin to role enum + seed
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Seed super_admin for sonia@thetechmargin.com
-- Uses a DO block so it's safe if the user doesn't exist yet
DO $$
DECLARE
  target_uid UUID;
BEGIN
  SELECT id INTO target_uid FROM auth.users WHERE email = 'sonia@thetechmargin.com' LIMIT 1;
  IF target_uid IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role)
    VALUES (target_uid, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Content RPCs
-- ═══════════════════════════════════════════════════════════════════

-- Tag distribution via UNNEST on projects.tags text[]
CREATE OR REPLACE FUNCTION get_tag_distribution(p_limit INT DEFAULT 50)
RETURNS TABLE(tag TEXT, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT t.tag, count(*) AS count
  FROM projects, unnest(tags) AS t(tag)
  WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
  GROUP BY t.tag
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Country breakdown from project_locations
CREATE OR REPLACE FUNCTION get_location_countries()
RETURNS TABLE(country TEXT, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT country, count(*) AS count
  FROM project_locations
  WHERE country IS NOT NULL AND country != ''
  GROUP BY country
  ORDER BY count DESC;
$$;

-- Top cities
CREATE OR REPLACE FUNCTION get_top_cities(p_limit INT DEFAULT 10)
RETURNS TABLE(city TEXT, country TEXT, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT city, country, count(*) AS count
  FROM project_locations
  WHERE city IS NOT NULL AND city != ''
  GROUP BY city, country
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Equipment popularity
CREATE OR REPLACE FUNCTION get_equipment_stats(p_limit INT DEFAULT 10)
RETURNS TABLE(make TEXT, model TEXT, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT camera_make AS make, camera_model AS model, count(*) AS count
  FROM photo_metadata
  WHERE camera_make IS NOT NULL OR camera_model IS NOT NULL
  GROUP BY camera_make, camera_model
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Performance RPCs
-- ═══════════════════════════════════════════════════════════════════

-- Web Vitals summary with percentiles
CREATE OR REPLACE FUNCTION get_web_vitals_summary(p_hours INT DEFAULT 24)
RETURNS TABLE(metric TEXT, p50 DOUBLE PRECISION, p75 DOUBLE PRECISION, p95 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    metric_type AS metric,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY value) AS p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
  GROUP BY metric_type
  ORDER BY metric_type;
$$;

-- Per-route breakdown
CREATE OR REPLACE FUNCTION get_web_vitals_by_route(p_hours INT DEFAULT 24, p_limit INT DEFAULT 20)
RETURNS TABLE(path TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    path,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND path IS NOT NULL
  GROUP BY path
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Per-device breakdown
CREATE OR REPLACE FUNCTION get_web_vitals_by_device(p_hours INT DEFAULT 24)
RETURNS TABLE(device TEXT, lcp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    COALESCE(device_type, 'unknown') AS device,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
  GROUP BY device_type
  ORDER BY count DESC;
$$;

-- Grant execute to authenticated (admin routes use service_role anyway,
-- but this follows the existing pattern)
GRANT EXECUTE ON FUNCTION get_tag_distribution(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_location_countries() TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_cities(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_equipment_stats(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_summary(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_route(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_device(INT) TO authenticated;

COMMIT;
