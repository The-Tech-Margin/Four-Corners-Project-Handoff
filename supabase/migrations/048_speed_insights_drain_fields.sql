-- Last updated: 2026-05-29
-- Speed Insights drain fields + richer breakdown RPCs.
--
-- The Vercel Speed Insights log drain (/api/drains/speed-insights) sends a
-- richer payload than our client-side WebVitalsReporter (/api/vitals). This
-- migration extends speed_insights with the drain-only columns and adds
-- aggregation RPCs that power new breakdown sections on /admin/performance.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- 1. Drain-only columns (written by /api/drains/speed-insights)
--    Existing browser/os (033) and city/region (032) are kept; the drain
--    populates the granular *_name / *_version / engine / brand fields.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE speed_insights
  ADD COLUMN IF NOT EXISTS device_id              TEXT,
  ADD COLUMN IF NOT EXISTS device_brand           TEXT,
  ADD COLUMN IF NOT EXISTS os_name                TEXT,
  ADD COLUMN IF NOT EXISTS os_version             TEXT,
  ADD COLUMN IF NOT EXISTS client_name            TEXT,
  ADD COLUMN IF NOT EXISTS client_type            TEXT,
  ADD COLUMN IF NOT EXISTS client_version         TEXT,
  ADD COLUMN IF NOT EXISTS browser_engine         TEXT,
  ADD COLUMN IF NOT EXISTS browser_engine_version TEXT,
  ADD COLUMN IF NOT EXISTS project_id_vercel      TEXT,
  ADD COLUMN IF NOT EXISTS owner_id               TEXT,
  ADD COLUMN IF NOT EXISTS vercel_url             TEXT;

-- ───────────────────────────────────────────────────────────────────
-- 2. Breakdown RPCs (mirror get_web_vitals_by_route in 029)
--    Each returns the dimension + p75 vitals + sample count, scoped to a
--    trailing time window. Rows with a NULL dimension are excluded so these
--    reflect drain-sourced data (the /api/vitals path leaves them NULL).
-- ───────────────────────────────────────────────────────────────────

-- Browser engine (e.g. Blink, WebKit, Gecko) + version
CREATE OR REPLACE FUNCTION get_web_vitals_by_browser_engine(p_hours INT DEFAULT 24, p_limit INT DEFAULT 20)
RETURNS TABLE(engine TEXT, engine_version TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    browser_engine AS engine,
    browser_engine_version AS engine_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND browser_engine IS NOT NULL
  GROUP BY browser_engine, browser_engine_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Operating system name + version (e.g. iOS 17.4, Windows 11)
CREATE OR REPLACE FUNCTION get_web_vitals_by_os(p_hours INT DEFAULT 24, p_limit INT DEFAULT 20)
RETURNS TABLE(os_name TEXT, os_version TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    os_name,
    os_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND os_name IS NOT NULL
  GROUP BY os_name, os_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Device brand (e.g. Apple, Samsung)
CREATE OR REPLACE FUNCTION get_web_vitals_by_device_brand(p_hours INT DEFAULT 24, p_limit INT DEFAULT 20)
RETURNS TABLE(device_brand TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    device_brand,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND device_brand IS NOT NULL
  GROUP BY device_brand
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Client (browser) name + type + version
CREATE OR REPLACE FUNCTION get_web_vitals_by_client(p_hours INT DEFAULT 24, p_limit INT DEFAULT 20)
RETURNS TABLE(client_name TEXT, client_type TEXT, client_version TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    client_name,
    client_type,
    client_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND client_name IS NOT NULL
  GROUP BY client_name, client_type, client_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- Connection speed (column exists since 025; never queried until now)
CREATE OR REPLACE FUNCTION get_web_vitals_by_connection(p_hours INT DEFAULT 24)
RETURNS TABLE(connection_speed TEXT, lcp_p75 DOUBLE PRECISION, cls_p75 DOUBLE PRECISION, inp_p75 DOUBLE PRECISION, count BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    connection_speed,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND connection_speed IS NOT NULL
  GROUP BY connection_speed
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_web_vitals_by_browser_engine(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_os(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_device_brand(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_client(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_web_vitals_by_connection(INT) TO authenticated;

COMMIT;
