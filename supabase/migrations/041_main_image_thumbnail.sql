-- Last updated: 2026-04-29
-- ============================================================================
-- Add main_image_thumbnail_path to projects + expose via gallery_feed view.
--
-- WHY: gallery cards currently load the full main image (often multi-MB) which
-- dominates LCP on /gallery. A 400px-max aspect-preserving JPEG thumbnail is
-- generated client-side at save time and uploaded next to the original. The
-- gallery card prefers this thumb when present and falls back to the full
-- image for legacy rows (graceful degradation during the backfill window).
--
-- Aspect ratio is preserved by the existing client thumbnail generator
-- (proportional scale, never upscales). No image is cropped or skewed.
--
-- This migration is additive — `main_image_url` and `main_image_storage_path`
-- columns/behavior are unchanged. Application reads of `gallery_feed` keep
-- working with or without the new column populated (NULL is allowed).
--
-- Dependencies that reference projects.* and must be recreated:
--   • view  gallery_feed  (latest definition: migration 034)
--
-- The view is rebuilt verbatim from migration 034 with the new column added.
-- ============================================================================

BEGIN;

-- 1. Add the column ---------------------------------------------------------

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS main_image_thumbnail_path TEXT;

COMMENT ON COLUMN projects.main_image_thumbnail_path IS
  '400px-max aspect-preserving JPEG thumbnail of main_image, stored alongside it in the same bucket. Best-effort: NULL when generation failed or the row predates this column. Gallery cards prefer this over main_image_url and fall back to the full image when NULL.';


-- 2. Recreate gallery_feed view (matches migration 034 + thumb path) -------

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
  p.main_image_thumbnail_path,
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
LEFT JOIN project_backstory bs ON bs.project_id = p.id
LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
LEFT JOIN project_locations loc ON loc.project_id = p.id
LEFT JOIN photo_metadata pm ON pm.project_id = p.id
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
