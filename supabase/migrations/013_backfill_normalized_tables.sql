-- Last updated: 2026-02-09
-- ============================================================================
-- 013: Backfill normalized tables from projects.metadata JSONB
--
-- NON-BREAKING: Populates the new tables/columns created in 011 + 012 by
-- reading from the existing JSONB blob. No data is modified or deleted —
-- this is purely additive (INSERT + UPDATE of new NULL columns).
--
-- Safe to re-run: uses ON CONFLICT DO NOTHING / WHERE ... IS NULL guards.
--
-- Order of operations:
--   1. project_ethics      ← metadata->'ethics'
--   2. project_locations    ← metadata->'location'
--   3. photo_metadata       ← metadata->'photoMetadata'
--   4. context_items        ← backfill new columns from metadata->'context' array
--   5. voice_transcriptions ← backfill new columns from metadata->'voiceTranscriptions'
--   6. voice_transcriptions ← resolve fieldId strings to context_item_id FKs
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Backfill project_ethics from metadata->'ethics'
-- ============================================================================

INSERT INTO project_ethics (
  project_id,
  custom_ethics_text,
  no_manipulation,
  manipulation_details,
  no_staging,
  staging_details,
  informed_consent,
  consent_details,
  identity_protected,
  identity_protection_details,
  consent_document_url,
  ai_altered,
  ai_altered_details
)
SELECT
  p.id,
  e->>'customEthicsText',
  COALESCE((e->>'noManipulation')::boolean, false),
  e->>'manipulationDetails',
  COALESCE((e->>'noStaging')::boolean, false),
  e->>'stagingDetails',
  COALESCE((e->>'informedConsent')::boolean, false),
  e->>'consentDetails',
  COALESCE((e->>'identityProtected')::boolean, false),
  e->>'identityProtectionDetails',
  e->>'consentDocumentUrl',
  (e->>'aiAltered')::boolean,
  e->>'aiAlteredDetails'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'ethics' AS e) AS ethics_data
WHERE p.metadata->'ethics' IS NOT NULL
  AND jsonb_typeof(p.metadata->'ethics') = 'object'
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 2. Backfill project_locations from metadata->'location'
-- ============================================================================

INSERT INTO project_locations (
  project_id,
  latitude,
  longitude,
  city,
  state,
  country,
  formatted_location,
  captured_at,
  source,
  street,
  street2,
  address_city,
  district,
  state_province,
  postal_code,
  address_country
)
SELECT
  p.id,
  (loc->>'latitude')::double precision,
  (loc->>'longitude')::double precision,
  loc->>'city',
  loc->>'state',
  loc->>'country',
  loc->>'formattedLocation',
  CASE WHEN loc->>'capturedAt' IS NOT NULL
       THEN (loc->>'capturedAt')::timestamptz
       ELSE NULL END,
  CASE WHEN loc->>'source' IN ('exif', 'device', 'manual', 'voicevault')
       THEN loc->>'source'
       ELSE NULL END,
  loc->'address'->>'street',
  loc->'address'->>'street2',
  loc->'address'->>'city',
  loc->'address'->>'district',
  loc->'address'->>'stateProvince',
  loc->'address'->>'postalCode',
  loc->'address'->>'country'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'location' AS loc) AS loc_data
WHERE p.metadata->'location' IS NOT NULL
  AND jsonb_typeof(p.metadata->'location') = 'object'
  AND (p.metadata->'location'->>'latitude') IS NOT NULL
  AND (p.metadata->'location'->>'longitude') IS NOT NULL
ON CONFLICT (project_id) DO NOTHING;

-- Note: the coordinates GEOGRAPHY column is auto-populated by the
-- trg_project_locations_set_coordinates trigger from 011.

-- ============================================================================
-- 3. Backfill photo_metadata from metadata->'photoMetadata'
-- ============================================================================

INSERT INTO photo_metadata (
  project_id,
  date_taken,
  camera_make,
  camera_model,
  lens_model,
  focal_length,
  iso,
  aperture,
  shutter_speed,
  width,
  height,
  orientation,
  software,
  host_computer,
  artist,
  exif_copyright,
  user_comment,
  image_description,
  temporal_data,
  gps_extended
)
SELECT
  p.id,
  pm->>'dateTaken',
  pm->'equipment'->>'cameraMake',
  pm->'equipment'->>'cameraModel',
  pm->'equipment'->>'lensModel',
  pm->'equipment'->>'focalLength',
  pm->'equipment'->>'iso',
  pm->'equipment'->>'aperture',
  pm->'equipment'->>'shutterSpeed',
  CASE WHEN pm->'image'->>'width' ~ '^\d+$'
       THEN (pm->'image'->>'width')::integer ELSE NULL END,
  CASE WHEN pm->'image'->>'height' ~ '^\d+$'
       THEN (pm->'image'->>'height')::integer ELSE NULL END,
  CASE WHEN pm->'image'->>'orientation' ~ '^\d+$'
       THEN (pm->'image'->>'orientation')::integer ELSE NULL END,
  pm->'device'->>'software',
  pm->'device'->>'hostComputer',
  pm->'device'->>'artist',
  pm->'device'->>'copyright',
  pm->'device'->>'userComment',
  pm->'device'->>'imageDescription',
  pm->'temporal',
  pm->'gps'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'photoMetadata' AS pm) AS pm_data
WHERE p.metadata->'photoMetadata' IS NOT NULL
  AND jsonb_typeof(p.metadata->'photoMetadata') = 'object'
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 4. Backfill new columns on context_items from metadata->'context' array
--
-- Strategy: Match existing context_items rows to JSONB array elements by
-- (project_id, position). Then fill in columns that are currently NULL.
-- ============================================================================

-- 4a. Backfill description, credit, date from JSONB context array
UPDATE context_items ci
SET
  description = COALESCE(ci.description, elem->>'description'),
  credit      = COALESCE(ci.credit,      elem->>'credit'),
  date        = COALESCE(ci.date,        elem->>'date')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id
  AND ci.position = (arr.idx - 1)::integer  -- jsonb_array_elements WITH ORDINALITY is 1-based
  AND (ci.description IS NULL OR ci.credit IS NULL OR ci.date IS NULL);

-- 4b. Backfill storage_url and thumbnail_storage_url from JSONB
UPDATE context_items ci
SET
  storage_url           = COALESCE(ci.storage_url,           elem->>'storage_url'),
  thumbnail_storage_url = COALESCE(ci.thumbnail_storage_url, elem->>'thumbnail_storage_url')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id
  AND ci.position = (arr.idx - 1)::integer
  AND (ci.storage_url IS NULL OR ci.thumbnail_storage_url IS NULL);

-- 4c. Backfill linked project references from JSONB
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

-- 4d. Backfill audio fields on context_items from JSONB
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

-- ============================================================================
-- 5. Backfill new columns on voice_transcriptions from JSONB
--
-- Match by (project_id, recording_id) which is the stable identifier.
-- ============================================================================

UPDATE voice_transcriptions vt
SET
  field_id          = COALESCE(vt.field_id,          elem->>'fieldId'),
  audio_storage_url = COALESCE(vt.audio_storage_url, elem->>'audioStorageUrl'),
  mime_type         = COALESCE(vt.mime_type,          elem->>'mimeType'),
  duration          = COALESCE(vt.duration,           (elem->>'duration')::numeric)
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'voiceTranscriptions', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE vt.project_id = p.id
  AND vt.recording_id = elem->>'recordingId'
  AND (vt.field_id IS NULL OR vt.audio_storage_url IS NULL OR vt.mime_type IS NULL OR vt.duration IS NULL);

-- ============================================================================
-- 6. Resolve fieldId strings → context_item_id FK on voice_transcriptions
--
-- The existing convention uses patterns like:
--   fieldId = 'context-{context_item_uuid}'
--   fieldId = 'context-desc-{context_item_uuid}'
--   fieldId = '{context_item_uuid}'
--
-- We resolve these to a proper FK. Non-matching fieldIds (like 'backstory-text')
-- are left alone — those are form-field associations, not context-item associations.
-- ============================================================================

-- Pattern: fieldId = context_item.id directly (UUID format)
UPDATE voice_transcriptions vt
SET context_item_id = ci.id
FROM context_items ci
WHERE vt.context_item_id IS NULL
  AND vt.field_id IS NOT NULL
  AND vt.field_id::text = ci.id::text
  AND ci.project_id = vt.project_id;

-- Pattern: fieldId = 'context-{uuid}'
UPDATE voice_transcriptions vt
SET context_item_id = ci.id
FROM context_items ci
WHERE vt.context_item_id IS NULL
  AND vt.field_id IS NOT NULL
  AND vt.field_id LIKE 'context-%'
  AND vt.field_id NOT LIKE 'context-desc-%'
  AND vt.field_id NOT LIKE 'context-image-%'
  AND SUBSTRING(vt.field_id FROM 9) = ci.id::text
  AND ci.project_id = vt.project_id;

-- Pattern: fieldId = 'context-desc-{uuid}'
UPDATE voice_transcriptions vt
SET context_item_id = ci.id
FROM context_items ci
WHERE vt.context_item_id IS NULL
  AND vt.field_id IS NOT NULL
  AND vt.field_id LIKE 'context-desc-%'
  AND SUBSTRING(vt.field_id FROM 14) = ci.id::text
  AND ci.project_id = vt.project_id;

-- Pattern: fieldId = 'context-image-caption-{index}' or 'context-image-description-{index}'
-- These use position-based matching — resolve by matching index to context_item.position
UPDATE voice_transcriptions vt
SET context_item_id = ci.id
FROM context_items ci
WHERE vt.context_item_id IS NULL
  AND vt.field_id IS NOT NULL
  AND vt.field_id LIKE 'context-image-caption-%'
  AND ci.project_id = vt.project_id
  AND ci.position = SUBSTRING(vt.field_id FROM 23)::integer;

UPDATE voice_transcriptions vt
SET context_item_id = ci.id
FROM context_items ci
WHERE vt.context_item_id IS NULL
  AND vt.field_id IS NOT NULL
  AND vt.field_id LIKE 'context-image-description-%'
  AND ci.project_id = vt.project_id
  AND ci.position = SUBSTRING(vt.field_id FROM 27)::integer;

COMMIT;
