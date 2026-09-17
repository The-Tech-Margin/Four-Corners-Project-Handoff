-- Last updated: 2026-01-19
-- ============================================================================
-- Add versioning and forking support to projects
-- ============================================================================

-- Add versioning columns to projects table
ALTER TABLE projects
ADD COLUMN parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN version_number INTEGER DEFAULT 1,
ADD COLUMN forked_from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN is_fork BOOLEAN DEFAULT false;

-- Create index for finding versions/forks
CREATE INDEX idx_projects_parent ON projects(parent_project_id);
CREATE INDEX idx_projects_forked_from ON projects(forked_from_user_id);

-- Add comment explaining the versioning model
COMMENT ON COLUMN projects.parent_project_id IS 'Reference to the original project this was copied/forked from';
COMMENT ON COLUMN projects.version_number IS 'Version number for tracking copies (incremented for each copy)';
COMMENT ON COLUMN projects.forked_from_user_id IS 'User ID of the original project owner (if forked from another user)';
COMMENT ON COLUMN projects.is_fork IS 'True if this project was copied from another user''s project';
