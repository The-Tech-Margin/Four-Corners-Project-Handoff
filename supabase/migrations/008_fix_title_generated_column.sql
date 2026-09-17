-- Last updated: 2026-02-09
-- ============================================================================
-- Fix title generated column expression
--
-- The title column was defined as:
--   GENERATED ALWAYS AS (metadata->>'title') STORED
-- but the metadata JSONB has no top-level 'title' key — the title
-- lives at metadata->'creativeCommons'->>'description'.
-- This meant the title column was always NULL.
--
-- PostgreSQL does not support ALTER COLUMN ... SET EXPRESSION for generated
-- columns, so we must DROP and re-ADD the column.
-- ============================================================================

-- Drop the broken generated column and its index
DROP INDEX IF EXISTS idx_projects_title;
ALTER TABLE projects DROP COLUMN IF EXISTS title;

-- Re-create with the correct JSONB path
ALTER TABLE projects
  ADD COLUMN title TEXT GENERATED ALWAYS AS (
    COALESCE(
      metadata->'creativeCommons'->>'description',
      metadata->'backStory'->>'text'
    )
  ) STORED;

-- Recreate index for title search
CREATE INDEX idx_projects_title ON projects(title);
