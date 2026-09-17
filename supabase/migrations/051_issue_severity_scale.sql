-- Last updated: 2026-06-10
-- ============================================================================
-- 051: convert issue_reports.severity to a 1–5 integer scale.
--
-- The reporter now picks a severity level 1–5 (5 = most severe) instead of the
-- blocker/major/minor/cosmetic enum, and the API derives the initial priority
-- from it. This migration upgrades the column in place. It is written to be
-- safe whether the column is currently the old TEXT enum or already SMALLINT
-- (idempotent), and maps any existing enum values to numbers.
-- ============================================================================

-- Drop the old enum CHECK and default before changing the column type.
ALTER TABLE issue_reports ALTER COLUMN severity DROP DEFAULT;
ALTER TABLE issue_reports DROP CONSTRAINT IF EXISTS issue_reports_severity_check;

-- Convert to SMALLINT. Old enum → level; numeric text/smallint passes through;
-- anything unexpected falls back to 3 (Medium).
ALTER TABLE issue_reports
  ALTER COLUMN severity TYPE SMALLINT
  USING (
    CASE lower(severity::text)
      WHEN 'blocker'  THEN 5
      WHEN 'major'    THEN 4
      WHEN 'minor'    THEN 2
      WHEN 'cosmetic' THEN 1
      ELSE COALESCE(
        NULLIF(regexp_replace(severity::text, '\D', '', 'g'), '')::smallint,
        3
      )
    END
  );

ALTER TABLE issue_reports ALTER COLUMN severity SET DEFAULT 3;
ALTER TABLE issue_reports ALTER COLUMN severity SET NOT NULL;
ALTER TABLE issue_reports
  ADD CONSTRAINT issue_reports_severity_check CHECK (severity BETWEEN 1 AND 5);
