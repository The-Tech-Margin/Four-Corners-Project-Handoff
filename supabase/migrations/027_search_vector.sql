-- Last updated: 2026-04-10
-- Full-text search: tsvector column + rebuild function + triggers + RPC.
--
-- Adds a weighted tsvector to the projects table, populated from ALL
-- normalized tables (not just the gallery_feed subset). A GIN index
-- enables fast @@ queries. Triggers on every related table keep the
-- vector up to date on insert/update/delete.
--
-- Phase 2 (future): pgvector embedding column can coexist alongside
-- this tsvector column with no schema conflicts.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Column + index
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_projects_search_vector ON projects USING GIN (search_vector);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Rebuild function — reads all normalized tables for one project
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rebuild_project_search_vector(target_project_id UUID)
RETURNS VOID AS $$
DECLARE
  p_title       TEXT;
  p_author      TEXT;
  p_tags        TEXT;
  bs_text       TEXT;
  bs_author     TEXT;
  bs_pub        TEXT;
  cc_copy       TEXT;
  cc_desc       TEXT;
  pi_bio        TEXT;
  pi_contact    TEXT;
  pi_website    TEXT;
  loc_text      TEXT;
  eth_text      TEXT;
  pm_text       TEXT;
  ci_text       TEXT;
  lk_text       TEXT;
  vt_text       TEXT;
BEGIN
  -- Project-level fields (weight A)
  SELECT
    COALESCE(p.title, ''),
    COALESCE(p.author, ''),
    COALESCE(array_to_string(p.tags, ' '), '')
  INTO p_title, p_author, p_tags
  FROM projects p WHERE p.id = target_project_id;

  -- Backstory (weight B)
  SELECT
    COALESCE(string_agg(
      COALESCE(bs.text, '') || ' ' ||
      COALESCE(bs.author, '') || ' ' ||
      COALESCE(bs.publication, ''),
      ' '
    ), '')
  INTO bs_text
  FROM project_backstory bs WHERE bs.project_id = target_project_id;

  -- Creative commons (weight B)
  SELECT
    COALESCE(string_agg(
      COALESCE(cc.copyright, '') || ' ' ||
      COALESCE(cc.description, ''),
      ' '
    ), '')
  INTO cc_copy
  FROM project_creative_commons cc WHERE cc.project_id = target_project_id;

  -- Photographer info (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(pi.bio, '') || ' ' ||
      COALESCE(pi.contact, '') || ' ' ||
      COALESCE(pi.website, ''),
      ' '
    ), '')
  INTO pi_bio
  FROM project_photographer_info pi WHERE pi.project_id = target_project_id;

  -- Location (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(loc.city, '') || ' ' ||
      COALESCE(loc.state, '') || ' ' ||
      COALESCE(loc.country, '') || ' ' ||
      COALESCE(loc.formatted_location, '') || ' ' ||
      COALESCE(loc.street, '') || ' ' ||
      COALESCE(loc.address_city, '') || ' ' ||
      COALESCE(loc.state_province, '') || ' ' ||
      COALESCE(loc.address_country, '') || ' ' ||
      COALESCE(loc.postal_code, ''),
      ' '
    ), '')
  INTO loc_text
  FROM project_locations loc WHERE loc.project_id = target_project_id;

  -- Ethics (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(e.custom_ethics_text, '') || ' ' ||
      COALESCE(e.manipulation_details, '') || ' ' ||
      COALESCE(e.staging_details, '') || ' ' ||
      COALESCE(e.consent_details, '') || ' ' ||
      COALESCE(e.identity_protection_details, '') || ' ' ||
      COALESCE(e.ai_altered_details, ''),
      ' '
    ), '')
  INTO eth_text
  FROM project_ethics e WHERE e.project_id = target_project_id;

  -- Photo metadata equipment (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(pm.camera_make, '') || ' ' ||
      COALESCE(pm.camera_model, '') || ' ' ||
      COALESCE(pm.lens_model, ''),
      ' '
    ), '')
  INTO pm_text
  FROM photo_metadata pm WHERE pm.project_id = target_project_id;

  -- Context items (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(c.caption, '') || ' ' ||
      COALESCE(c.description, '') || ' ' ||
      COALESCE(c.credit, ''),
      ' '
    ), '')
  INTO ci_text
  FROM context_items c WHERE c.project_id = target_project_id;

  -- Links (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(l.title, '') || ' ' ||
      COALESCE(l.source, ''),
      ' '
    ), '')
  INTO lk_text
  FROM links l WHERE l.project_id = target_project_id;

  -- Voice transcriptions (weight D)
  SELECT COALESCE(string_agg(COALESCE(vt.text, ''), ' '), '')
  INTO vt_text
  FROM voice_transcriptions vt WHERE vt.project_id = target_project_id;

  -- Build weighted tsvector and update
  UPDATE projects SET search_vector =
    setweight(to_tsvector('english', p_title || ' ' || p_author || ' ' || p_tags), 'A') ||
    setweight(to_tsvector('english', bs_text || ' ' || cc_copy), 'B') ||
    setweight(to_tsvector('english', pi_bio || ' ' || loc_text || ' ' || eth_text), 'C') ||
    setweight(to_tsvector('english', pm_text || ' ' || ci_text || ' ' || lk_text || ' ' || vt_text), 'D')
  WHERE id = target_project_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Triggers
-- ═══════════════════════════════════════════════════════════════════

-- Shared trigger function for child tables (all have project_id FK)
CREATE OR REPLACE FUNCTION trg_rebuild_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM rebuild_project_search_vector(OLD.project_id);
    RETURN OLD;
  ELSE
    PERFORM rebuild_project_search_vector(NEW.project_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger on projects table itself (title, author, tags changes)
CREATE OR REPLACE FUNCTION trg_projects_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM rebuild_project_search_vector(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all related tables
CREATE TRIGGER search_vector_on_backstory
  AFTER INSERT OR UPDATE OR DELETE ON project_backstory
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_creative_commons
  AFTER INSERT OR UPDATE OR DELETE ON project_creative_commons
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_photographer_info
  AFTER INSERT OR UPDATE OR DELETE ON project_photographer_info
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_ethics
  AFTER INSERT OR UPDATE OR DELETE ON project_ethics
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_locations
  AFTER INSERT OR UPDATE OR DELETE ON project_locations
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_photo_metadata
  AFTER INSERT OR UPDATE OR DELETE ON photo_metadata
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_context_items
  AFTER INSERT OR UPDATE OR DELETE ON context_items
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_links
  AFTER INSERT OR UPDATE OR DELETE ON links
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_voice_transcriptions
  AFTER INSERT OR UPDATE OR DELETE ON voice_transcriptions
  FOR EACH ROW EXECUTE FUNCTION trg_rebuild_search_vector();

CREATE TRIGGER search_vector_on_projects
  AFTER UPDATE OF title, author, tags ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_projects_search_vector();

-- ═══════════════════════════════════════════════════════════════════
-- 4. Backfill existing projects
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pid UUID;
BEGIN
  FOR pid IN SELECT id FROM projects LOOP
    PERFORM rebuild_project_search_vector(pid);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. RPC function for gallery search
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_gallery_projects(
  search_query TEXT,
  result_limit INT DEFAULT 24,
  result_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  author TEXT,
  date TEXT,
  main_image_url TEXT,
  main_image_storage_path TEXT,
  published BOOLEAN,
  in_gallery BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_id UUID,
  parent_project_id UUID,
  tags TEXT[],
  backstory_text TEXT,
  backstory_author TEXT,
  backstory_publication TEXT,
  backstory_date TEXT,
  cc_copyright TEXT,
  cc_description TEXT,
  location_city TEXT,
  location_state TEXT,
  location_country TEXT,
  location_formatted TEXT,
  camera_make TEXT,
  camera_model TEXT,
  context_items JSON,
  links JSON,
  rank REAL
)
LANGUAGE sql STABLE
AS $fn$
  SELECT
    p.id,
    p.slug,
    p.title,
    p.author,
    p.date,
    CASE
      WHEN p.main_image_storage_path IS NOT NULL THEN NULL
      ELSE p.main_image_url
    END AS main_image_url,
    p.main_image_storage_path,
    p.published,
    p.in_gallery,
    p.created_at,
    p.updated_at,
    p.user_id,
    p.parent_project_id,
    p.tags,
    bs.text        AS backstory_text,
    bs.author      AS backstory_author,
    bs.publication AS backstory_publication,
    bs.date        AS backstory_date,
    cc.copyright   AS cc_copyright,
    cc.description AS cc_description,
    loc.city       AS location_city,
    loc.state      AS location_state,
    loc.country    AS location_country,
    loc.formatted_location AS location_formatted,
    pm.camera_make,
    pm.camera_model,
    COALESCE(ci.items, '[]'::json) AS context_items,
    COALESCE(lk.items, '[]'::json) AS links,
    ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query)) AS rank

  FROM projects p
  LEFT JOIN project_backstory bs  ON bs.project_id = p.id
  LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
  LEFT JOIN project_locations loc ON loc.project_id = p.id
  LEFT JOIN photo_metadata pm     ON pm.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
    FROM context_items c
    WHERE c.project_id = p.id
  ) ci ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
    FROM links l
    WHERE l.project_id = p.id
  ) lk ON TRUE

  WHERE p.published = TRUE
    AND p.in_gallery = TRUE
    AND p.search_vector @@ websearch_to_tsquery('english', search_query)

  ORDER BY rank DESC, p.created_at DESC
  LIMIT result_limit
  OFFSET result_offset;
$fn$;

-- Grant execute to both roles so anon gallery visitors and logged-in users can search
GRANT EXECUTE ON FUNCTION search_gallery_projects(TEXT, INT, INT) TO anon, authenticated;

COMMIT;
