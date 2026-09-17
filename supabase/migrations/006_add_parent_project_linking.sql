-- Last updated: 2026-04-29
-- ============================================================================
-- Add Parent-Child Linking for Daisy-Chained Image Sets
-- ============================================================================

-- Add parent_project_id to track daisy-chained relationships
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS in_gallery BOOLEAN DEFAULT false;

-- Create index for parent-child queries
CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_project_id);

-- Create index for gallery queries
CREATE INDEX IF NOT EXISTS idx_projects_in_gallery ON projects(in_gallery) WHERE in_gallery = true;

-- Composite index for finding all children in gallery
CREATE INDEX IF NOT EXISTS idx_projects_parent_gallery ON projects(parent_project_id, in_gallery) WHERE parent_project_id IS NOT NULL;

-- Constraint + index from migration 005 that depend on the in_gallery column
-- just created above. On a fresh DB those statements were skipped in 005;
-- create them here. On existing DBs they already exist — guards make this
-- a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_gallery_requires_published'
  ) THEN
    ALTER TABLE projects
    ADD CONSTRAINT check_gallery_requires_published
    CHECK (in_gallery = false OR (in_gallery = true AND published = true));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_published_gallery ON projects(published, in_gallery) WHERE published = true;

-- ============================================================================
-- Helper Functions for Image Sets
-- ============================================================================

-- Function to get all children of a project (one level)
CREATE OR REPLACE FUNCTION get_project_children(project_uuid UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  main_image_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.slug,
    p.main_image_url,
    p.metadata,
    p.created_at
  FROM projects p
  WHERE p.parent_project_id = project_uuid
    AND p.in_gallery = true
  ORDER BY p.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get the root parent of a project (for grouping in gallery)
CREATE OR REPLACE FUNCTION get_root_parent(project_uuid UUID)
RETURNS UUID AS $$
DECLARE
  current_id UUID := project_uuid;
  parent_id UUID;
BEGIN
  -- Traverse up the chain to find root
  LOOP
    SELECT parent_project_id INTO parent_id
    FROM projects
    WHERE id = current_id;
    
    -- If no parent, we've found the root
    IF parent_id IS NULL THEN
      RETURN current_id;
    END IF;
    
    current_id := parent_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Update RLS Policies
-- ============================================================================

-- Allow users to see parent relationships for published projects
CREATE POLICY "Anyone can view parent relationships of published projects"
  ON projects FOR SELECT
  USING (published = true OR in_gallery = true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN projects.parent_project_id IS 'References the parent project when this project was created from a context image (daisy-chaining)';
COMMENT ON COLUMN projects.in_gallery IS 'Whether this project should appear in the public gallery';
COMMENT ON FUNCTION get_project_children IS 'Returns all direct children of a project that are in the gallery';
COMMENT ON FUNCTION get_root_parent IS 'Returns the root parent of a project chain for grouping in gallery';
