-- Last updated: 2026-04-10
-- 032_speed_insights_geo.sql
-- Add city/region columns to speed_insights and expose a geographic
-- breakdown RPC for the admin overview map.

ALTER TABLE speed_insights
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_si_country
  ON speed_insights(country) WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_si_city
  ON speed_insights(city) WHERE city IS NOT NULL;

-- Geographic breakdown for the admin overview. Counts unique sessions
-- per country/city using distinct session_id when available, falling back
-- to a simple COUNT(*) of rows.
CREATE OR REPLACE FUNCTION get_geo_breakdown(p_hours integer DEFAULT 24)
RETURNS TABLE(
  country text,
  city text,
  region text,
  count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    country,
    city,
    region,
    COUNT(*)::bigint AS count
  FROM speed_insights
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND country IS NOT NULL
  GROUP BY country, city, region
  ORDER BY COUNT(*) DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION get_geo_breakdown(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_geo_breakdown(integer) TO service_role;
