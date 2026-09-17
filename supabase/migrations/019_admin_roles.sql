-- Last updated: 2026-04-01
-- ============================================================================
-- Admin Role System
-- Migration: 019_admin_roles.sql
-- Date: 2026-03-30
--
-- Creates a user_roles table to track elevated roles (admin, moderator, etc.)
-- Uses service_role for reads/writes — no anon access.
-- ============================================================================

-- 1. Create enum for roles
CREATE TYPE app_role AS ENUM ('admin', 'moderator');

-- 2. Create user_roles table
CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL DEFAULT 'moderator',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Enable RLS — deny all by default (only service_role bypasses RLS)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Policy: users can read their OWN roles (so client can check)
CREATE POLICY "Users can read own roles"
ON user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 5. No insert/update/delete policies for authenticated —
--    all mutations go through service_role in API routes.

-- 6. Index for fast lookups
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ============================================================================
-- Admin-only views (accessible via service_role)
-- Aggregate stats with NO personally-identifiable information
-- ============================================================================

-- 7. Materialized view for platform stats (refreshed by admin API)
CREATE MATERIALIZED VIEW IF NOT EXISTS platform_stats AS
SELECT
  (SELECT count(*) FROM auth.users)                               AS total_users,
  (SELECT count(*) FROM projects)                                 AS total_projects,
  (SELECT count(*) FROM projects WHERE published = true)          AS total_published,
  (SELECT count(*) FROM projects WHERE published = true
                                  AND in_gallery = true)          AS total_gallery,
  (SELECT count(*) FROM projects WHERE published = false)         AS total_private,
  (SELECT count(*) FROM context_items)                            AS total_context_items,
  (SELECT count(DISTINCT project_id) FROM context_items)          AS projects_with_context,
  (SELECT count(*) FROM voice_transcriptions)                     AS total_transcriptions,
  now()                                                           AS refreshed_at;

-- Allow refresh by service_role
CREATE UNIQUE INDEX ON platform_stats (refreshed_at);

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT * FROM platform_stats;
-- SELECT * FROM user_roles;
