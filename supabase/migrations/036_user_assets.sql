-- Last updated: 2026-04-17
-- ============================================================================
-- 036: User Assets — cross-project library of every uploaded media object
--
-- NON-BREAKING: Purely additive. Creates a new table + RLS + indexes.
--
-- What this enables:
--   • A per-user library of every image, video, and audio file they've uploaded
--   • Survives project deletion (assets outlive individual projects)
--   • Foundation for the "pick from library" UI across editor entry points
--
-- Storage objects themselves remain in their existing buckets/paths
-- ({userId}/context-images/..., {userId}/main-images/..., {userId}/voice-recordings/...).
-- This table just indexes them with enough metadata to render a library grid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_assets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  media_type              TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  mime_type               TEXT NOT NULL,
  file_name               TEXT NOT NULL,

  -- Points at existing storage objects — no duplication
  storage_bucket          TEXT NOT NULL,
  storage_path            TEXT NOT NULL,
  storage_url             TEXT NOT NULL,
  thumbnail_storage_path  TEXT,
  thumbnail_storage_url   TEXT,

  file_size               BIGINT,
  width                   INTEGER,
  height                  INTEGER,
  duration                NUMERIC,   -- ms for video/audio

  created_at              TIMESTAMPTZ DEFAULT NOW(),

  -- Idempotent inserts: safe to call recordAsset from multiple code paths
  UNIQUE (user_id, storage_path)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_assets_user_created
  ON user_assets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_type
  ON user_assets (user_id, media_type);

-- Trigram search on filename. pg_trgm should already be enabled (used elsewhere);
-- CREATE EXTENSION IF NOT EXISTS is a no-op if it is.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_user_assets_file_name_trgm
  ON user_assets USING gin (file_name gin_trgm_ops);

-- ============================================================================
-- RLS — users can only see and manage their own assets.
-- INSERT/UPDATE/DELETE all require the row's user_id to match auth.uid().
-- SELECT is private (no public/shared semantics on the library itself).
-- auth.uid() is wrapped in (SELECT ...) per migration 20250121_fix_rls_performance.
-- ============================================================================

ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_assets_select_own ON user_assets FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_assets_insert_own ON user_assets FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_assets_update_own ON user_assets FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_assets_delete_own ON user_assets FOR DELETE
  USING (user_id = (SELECT auth.uid()));
