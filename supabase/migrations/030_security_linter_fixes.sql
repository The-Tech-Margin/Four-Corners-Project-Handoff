-- Last updated: 2026-04-10
-- Fix Supabase security linter issues:
-- 1. platform_stats exposes auth.users via materialized view
-- 2. gallery_feed uses SECURITY DEFINER (default) instead of INVOKER
-- 3. spatial_ref_sys (PostGIS) has no RLS

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. platform_stats — remove auth.users reference
--    Replace the materialized view with one that counts distinct
--    user_ids from projects instead of querying auth.users directly.
-- ═══════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS platform_stats;

CREATE MATERIALIZED VIEW platform_stats AS
SELECT
  (SELECT count(DISTINCT user_id) FROM projects)                 AS total_users,
  (SELECT count(*) FROM projects)                                AS total_projects,
  (SELECT count(*) FROM projects WHERE published = true)         AS total_published,
  (SELECT count(*) FROM projects WHERE published = true
                                  AND in_gallery = true)         AS total_gallery,
  (SELECT count(*) FROM projects WHERE published = false)        AS total_private,
  (SELECT count(*) FROM context_items)                           AS total_context_items,
  (SELECT count(DISTINCT project_id) FROM context_items)         AS projects_with_context,
  (SELECT count(*) FROM voice_transcriptions)                    AS total_transcriptions,
  now()                                                          AS refreshed_at;

CREATE UNIQUE INDEX ON platform_stats (refreshed_at);

-- Revoke direct access from anon/authenticated — only service_role reads this
REVOKE ALL ON platform_stats FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 2. gallery_feed — set security_invoker = true
--    Recreate the view with SECURITY INVOKER so RLS of the querying
--    user is enforced, not the view creator's permissions.
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS gallery_feed;

CREATE VIEW gallery_feed
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.slug,
  p.title,
  p.author,
  p.date,
  CASE
    WHEN p.main_image_storage_path IS NOT NULL THEN NULL
    ELSE p.main_image_url
  END AS main_image_url,
  p.main_image_storage_path,
  p.published,
  p.in_gallery,
  p.created_at,
  p.updated_at,
  p.user_id,
  p.parent_project_id,
  p.tags,

  -- 1:1 backstory
  bs.text        AS backstory_text,
  bs.author      AS backstory_author,
  bs.publication AS backstory_publication,
  bs.date        AS backstory_date,

  -- 1:1 creative commons
  cc.copyright   AS cc_copyright,
  cc.description AS cc_description,

  -- 1:1 location
  loc.city       AS location_city,
  loc.state      AS location_state,
  loc.country    AS location_country,
  loc.formatted_location AS location_formatted,

  -- 1:1 photo metadata
  pm.camera_make,
  pm.camera_model,

  -- 1:many context items — aggregated to JSON array
  COALESCE(ci.items, '[]'::json) AS context_items,

  -- 1:many links — aggregated to JSON array
  COALESCE(lk.items, '[]'::json) AS links

FROM projects p
LEFT JOIN project_backstory bs  ON bs.project_id = p.id
LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
LEFT JOIN project_locations loc ON loc.project_id = p.id
LEFT JOIN photo_metadata pm     ON pm.project_id = p.id
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
  FROM context_items c
  WHERE c.project_id = p.id
) ci ON TRUE
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
  FROM links l
  WHERE l.project_id = p.id
) lk ON TRUE

WHERE p.published = TRUE
  AND p.in_gallery = TRUE;

GRANT SELECT ON gallery_feed TO anon, authenticated;

COMMIT;
