-- Last updated: 2026-03-24
-- ============================================================================
-- 015: Backfill ALL normalized tables from projects.metadata JSONB
--
-- NON-BREAKING: Purely additive — uses INSERT ... ON CONFLICT DO NOTHING
-- and UPDATE ... WHERE col IS NULL guards. Safe to re-run.
--
-- Run as postgres or with service_role key (bypasses RLS).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Backfill project_backstory from metadata->'backStory'
-- ============================================================================

INSERT INTO project_backstory (
  project_id, text, author, publication, publication_url, date
)
SELECT
  p.id,
  bs->>'text',
  bs->>'author',
  bs->>'publication',
  bs->>'publicationUrl',
  bs->>'date'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'backStory' AS bs) AS bs_data
WHERE p.metadata->'backStory' IS NOT NULL
  AND jsonb_typeof(p.metadata->'backStory') = 'object'
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 2. Backfill project_creative_commons from metadata->'creativeCommons'
-- ============================================================================

INSERT INTO project_creative_commons (
  project_id, copyright, description
)
SELECT
  p.id,
  cc->>'copyright',
  cc->>'description'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'creativeCommons' AS cc) AS cc_data
WHERE p.metadata->'creativeCommons' IS NOT NULL
  AND jsonb_typeof(p.metadata->'creativeCommons') = 'object'
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 3. Backfill project_photographer_info from metadata->'photographerInfo'
-- ============================================================================

INSERT INTO project_photographer_info (
  project_id, bio, contact, website, collaborators
)
SELECT
  p.id,
  pi->>'bio',
  pi->>'contact',
  pi->>'website',
  pi->>'collaborators'
FROM projects p
CROSS JOIN LATERAL (SELECT p.metadata->'photographerInfo' AS pi) AS pi_data
WHERE p.metadata->'photographerInfo' IS NOT NULL
  AND jsonb_typeof(p.metadata->'photographerInfo') = 'object'
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 4. Backfill project_ethics (catch missing rows from newer projects)
-- ============================================================================

INSERT INTO project_ethics (
  project_id,
  custom_ethics_text, no_manipulation, manipulation_details,
  no_staging, staging_details, informed_consent, consent_details,
  identity_protected, identity_protection_details,
  consent_document_url, ai_altered, ai_altered_details
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
-- 5. Backfill project_locations (catch missing rows)
-- ============================================================================

INSERT INTO project_locations (
  project_id, latitude, longitude, city, state, country,
  formatted_location, captured_at, source,
  street, street2, address_city, district, state_province, postal_code, address_country
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

-- ============================================================================
-- 6. Backfill photo_metadata (catch missing rows)
-- ============================================================================

INSERT INTO photo_metadata (
  project_id, date_taken,
  camera_make, camera_model, lens_model, focal_length, iso, aperture, shutter_speed,
  width, height, orientation,
  software, host_computer, artist, exif_copyright, user_comment, image_description,
  temporal_data, gps_extended
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
-- 7. Backfill context_items from metadata->'context' array
--    Currently 0 rows in the table — insert all from blob.
-- ============================================================================

INSERT INTO context_items (
  project_id, source_type, filename, mime_type, caption, media_type,
  url, storage_path, thumbnail_storage_path,
  storage_url, thumbnail_storage_url,
  description, credit, date, position
)
SELECT
  p.id,
  COALESCE(elem->>'sourceType', 'upload'),
  elem->>'filename',
  elem->>'mimeType',
  COALESCE(elem->>'caption', ''),
  COALESCE(elem->>'type', 'image'),
  elem->>'url',
  elem->>'storage_path',
  elem->>'thumbnail_storage_path',
  elem->>'storage_url',
  elem->>'thumbnail_storage_url',
  elem->>'description',
  elem->>'credit',
  elem->>'date',
  (arr.idx - 1)::integer
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb))
       WITH ORDINALITY AS arr(elem, idx)
WHERE jsonb_array_length(COALESCE(p.metadata->'context', '[]'::jsonb)) > 0;

-- ============================================================================
-- 8. Backfill links from metadata->'links' array
--    Currently 0 rows in the table — insert all from blob.
-- ============================================================================

INSERT INTO links (
  project_id, title, url, source, position
)
SELECT
  p.id,
  COALESCE(elem->>'title', ''),
  COALESCE(elem->>'url', ''),
  elem->>'source',
  (arr.idx - 1)::integer
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'links', '[]'::jsonb))
       WITH ORDINALITY AS arr(elem, idx)
WHERE jsonb_array_length(COALESCE(p.metadata->'links', '[]'::jsonb)) > 0;

-- ============================================================================
-- 9. Backfill editor_version and mode on projects
-- ============================================================================

UPDATE projects
SET
  editor_version = COALESCE(editor_version, metadata->'meta'->>'editorVersion'),
  mode = COALESCE(mode, metadata->'meta'->>'mode')
WHERE metadata->'meta' IS NOT NULL
  AND jsonb_typeof(metadata->'meta') = 'object'
  AND (editor_version IS NULL OR mode IS NULL);

COMMIT;
