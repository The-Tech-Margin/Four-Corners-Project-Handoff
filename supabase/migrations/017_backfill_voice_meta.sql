-- Last updated: 2026-03-24
-- Backfill position on voice_transcriptions (sequential per project)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1 AS pos
  FROM voice_transcriptions
  WHERE position = 0
)
UPDATE voice_transcriptions vt
SET position = ranked.pos
FROM ranked
WHERE vt.id = ranked.id;
