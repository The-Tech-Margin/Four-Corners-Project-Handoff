-- Last updated: 2026-02-09
-- ============================================================================
-- 011: Normalize schema — create new tables + add missing columns
--
-- NON-BREAKING: Purely additive. No existing tables, columns, or data are
-- modified or removed. Nothing reads from these yet.
-- ============================================================================

-- ============================================================================
-- 1. project_ethics (new table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_ethics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  custom_ethics_text          TEXT,
  no_manipulation             BOOLEAN NOT NULL DEFAULT false,
  manipulation_details        TEXT,
  no_staging                  BOOLEAN NOT NULL DEFAULT false,
  staging_details             TEXT,
  informed_consent            BOOLEAN NOT NULL DEFAULT false,
  consent_details             TEXT,
  identity_protected          BOOLEAN NOT NULL DEFAULT false,
  identity_protection_details TEXT,
  consent_document_url        TEXT,
  ai_altered                  BOOLEAN DEFAULT false,
  ai_altered_details          TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_ethics_project_id
  ON project_ethics(project_id);

-- Useful filter indexes
CREATE INDEX IF NOT EXISTS idx_project_ethics_ai_altered
  ON project_ethics(ai_altered) WHERE ai_altered = true;
CREATE INDEX IF NOT EXISTS idx_project_ethics_consent
  ON project_ethics(informed_consent) WHERE informed_consent = true;

-- ============================================================================
-- 2. project_locations (new table, with PostGIS)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS project_locations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Proper geospatial column for radius/proximity queries
  coordinates        GEOGRAPHY(POINT, 4326),

  -- Discrete columns for direct access
  latitude           DOUBLE PRECISION NOT NULL,
  longitude          DOUBLE PRECISION NOT NULL,
  city               TEXT,
  state              TEXT,
  country            TEXT,
  formatted_location TEXT,
  captured_at        TIMESTAMPTZ,
  source             TEXT CHECK (source IN ('exif', 'device', 'manual', 'voicevault')),

  -- Address fields
  street             TEXT,
  street2            TEXT,
  address_city       TEXT,
  district           TEXT,
  state_province     TEXT,
  postal_code        TEXT,
  address_country    TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_locations_project_id
  ON project_locations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_locations_coordinates
  ON project_locations USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_project_locations_country
  ON project_locations(country);
CREATE INDEX IF NOT EXISTS idx_project_locations_city
  ON project_locations(city);

-- Auto-populate the geography column from lat/lon on insert or update
CREATE OR REPLACE FUNCTION project_locations_set_coordinates()
RETURNS TRIGGER AS $$
BEGIN
  NEW.coordinates := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_locations_set_coordinates
  BEFORE INSERT OR UPDATE OF latitude, longitude ON project_locations
  FOR EACH ROW
  EXECUTE FUNCTION project_locations_set_coordinates();

-- ============================================================================
-- 3. photo_metadata (new table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS photo_metadata (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Primary date
  date_taken      TEXT,

  -- Equipment (most queried)
  camera_make     TEXT,
  camera_model    TEXT,
  lens_model      TEXT,
  focal_length    TEXT,
  iso             TEXT,
  aperture        TEXT,
  shutter_speed   TEXT,

  -- Image dimensions
  width           INTEGER,
  height          INTEGER,
  orientation     INTEGER,

  -- Device info
  software          TEXT,
  host_computer     TEXT,
  artist            TEXT,
  exif_copyright    TEXT,
  user_comment      TEXT,
  image_description TEXT,

  -- Extended data (rarely queried, kept as JSONB)
  temporal_data   JSONB,
  gps_extended    JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_metadata_project_id
  ON photo_metadata(project_id);
CREATE INDEX IF NOT EXISTS idx_photo_metadata_camera
  ON photo_metadata(camera_make, camera_model);
CREATE INDEX IF NOT EXISTS idx_photo_metadata_lens
  ON photo_metadata(lens_model);

-- ============================================================================
-- 4. Add missing columns to context_items
--    (columns that exist in the Zod schema / field-registry but not in SQL)
-- ============================================================================

ALTER TABLE context_items ADD COLUMN IF NOT EXISTS description          TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS credit               TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS date                 TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS linked_project_id    UUID REFERENCES projects(id);
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS linked_project_slug  TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS audio_storage_path   TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS audio_storage_url    TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS audio_mime_type      TEXT;
ALTER TABLE context_items ADD COLUMN IF NOT EXISTS audio_duration       NUMERIC;

-- ============================================================================
-- 5. Add missing columns to voice_transcriptions
-- ============================================================================

ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS field_id          TEXT;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS audio_storage_url TEXT;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS mime_type         TEXT;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS duration          NUMERIC;

-- ============================================================================
-- 6. RLS policies for new tables
-- ============================================================================

ALTER TABLE project_ethics ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_metadata ENABLE ROW LEVEL SECURITY;

-- project_ethics: access follows parent project
CREATE POLICY project_ethics_select_policy ON project_ethics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_ethics.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY project_ethics_insert_policy ON project_ethics FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_ethics.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_ethics_update_policy ON project_ethics FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_ethics.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_ethics_delete_policy ON project_ethics FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_ethics.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- project_locations: access follows parent project
CREATE POLICY project_locations_select_policy ON project_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_locations.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY project_locations_insert_policy ON project_locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_locations.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_locations_update_policy ON project_locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_locations.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY project_locations_delete_policy ON project_locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_locations.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- photo_metadata: access follows parent project
CREATE POLICY photo_metadata_select_policy ON photo_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = photo_metadata.project_id
      AND (projects.user_id = (SELECT auth.uid()) OR projects.published = true)
    )
  );

CREATE POLICY photo_metadata_insert_policy ON photo_metadata FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = photo_metadata.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photo_metadata_update_policy ON photo_metadata FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = photo_metadata.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photo_metadata_delete_policy ON photo_metadata FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = photo_metadata.project_id
      AND projects.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 7. updated_at triggers for new tables
-- ============================================================================

CREATE TRIGGER update_project_ethics_updated_at
  BEFORE UPDATE ON project_ethics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_locations_updated_at
  BEFORE UPDATE ON project_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_photo_metadata_updated_at
  BEFORE UPDATE ON photo_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
