-- Last updated: 2026-06-11
-- ============================================================================
-- 052: optional reporter "extra" field for the simplified intake form.
--
-- The reporter form now asks "Add a link or anything else?" — a free-text
-- answer that doesn't belong in `steps` (which carries "What did you enter
-- or click?"). Additive and nullable; existing rows are unaffected.
-- ============================================================================

ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS extra TEXT;

COMMENT ON COLUMN issue_reports.extra IS
  'Reporter-supplied link or extra info ("Add a link or anything else?").';
