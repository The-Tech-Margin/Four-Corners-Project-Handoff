-- Last updated: 2026-02-09
-- ============================================================================
-- 012: Context audio/video support — one-to-many audio+transcription mapping
--
-- NON-BREAKING: Purely additive. Creates one new junction table, adds columns
-- to two existing tables. No existing data, queries, or behaviour changed.
--
-- What this enables:
--   • Multiple audio recordings per context item (one-to-many)
--   • Direct FK from voice_transcriptions → context_items (replaces fieldId convention)
--   • Video dimension/duration tracking on context items
--   • Storage URLs persisted on context_items (fixes the JSONB-only bug)
-- ============================================================================

-- ============================================================================
-- 1. Junction table: context_item_audio
--    One context item → many audio recordings, each optionally transcribed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_item_audio (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_item_id         UUID NOT NULL REFERENCES context_items(id) ON DELETE CASCADE,
  voice_transcription_id  UUID REFERENCES voice_transcriptions(id) ON DELETE SET NULL,

  -- Audio file storage
  storage_path            TEXT,
  storage_url             TEXT,
  mime_type               TEXT,
  duration                NUMERIC,           -- milliseconds

  -- Ordering within a context item
  position                INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_item_audio_context_item_id
  ON context_item_audio(context_item_id);
CREATE INDEX IF NOT EXISTS idx_context_item_audio_transcription_id
  ON context_item_audio(voice_transcription_id);
CREATE INDEX IF NOT EXISTS idx_context_item_audio_position
  ON context_item_audio(context_item_id, position);

-- ============================================================================
-- 2. Add context_item_id FK to voice_transcriptions
--    Replaces the brittle fieldId string convention for context-item associations.
--    fieldId is preserved — it still serves form-field associations (backstory, etc.)
-- ============================================================================

ALTER TABLE voice_transcriptions
  ADD COLUMN IF NOT EXISTS context_item_id UUID REFERENCES context_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_context_item_id
  ON voice_transcriptions(context_item_id);

-- ============================================================================
-- 3. Video metadata columns on context_items
-- ============================================================================

ALTER TABLE context_items ADD COLUMN IF NOT EXISTS duration  NUMERIC;    -- video duration ms
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS width     INTEGER;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS height    INTEGER;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS codec     TEXT;

-- ============================================================================
-- 4. Storage URL columns on context_items
--    These exist in the Zod schema (field-registry.ts) and are populated by
--    useProjectSave, but were never added to the SQL table — storage URLs
--    only survived in the JSONB blob. This fixes that.
-- ============================================================================

ALTER TABLE context_items ADD COLUMN IF NOT EXISTS storage_url            TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS thumbnail_storage_url  TEXT;

-- ============================================================================
-- 5. RLS policies for context_item_audio
--    Access inherits from parent context_item → parent project.
-- ============================================================================

ALTER TABLE context_item_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY context_item_audio_select_policy ON context_item_audio FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM context_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = context_item_audio.context_item_id
      AND (p.user_id = (SELECT auth.uid()) OR p.published = true)
    )
  );

CREATE POLICY context_item_audio_insert_policy ON context_item_audio FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM context_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = context_item_audio.context_item_id
      AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY context_item_audio_update_policy ON context_item_audio FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM context_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = context_item_audio.context_item_id
      AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY context_item_audio_delete_policy ON context_item_audio FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM context_items ci
      JOIN projects p ON p.id = ci.project_id
      WHERE ci.id = context_item_audio.context_item_id
      AND p.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 6. updated_at trigger for context_item_audio
-- ============================================================================

CREATE TRIGGER update_context_item_audio_updated_at
  BEFORE UPDATE ON context_item_audio
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
