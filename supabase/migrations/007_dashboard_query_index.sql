-- Last updated: 2026-02-08
-- ============================================================================
-- Optimize Dashboard Query Performance
-- ============================================================================
-- The dashboard query is: SELECT ... FROM projects
--   WHERE user_id = ? ORDER BY created_at DESC
--
-- Existing indexes:
--   idx_projects_user_id ON (user_id)        — finds user rows but then sorts in memory
--   idx_projects_created_at ON (created_at DESC) — global sort, can't filter by user
--
-- This compound index lets Postgres satisfy both the filter AND sort from a
-- single index scan — no in-memory sort needed.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_created
  ON projects (user_id, created_at DESC);
