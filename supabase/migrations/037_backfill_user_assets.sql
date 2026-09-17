-- Last updated: 2026-04-17
-- ============================================================================
-- 037: Backfill user_assets from existing projects data
--
-- Populates the user_assets library from existing media:
--   1) context_items        -> image/video/audio
--   2) projects.main_image* -> main project images
--   3) voice_transcriptions -> audio recordings
--
-- Idempotent via ON CONFLICT (user_id, storage_path) DO NOTHING
-- ============================================================================

-- Optional safety: run in a transaction
BEGIN;

-- ============================================================================
-- 1) Context media
--    Fixes prior error by removing ci.type (column does not exist).
--    media_type derived from:
--      - ci.media_type when present
--      - otherwise mime_type prefix
--      - fallback 'image'
-- ============================================================================

INSERT INTO user_assets (
  user_id,
  media_type,
  mime_type,
  file_name,
  storage_bucket,
  storage_path,
  storage_url,
  thumbnail_storage_path,
  thumbnail_storage_url,
  width,
  height,
  duration,
  created_at
)
SELECT
  p.user_id,
  COALESCE(
    ci.media_type,
    CASE
      WHEN ci.mime_type ILIKE 'video/%' THEN 'video'
      WHEN ci.mime_type ILIKE 'audio/%' THEN 'audio'
      ELSE 'image'
    END
  ) AS media_type,
  COALESCE(ci.mime_type, 'application/octet-stream') AS mime_type,
  COALESCE(ci.filename, regexp_replace(ci.storage_path, '^.*/', ''), 'untitled') AS file_name,
  'context-media' AS storage_bucket,
  ci.storage_path,
  ci.storage_url,
  ci.thumbnail_storage_path,
  ci.thumbnail_storage_url,
  ci.width,
  ci.height,
  ci.duration,
  COALESCE(ci.created_at, now()) AS created_at
FROM context_items AS ci
JOIN projects AS p
  ON p.id = ci.project_id
WHERE ci.storage_path IS NOT NULL
  AND ci.storage_url IS NOT NULL
ON CONFLICT (user_id, storage_path) DO NOTHING;

-- ============================================================================
-- 2) Main project images
-- ============================================================================

INSERT INTO user_assets (
  user_id,
  media_type,
  mime_type,
  file_name,
  storage_bucket,
  storage_path,
  storage_url,
  created_at
)
SELECT
  p.user_id,
  'image' AS media_type,
  CASE
    WHEN p.main_image_storage_path ILIKE '%.png'  THEN 'image/png'
    WHEN p.main_image_storage_path ILIKE '%.webp' THEN 'image/webp'
    WHEN p.main_image_storage_path ILIKE '%.gif'  THEN 'image/gif'
    WHEN p.main_image_storage_path ILIKE '%.heic' THEN 'image/heic'
    WHEN p.main_image_storage_path ILIKE '%.heif' THEN 'image/heif'
    WHEN p.main_image_storage_path ILIKE '%.jpg'  THEN 'image/jpeg'
    WHEN p.main_image_storage_path ILIKE '%.jpeg' THEN 'image/jpeg'
    ELSE 'image/jpeg'
  END AS mime_type,
  regexp_replace(p.main_image_storage_path, '^.*/', '') AS file_name,
  'context-media' AS storage_bucket,
  p.main_image_storage_path,
  p.main_image_url,
  COALESCE(p.created_at, now()) AS created_at
FROM projects AS p
WHERE p.main_image_storage_path IS NOT NULL
  AND p.main_image_url IS NOT NULL
ON CONFLICT (user_id, storage_path) DO NOTHING;

-- ============================================================================
-- 3) Voice recordings
-- ============================================================================

INSERT INTO user_assets (
  user_id,
  media_type,
  mime_type,
  file_name,
  storage_bucket,
  storage_path,
  storage_url,
  duration,
  created_at
)
SELECT
  p.user_id,
  'audio' AS media_type,
  COALESCE(vt.mime_type, 'audio/webm') AS mime_type,
  regexp_replace(vt.audio_storage_path, '^.*/', '') AS file_name,
  'voice-recordings' AS storage_bucket,
  vt.audio_storage_path,
  COALESCE(vt.audio_storage_url, '') AS storage_url,
  vt.duration,
  COALESCE(vt.created_at, now()) AS created_at
FROM voice_transcriptions AS vt
JOIN projects AS p
  ON p.id = vt.project_id
WHERE vt.audio_storage_path IS NOT NULL
ON CONFLICT (user_id, storage_path) DO NOTHING;

COMMIT;