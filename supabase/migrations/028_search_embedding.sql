-- Last updated: 2026-04-10
-- Phase 2: pgvector semantic search.
--
-- Adds a vector(1536) column for OpenAI text-embedding-3-small embeddings,
-- an HNSW index for fast cosine similarity, a text assembly function for
-- embedding input, and extends the search RPC for hybrid scoring.
--
-- Coexists with the Phase 1 tsvector column — the two are independent.
-- When query_embedding is NULL, scoring falls back to tsvector-only.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Enable pgvector + add column + HNSW index
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_embedding vector(1536);

-- HNSW: no training step, supports incremental inserts, good for <100K rows
CREATE INDEX IF NOT EXISTS idx_projects_search_embedding
  ON projects USING hnsw (search_embedding vector_cosine_ops);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Text assembly function — shared input for embeddings
-- ═══════════════════════════════════════════════════════════════════

-- Returns a flat concatenated string of all searchable text for a project.
-- Same tables as rebuild_project_search_vector but without weight categories.
CREATE OR REPLACE FUNCTION get_project_search_text(target_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  p_title       TEXT;
  p_author      TEXT;
  p_tags        TEXT;
  bs_text       TEXT;
  cc_text       TEXT;
  pi_text       TEXT;
  loc_text      TEXT;
  eth_text      TEXT;
  pm_text       TEXT;
  ci_text       TEXT;
  lk_text       TEXT;
  vt_text       TEXT;
BEGIN
  -- Project-level fields
  SELECT
    COALESCE(p.title, ''),
    COALESCE(p.author, ''),
    COALESCE(array_to_string(p.tags, ' '), '')
  INTO p_title, p_author, p_tags
  FROM projects p WHERE p.id = target_project_id;

  IF NOT FOUND THEN RETURN ''; END IF;

  -- Backstory
  SELECT COALESCE(string_agg(
    COALESCE(bs.text, '') || ' ' || COALESCE(bs.author, '') || ' ' || COALESCE(bs.publication, ''), ' '
  ), '') INTO bs_text
  FROM project_backstory bs WHERE bs.project_id = target_project_id;

  -- Creative commons
  SELECT COALESCE(string_agg(
    COALESCE(cc.copyright, '') || ' ' || COALESCE(cc.description, ''), ' '
  ), '') INTO cc_text
  FROM project_creative_commons cc WHERE cc.project_id = target_project_id;

  -- Photographer info
  SELECT COALESCE(string_agg(
    COALESCE(pi.bio, '') || ' ' || COALESCE(pi.contact, '') || ' ' || COALESCE(pi.website, ''), ' '
  ), '') INTO pi_text
  FROM project_photographer_info pi WHERE pi.project_id = target_project_id;

  -- Location
  SELECT COALESCE(string_agg(
    COALESCE(loc.city, '') || ' ' || COALESCE(loc.state, '') || ' ' ||
    COALESCE(loc.country, '') || ' ' || COALESCE(loc.formatted_location, '') || ' ' ||
    COALESCE(loc.street, '') || ' ' || COALESCE(loc.address_city, '') || ' ' ||
    COALESCE(loc.state_province, '') || ' ' || COALESCE(loc.address_country, '') || ' ' ||
    COALESCE(loc.postal_code, ''), ' '
  ), '') INTO loc_text
  FROM project_locations loc WHERE loc.project_id = target_project_id;

  -- Ethics
  SELECT COALESCE(string_agg(
    COALESCE(e.custom_ethics_text, '') || ' ' || COALESCE(e.manipulation_details, '') || ' ' ||
    COALESCE(e.staging_details, '') || ' ' || COALESCE(e.consent_details, '') || ' ' ||
    COALESCE(e.identity_protection_details, '') || ' ' || COALESCE(e.ai_altered_details, ''), ' '
  ), '') INTO eth_text
  FROM project_ethics e WHERE e.project_id = target_project_id;

  -- Photo metadata equipment
  SELECT COALESCE(string_agg(
    COALESCE(pm.camera_make, '') || ' ' || COALESCE(pm.camera_model, '') || ' ' || COALESCE(pm.lens_model, ''), ' '
  ), '') INTO pm_text
  FROM photo_metadata pm WHERE pm.project_id = target_project_id;

  -- Context items
  SELECT COALESCE(string_agg(
    COALESCE(c.caption, '') || ' ' || COALESCE(c.description, '') || ' ' || COALESCE(c.credit, ''), ' '
  ), '') INTO ci_text
  FROM context_items c WHERE c.project_id = target_project_id;

  -- Links
  SELECT COALESCE(string_agg(
    COALESCE(l.title, '') || ' ' || COALESCE(l.source, ''), ' '
  ), '') INTO lk_text
  FROM links l WHERE l.project_id = target_project_id;

  -- Voice transcriptions
  SELECT COALESCE(string_agg(COALESCE(vt.text, ''), ' '), '')
  INTO vt_text
  FROM voice_transcriptions vt WHERE vt.project_id = target_project_id;

  RETURN trim(
    p_title || ' ' || p_author || ' ' || p_tags || ' ' ||
    bs_text || ' ' || cc_text || ' ' ||
    pi_text || ' ' || loc_text || ' ' || eth_text || ' ' ||
    pm_text || ' ' || ci_text || ' ' || lk_text || ' ' || vt_text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_search_text(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add semantic search RPC overload (non-destructive)
-- ═══════════════════════════════════════════════════════════════════

-- The Phase 1 function search_gallery_projects(TEXT, INT, INT) is kept
-- intact — existing callers continue to hit it unchanged.
-- This overload adds the query_embedding parameter for hybrid scoring.
-- Supabase RPC resolves the correct overload by argument count/type.

CREATE OR REPLACE FUNCTION search_gallery_projects(
  search_query TEXT,
  query_embedding vector(1536),
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
    -- Hybrid score: blend tsvector rank with cosine similarity when both available
    CASE
      WHEN query_embedding IS NOT NULL AND p.search_embedding IS NOT NULL THEN
        0.7 * ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query))
        + 0.3 * (1.0 - (p.search_embedding <=> query_embedding))::real
      ELSE
        ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query))
    END AS rank

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

-- Grant on the new overload only — Phase 1 (TEXT, INT, INT) already has its grants
GRANT EXECUTE ON FUNCTION search_gallery_projects(TEXT, vector, INT, INT) TO anon, authenticated;

COMMIT;
