-- Last updated: 2026-04-10
-- Add tags column to projects for gallery filtering.
-- Free-form text[] with GIN index for efficient @> (contains) queries.
--
-- The view swap (DROP + CREATE) is wrapped in a transaction so gallery
-- queries never see a missing view. Supabase migrations run inside an
-- implicit transaction, but we use BEGIN/COMMIT explicitly for clarity.

BEGIN;

-- 1. Add column + index (safe — IF NOT EXISTS)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN (tags);

-- 2. Backfill tags from code-of-ethics selections.
--    The customEthicsText in project_ethics stores the full ethics code string.
--    We match known prefixes to derive gallery-filterable tags.
UPDATE projects p
SET tags = sub.derived_tags
FROM (
  SELECT
    e.project_id,
    array_remove(
      ARRAY[]::text[]
      || CASE WHEN e.custom_ethics_text LIKE 'As a documentary photographer%'
              THEN ARRAY['documentary'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a fashion photographer%'
              THEN ARRAY['fashion'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a fine art photographer%'
              THEN ARRAY['fine art'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'This is an artistic image%'
              THEN ARRAY['fine art', 'journalism'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a non-fiction photographer%'
              THEN ARRAY['non-fiction photography'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE '%as a photojournalist%'
              THEN ARRAY['photojournalism'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a sports photographer%'
              THEN ARRAY['sports'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a staff member of Associated Press%'
              THEN ARRAY['photojournalism', 'associated press'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE '%UNICEF%'
              THEN ARRAY['documentary', 'unicef'] ELSE ARRAY[]::text[] END
      || CASE WHEN e.custom_ethics_text LIKE 'As a wildlife photographer%'
              THEN ARRAY['wildlife'] ELSE ARRAY[]::text[] END,
      NULL
    ) AS derived_tags
  FROM project_ethics e
  WHERE e.custom_ethics_text IS NOT NULL
    AND e.custom_ethics_text != ''
) sub
WHERE p.id = sub.project_id
  AND sub.derived_tags != ARRAY[]::text[];

-- 3. Atomically swap gallery_feed view to include tags column.
--    Because this is inside a transaction, concurrent readers either see
--    the old view or the new view — never a missing one.
DROP VIEW IF EXISTS gallery_feed;

CREATE VIEW gallery_feed AS
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
