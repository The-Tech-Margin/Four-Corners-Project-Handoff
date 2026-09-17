-- Last updated: 2026-04-08
-- ============================================================================
-- 024: Re-sync context_items fields from JSONB metadata
--
-- The normalized write path (createContextItem) was missing audio and
-- linked project columns, so every save after backfill 013 silently
-- dropped this data from context_items rows. The JSONB metadata column
-- still has the data.
--
-- This re-runs the same logic as 013 sections 4c + 4d to restore it.
-- Safe to run multiple times (COALESCE prevents overwriting existing data).
-- ============================================================================

-- 1. Re-sync audio fields
UPDATE context_items ci
SET
  audio_storage_path = COALESCE(ci.audio_storage_path, elem->>'audioStoragePath'),
  audio_storage_url  = COALESCE(ci.audio_storage_url,  elem->>'audioStorageUrl'),
  audio_mime_type    = COALESCE(ci.audio_mime_type,     elem->>'audioMimeType'),
  audio_duration     = COALESCE(ci.audio_duration,      (elem->>'audioDuration')::numeric)
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id
  AND ci.position = (arr.idx - 1)::integer
  AND (ci.audio_storage_path IS NULL OR ci.audio_storage_url IS NULL)
  AND (elem->>'audioStoragePath' IS NOT NULL OR elem->>'audioStorageUrl' IS NOT NULL);

-- 2. Re-sync linked project references
UPDATE context_items ci
SET
  linked_project_id   = COALESCE(ci.linked_project_id, (elem->>'linkedProjectId')::uuid),
  linked_project_slug = COALESCE(ci.linked_project_slug, elem->>'linkedProjectSlug')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id
  AND ci.position = (arr.idx - 1)::integer
  AND (ci.linked_project_id IS NULL OR ci.linked_project_slug IS NULL)
  AND (elem->>'linkedProjectId' IS NOT NULL OR elem->>'linkedProjectSlug' IS NOT NULL);

-- 3. Re-sync storage URLs (in case they were also dropped)
UPDATE context_items ci
SET
  storage_url           = COALESCE(ci.storage_url,           elem->>'storage_url'),
  thumbnail_storage_url = COALESCE(ci.thumbnail_storage_url, elem->>'thumbnail_storage_url')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id
  AND ci.position = (arr.idx - 1)::integer
  AND (ci.storage_url IS NULL OR ci.thumbnail_storage_url IS NULL)
  AND (elem->>'storage_url' IS NOT NULL OR elem->>'thumbnail_storage_url' IS NOT NULL);
