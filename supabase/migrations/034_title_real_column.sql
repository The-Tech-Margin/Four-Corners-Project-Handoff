-- Last updated: 2026-04-16
-- ============================================================================
-- Convert projects.title from a GENERATED column to a real, user-editable
-- TEXT column — non-destructive, atomic.
--
-- Migration 008 defined title as:
--   GENERATED ALWAYS AS (COALESCE(metadata->'creativeCommons'->>'description',
--                                 metadata->'backStory'->>'text')) STORED
-- which meant the "title" column held the caption/description, not the name
-- the creator typed for the project. After this migration, application code
-- is responsible for writing the title on create/update. The slug remains
-- the URL-safe identifier derived from the title via slugify() client-side.
--
-- Dependencies that reference `projects.title` and must be dropped + rebuilt:
--   • view   gallery_feed                 (migration 023 → 026 → 030)
--   • trigger search_vector_on_projects   (migration 027)
--
-- Safety:
--   • Everything runs in one transaction — any failure rolls back cleanly.
--   • Title values are preserved via a temporary column before the drop.
--   • View and trigger are recreated with their current definitions so
--     downstream behavior is unchanged.
-- ============================================================================

BEGIN;

-- 1. Drop dependents that reference projects.title ------------------------

-- Trigger (migration 027) — named title in WHEN clause, will be recreated
DROP TRIGGER IF EXISTS search_vector_on_projects ON projects;

-- View (migration 023 → 026 → 030) — references p.title, will be recreated
-- from migration 030's definition (security_invoker = true, includes tags).
DROP VIEW IF EXISTS gallery_feed;


-- 2. Swap title from GENERATED to plain TEXT ------------------------------

-- Preserve existing title values (generated from caption/backstory) in temp
ALTER TABLE projects ADD COLUMN title_new TEXT;
UPDATE projects SET title_new = title;

-- Drop the generated column and its index
DROP INDEX IF EXISTS idx_projects_title;
ALTER TABLE projects DROP COLUMN title;

-- Rename the temp column into place
ALTER TABLE projects RENAME COLUMN title_new TO title;

-- Re-create the index for title search
CREATE INDEX idx_projects_title ON projects(title);


-- 3. Recreate gallery_feed view (matches migration 030) -------------------

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


-- 4. Recreate the search_vector_on_projects trigger -----------------------
-- Uses the existing trg_projects_search_vector() function from migration 027.

CREATE TRIGGER search_vector_on_projects
  AFTER UPDATE OF title, author, tags ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_projects_search_vector();

COMMIT;
