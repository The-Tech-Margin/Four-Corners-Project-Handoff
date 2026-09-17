-- Last updated: 2026-04-17
-- ============================================================================
-- 038: Extend user_assets media_type CHECK to allow documents.
--
-- Adds 'document' as a valid media_type so consent forms, PDFs, and other
-- non-AV uploads can be indexed in the per-user library alongside images,
-- videos, and audio.
--
-- NON-BREAKING: Purely additive. Existing rows remain valid under the
-- replaced constraint.
-- ============================================================================

ALTER TABLE user_assets DROP CONSTRAINT IF EXISTS user_assets_media_type_check;

ALTER TABLE user_assets
  ADD CONSTRAINT user_assets_media_type_check
  CHECK (media_type IN ('image', 'video', 'audio', 'document'));

-- ============================================================================
-- Backfill existing consent documents. Projects store the signed consent PDF
-- URL in ethics.consent_document_url on the JSONB metadata. The storage path
-- sits in the `consent-documents` bucket keyed by {userId}/...
--
-- We scan projects.metadata->'ethics'->>'consentDocumentUrl' for any URL that
-- resolves to a consent-documents path and index it.
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
SELECT DISTINCT
  p.user_id,
  'document' AS media_type,
  'application/pdf' AS mime_type,
  regexp_replace(
    regexp_replace(p.metadata->'ethics'->>'consentDocumentUrl', '\?.*$', ''),
    '^.*/',
    ''
  ) AS file_name,
  'consent-documents' AS storage_bucket,
  -- Best-effort path extraction: keep everything after the user-id segment.
  regexp_replace(
    regexp_replace(p.metadata->'ethics'->>'consentDocumentUrl', '\?.*$', ''),
    '^.*/object/(?:sign|public)/consent-documents/',
    ''
  ) AS storage_path,
  p.metadata->'ethics'->>'consentDocumentUrl' AS storage_url,
  p.created_at
FROM projects p
WHERE p.metadata ? 'ethics'
  AND p.metadata->'ethics'->>'consentDocumentUrl' IS NOT NULL
  AND p.metadata->'ethics'->>'consentDocumentUrl' <> ''
ON CONFLICT (user_id, storage_path) DO NOTHING;
