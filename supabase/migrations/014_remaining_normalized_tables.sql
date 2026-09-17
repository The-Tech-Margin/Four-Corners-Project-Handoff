-- Last updated: 2026-03-24
-- ============================================================================
-- 014: Create remaining normalized tables for backstory, creative commons,
--      and photographer info. Also add editor_version/mode to projects.
--
-- NON-BREAKING: Purely additive. No existing tables or data are modified.
-- ============================================================================

-- ============================================================================
-- 1. project_backstory
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_backstory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  text               TEXT,
  author             TEXT,
  publication        TEXT,
  publication_url    TEXT,
  date               TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_backstory_project_id
  ON project_backstory(project_id);

-- ============================================================================
-- 2. project_creative_commons
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_creative_commons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  copyright     TEXT,
  description   TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_creative_commons_project_id
  ON project_creative_commons(project_id);

-- ============================================================================
-- 3. project_photographer_info
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_photographer_info (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  bio            TEXT,
  contact        TEXT,
  website        TEXT,
  collaborators  TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_photographer_info_project_id
  ON project_photographer_info(project_id);

-- ============================================================================
-- 4. Add editor_version and mode columns to projects
-- ============================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS editor_version TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('minimal', 'standard', 'complete'));

-- ============================================================================
-- 5. RLS policies for new tables (same pattern as 011)
-- ============================================================================

ALTER TABLE project_backstory ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_creative_commons ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photographer_info ENABLE ROW LEVEL SECURITY;

-- project_backstory
CREATE POLICY project_backstory_select_policy ON project_backstory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_backstory.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY project_backstory_insert_policy ON project_backstory FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_backstory.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_backstory_update_policy ON project_backstory FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_backstory.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_backstory_delete_policy ON project_backstory FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_backstory.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- project_creative_commons
CREATE POLICY project_creative_commons_select_policy ON project_creative_commons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_creative_commons.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY project_creative_commons_insert_policy ON project_creative_commons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_creative_commons.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_creative_commons_update_policy ON project_creative_commons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_creative_commons.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_creative_commons_delete_policy ON project_creative_commons FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_creative_commons.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- project_photographer_info
CREATE POLICY project_photographer_info_select_policy ON project_photographer_info FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_photographer_info.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY project_photographer_info_insert_policy ON project_photographer_info FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_photographer_info.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_photographer_info_update_policy ON project_photographer_info FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_photographer_info.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_photographer_info_delete_policy ON project_photographer_info FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_photographer_info.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 6. updated_at triggers for new tables
-- ============================================================================

CREATE TRIGGER update_project_backstory_updated_at
  BEFORE UPDATE ON project_backstory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_creative_commons_updated_at
  BEFORE UPDATE ON project_creative_commons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_photographer_info_updated_at
  BEFORE UPDATE ON project_photographer_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
