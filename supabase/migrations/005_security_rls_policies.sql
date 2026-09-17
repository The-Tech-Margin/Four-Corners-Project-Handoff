-- Last updated: 2026-04-29
-- ============================================================================
-- CRITICAL SECURITY FIXES - Row Level Security Policies
-- Migration: 005_security_rls_policies.sql
-- Date: 2026-01-16
-- ============================================================================

-- 1. Enable Row Level Security on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Users can read their own projects
-- Drop legacy names from 003 + any prior run of this migration
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can read own projects" ON projects;
CREATE POLICY "Users can read own projects"
ON projects FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3. Policy: Public can read published projects (for share links)
DROP POLICY IF EXISTS "Anyone can view published projects" ON projects;
DROP POLICY IF EXISTS "Public can read published projects" ON projects;
CREATE POLICY "Public can read published projects"
ON projects FOR SELECT
TO public
USING (published = true);

-- 4. Policy: Authenticated users can read published projects (for gallery)
DROP POLICY IF EXISTS "Authenticated users can read published projects" ON projects;
CREATE POLICY "Authenticated users can read published projects"
ON projects FOR SELECT
TO authenticated
USING (published = true);

-- 5. Users can insert their own projects
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "Users can insert own projects"
ON projects FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 6. Users can update their own projects
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects"
ON projects FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 7. Users can delete their own projects
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects"
ON projects FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 8. Add constraint: in_gallery requires published
-- This ensures no unpublished project can be marked as in_gallery.
-- Wrapped in a DO block because the in_gallery column is added in
-- migration 006 — on a fresh DB this block becomes a no-op and migration
-- 006 (re-)adds the constraint after creating the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'in_gallery'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_gallery_requires_published'
  ) THEN
    ALTER TABLE projects
    ADD CONSTRAINT check_gallery_requires_published
    CHECK (in_gallery = false OR (in_gallery = true AND published = true));
  END IF;
END $$;

-- 9. Create index on user_id for better query performance with RLS
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- 10. Create index on published and in_gallery for gallery queries.
-- Same column-ordering caveat as the constraint above — created here when
-- in_gallery already exists, otherwise migration 006 creates it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'in_gallery'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_projects_published_gallery ON projects(published, in_gallery) WHERE published = true;
  END IF;
END $$;

-- ============================================================================
-- Context Items and Links RLS Policies
-- These tables should inherit access control from projects
-- ============================================================================

-- Enable RLS on context_items
ALTER TABLE context_items ENABLE ROW LEVEL SECURITY;

-- Users can read context items for projects they own or that are published
CREATE POLICY "Users can read context items for accessible projects"
ON context_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = context_items.project_id 
    AND (projects.user_id = auth.uid() OR projects.published = true)
  )
);

-- Public can read context items for published projects
CREATE POLICY "Public can read context items for published projects"
ON context_items FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = context_items.project_id 
    AND projects.published = true
  )
);

-- Users can insert context items for their own projects
CREATE POLICY "Users can insert context items for own projects"
ON context_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = context_items.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Users can update context items for their own projects
CREATE POLICY "Users can update context items for own projects"
ON context_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = context_items.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Users can delete context items for their own projects
CREATE POLICY "Users can delete context items for own projects"
ON context_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = context_items.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Enable RLS on links
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- Users can read links for projects they own or that are published
CREATE POLICY "Users can read links for accessible projects"
ON links FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = links.project_id 
    AND (projects.user_id = auth.uid() OR projects.published = true)
  )
);

-- Public can read links for published projects
CREATE POLICY "Public can read links for published projects"
ON links FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = links.project_id 
    AND projects.published = true
  )
);

-- Users can insert links for their own projects
CREATE POLICY "Users can insert links for own projects"
ON links FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = links.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Users can update links for their own projects
CREATE POLICY "Users can update links for own projects"
ON links FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = links.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Users can delete links for their own projects
CREATE POLICY "Users can delete links for own projects"
ON links FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = links.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- ============================================================================
-- Verification Query
-- Run this to verify all policies were created successfully
-- ============================================================================

-- View all policies on projects table
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('projects', 'context_items', 'links')
-- ORDER BY tablename, policyname;
