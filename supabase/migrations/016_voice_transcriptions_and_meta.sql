-- Last updated: 2026-03-24
-- Phase 5: Add position column to voice_transcriptions (table already exists)
-- All other schema changes (title/author as regular columns, mode, editor_version,
-- voice_transcriptions table, normalized tables) already applied.

-- Add position column if missing
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
