-- Last updated: 2026-04-10
-- 033_page_views.sql
-- Page view analytics table + aggregation RPCs. Captures the dimensions
-- shown in Vercel's Web Analytics dashboard (referrer, browser, OS, UTM,
-- geography) from our own ingest endpoint so we don't depend on the
-- Vercel-only read API.
--
-- Also extends speed_insights with browser/os columns so the existing
-- Performance page can break down vitals by browser/os.

ALTER TABLE speed_insights
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text;

CREATE TABLE IF NOT EXISTS page_views (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp     timestamptz NOT NULL DEFAULT now(),
  session_id    text,
  path          text NOT NULL,
  route         text,
  referrer      text,
  referrer_host text,
  user_agent    text,
  browser       text,
  os            text,
  device_type   text,
  country       text,
  city          text,
  region        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  deployment_id text,
  vercel_env    text
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service_role only

CREATE INDEX IF NOT EXISTS idx_pv_timestamp
  ON page_views(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pv_path
  ON page_views(path, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pv_country
  ON page_views(country) WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pv_referrer
  ON page_views(referrer_host) WHERE referrer_host IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pv_session
  ON page_views(session_id) WHERE session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
--  RPC: summary totals
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_page_views_summary(p_hours integer DEFAULT 24)
RETURNS TABLE(
  total_views bigint,
  unique_sessions bigint,
  unique_paths bigint,
  unique_countries bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_views,
    COUNT(DISTINCT session_id)::bigint AS unique_sessions,
    COUNT(DISTINCT path)::bigint AS unique_paths,
    COUNT(DISTINCT country)::bigint AS unique_countries
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: top pages
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_pages(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(path text, views bigint, sessions bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    path,
    COUNT(*)::bigint AS views,
    COUNT(DISTINCT session_id)::bigint AS sessions
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY path
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: top referrers
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_referrers(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(referrer_host text, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    referrer_host,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND referrer_host IS NOT NULL
    AND referrer_host <> ''
  GROUP BY referrer_host
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: browser breakdown
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_browser_breakdown(p_hours integer DEFAULT 24)
RETURNS TABLE(browser text, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(browser, 'Unknown') AS browser,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY COALESCE(browser, 'Unknown')
  ORDER BY COUNT(*) DESC;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: os breakdown
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_os_breakdown(p_hours integer DEFAULT 24)
RETURNS TABLE(os text, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(os, 'Unknown') AS os,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY COALESCE(os, 'Unknown')
  ORDER BY COUNT(*) DESC;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: country + city breakdown
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_pv_country_breakdown(p_hours integer DEFAULT 24)
RETURNS TABLE(country text, city text, region text, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    country,
    city,
    region,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND country IS NOT NULL
  GROUP BY country, city, region
  ORDER BY COUNT(*) DESC
  LIMIT 200;
$$;

-- ─────────────────────────────────────────────────────────────
--  RPC: UTM breakdown
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_utm_breakdown(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(source text, medium text, campaign text, views bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    utm_source AS source,
    utm_medium AS medium,
    utm_campaign AS campaign,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  GROUP BY utm_source, utm_medium, utm_campaign
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;

-- Lock down execution to service_role
REVOKE ALL ON FUNCTION get_page_views_summary(integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_top_pages(integer, integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_top_referrers(integer, integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_browser_breakdown(integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_os_breakdown(integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_pv_country_breakdown(integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_utm_breakdown(integer, integer)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_page_views_summary(integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_top_pages(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_top_referrers(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_browser_breakdown(integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_os_breakdown(integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_pv_country_breakdown(integer) TO service_role;
GRANT EXECUTE ON FUNCTION get_utm_breakdown(integer, integer) TO service_role;
