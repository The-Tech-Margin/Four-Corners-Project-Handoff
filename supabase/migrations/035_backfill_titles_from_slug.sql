-- Last updated: 2026-04-16
-- ============================================================================
-- Backfill projects.title from slug where title is NULL or empty.
--
-- After migration 034 converted title from a GENERATED column to a real
-- column, some projects lost their user-facing title because the generated
-- expression derived from caption/backstory fields — not the name the
-- creator originally typed. The slug still holds the URL-safe version of
-- that original name.
--
-- This migration converts slugs back to title-case names:
--   "my-cool-photo"  →  "My Cool Photo"
-- ============================================================================

UPDATE projects
SET title = INITCAP(REPLACE(slug, '-', ' ')),
    updated_at = NOW()
WHERE slug IS NOT NULL
  AND slug <> ''
  AND (title IS NULL OR TRIM(title) = '');
