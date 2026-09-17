-- Last updated: 2026-02-09
-- ============================================================================
-- Update title generated column to use metadata->>'title'
--
-- Previously the title column derived from:
--   COALESCE(metadata->'creativeCommons'->>'description', metadata->'backStory'->>'text')
--
-- Now that the UI stores a user-entered title at metadata->>'title',
-- we prefer that value and fall back to the previous sources.
--
-- PostgreSQL does not support ALTER COLUMN ... SET EXPRESSION for generated
-- columns, so we must DROP and re-ADD the column.
-- ============================================================================

-- Drop the existing generated column and its index
DROP INDEX IF EXISTS idx_projects_title;
ALTER TABLE projects DROP COLUMN IF EXISTS title;

-- Re-create with the new JSONB path, falling back to previous sources
ALTER TABLE projects
  ADD COLUMN title TEXT GENERATED ALWAYS AS (
    COALESCE(
      metadata->>'title',
      metadata->'creativeCommons'->>'description',
      metadata->'backStory'->>'text'
    )
  ) STORED;

-- Recreate index for title search
CREATE INDEX idx_projects_title ON projects(title);
