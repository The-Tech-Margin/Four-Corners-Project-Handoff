-- ============================================================================
-- Batch migration: 018 → 025
-- Safe to run on any state — all statements are idempotent.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================================

BEGIN;

-- ── 018: Persona Palettes ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS persona_palettes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  dark_overrides  jsonb NOT NULL DEFAULT '{}',
  light_overrides jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persona_palettes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read palettes"
    ON persona_palettes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION update_persona_palettes_updated_at()
RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS persona_palettes_updated_at ON persona_palettes;
CREATE TRIGGER persona_palettes_updated_at
  BEFORE UPDATE ON persona_palettes
  FOR EACH ROW
  EXECUTE FUNCTION update_persona_palettes_updated_at();


-- ── 019: Admin Roles ───────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL DEFAULT 'moderator',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own roles"
    ON user_roles FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

CREATE MATERIALIZED VIEW IF NOT EXISTS platform_stats AS
SELECT
  (SELECT count(*) FROM auth.users)                               AS total_users,
  (SELECT count(*) FROM projects)                                 AS total_projects,
  (SELECT count(*) FROM projects WHERE published = true)          AS total_published,
  (SELECT count(*) FROM projects WHERE published = true
                                  AND in_gallery = true)          AS total_gallery,
  (SELECT count(*) FROM projects WHERE published = false)         AS total_private,
  (SELECT count(*) FROM context_items)                            AS total_context_items,
  (SELECT count(DISTINCT project_id) FROM context_items)          AS projects_with_context,
  (SELECT count(*) FROM voice_transcriptions)                     AS total_transcriptions,
  now()                                                           AS refreshed_at;

-- Unique index needed for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS platform_stats_refreshed_at ON platform_stats (refreshed_at);


-- ── 020: Rate Limit Log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier TEXT        NOT NULL,
  tier       TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL,
  method     TEXT        NOT NULL DEFAULT 'GET',
  blocked    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rl_check
  ON rate_limit_log (identifier, tier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rl_dashboard
  ON rate_limit_log (created_at DESC, tier, blocked);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier     TEXT,
  p_tier           TEXT,
  p_endpoint       TEXT,
  p_method         TEXT,
  p_window_seconds INT,
  p_max_requests   INT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
  v_allowed      BOOLEAN;
  v_remaining    INT;
  v_reset_at     TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::INTERVAL;
  v_reset_at     := now() + (p_window_seconds || ' seconds')::INTERVAL;
  SELECT COUNT(*) INTO v_count
    FROM rate_limit_log
   WHERE identifier = p_identifier AND tier = p_tier AND created_at > v_window_start;
  v_allowed   := v_count < p_max_requests;
  v_remaining := GREATEST(0, p_max_requests - v_count - 1);
  INSERT INTO rate_limit_log (identifier, tier, endpoint, method, blocked)
  VALUES (p_identifier, p_tier, p_endpoint, p_method, NOT v_allowed);
  RETURN json_build_object(
    'allowed', v_allowed, 'remaining', v_remaining,
    'limit', p_max_requests, 'reset_at', v_reset_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_rate_limit_stats(p_hours INT DEFAULT 24)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_since TIMESTAMPTZ; v_total INT; v_blocked INT;
  v_by_tier JSON; v_top_blocked JSON; v_recent JSON;
BEGIN
  v_since := now() - (p_hours || ' hours')::INTERVAL;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE blocked) INTO v_total, v_blocked
    FROM rate_limit_log WHERE created_at > v_since;
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON) INTO v_by_tier FROM (
    SELECT tier, COUNT(*) AS total, COUNT(*) FILTER (WHERE blocked) AS blocked
      FROM rate_limit_log WHERE created_at > v_since GROUP BY tier ORDER BY total DESC) t;
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON) INTO v_top_blocked FROM (
    SELECT endpoint, tier, COUNT(*) AS block_count FROM rate_limit_log
     WHERE created_at > v_since AND blocked = true GROUP BY endpoint, tier
     ORDER BY block_count DESC LIMIT 10) t;
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON) INTO v_recent FROM (
    SELECT LEFT(identifier, 8) || '...' AS identifier_short, endpoint, tier, created_at
      FROM rate_limit_log WHERE created_at > v_since AND blocked = true
     ORDER BY created_at DESC LIMIT 20) t;
  RETURN json_build_object(
    'total_requests', v_total, 'total_blocked', v_blocked, 'by_tier', v_by_tier,
    'top_blocked', v_top_blocked, 'recent_violations', v_recent,
    'since', v_since, 'generated_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_rate_limit_log(p_retain_hours INT DEFAULT 72)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM rate_limit_log WHERE created_at < now() - (p_retain_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


-- ── 021: Global Palette Flag ──────────────────────────────────────────────

ALTER TABLE persona_palettes
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS persona_palettes_global_unique
  ON persona_palettes (is_global) WHERE (is_global = true);


-- ── 022: User Preferences ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  palette_slug  text REFERENCES persona_palettes(slug) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own preferences"
    ON user_preferences FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own preferences"
    ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own preferences"
    ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 023: Gallery Feed View ────────────────────────────────────────────────

DROP VIEW IF EXISTS gallery_feed;

CREATE VIEW gallery_feed AS
SELECT
  p.id, p.slug, p.title, p.author, p.date,
  CASE WHEN p.main_image_storage_path IS NOT NULL THEN NULL ELSE p.main_image_url END AS main_image_url,
  p.main_image_storage_path, p.published, p.in_gallery,
  p.created_at, p.updated_at, p.user_id, p.parent_project_id,
  bs.text AS backstory_text, bs.author AS backstory_author,
  bs.publication AS backstory_publication, bs.date AS backstory_date,
  cc.copyright AS cc_copyright, cc.description AS cc_description,
  loc.city AS location_city, loc.state AS location_state,
  loc.country AS location_country, loc.formatted_location AS location_formatted,
  pm.camera_make, pm.camera_model,
  COALESCE(ci.items, '[]'::json) AS context_items,
  COALESCE(lk.items, '[]'::json) AS links
FROM projects p
LEFT JOIN project_backstory bs ON bs.project_id = p.id
LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
LEFT JOIN project_locations loc ON loc.project_id = p.id
LEFT JOIN photo_metadata pm ON pm.project_id = p.id
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
  FROM context_items c WHERE c.project_id = p.id
) ci ON true
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
  FROM links l WHERE l.project_id = p.id
) lk ON true
WHERE p.published = true AND p.in_gallery = true;

GRANT SELECT ON gallery_feed TO anon, authenticated;


-- ── 024: Re-sync context audio + linked projects from JSONB ───────────────

UPDATE context_items ci SET
  audio_storage_path = COALESCE(ci.audio_storage_path, elem->>'audioStoragePath'),
  audio_storage_url  = COALESCE(ci.audio_storage_url,  elem->>'audioStorageUrl'),
  audio_mime_type    = COALESCE(ci.audio_mime_type,     elem->>'audioMimeType'),
  audio_duration     = COALESCE(ci.audio_duration,      (elem->>'audioDuration')::numeric)
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id AND ci.position = (arr.idx - 1)::integer
  AND (ci.audio_storage_path IS NULL OR ci.audio_storage_url IS NULL)
  AND (elem->>'audioStoragePath' IS NOT NULL OR elem->>'audioStorageUrl' IS NOT NULL);

UPDATE context_items ci SET
  linked_project_id   = COALESCE(ci.linked_project_id, (elem->>'linkedProjectId')::uuid),
  linked_project_slug = COALESCE(ci.linked_project_slug, elem->>'linkedProjectSlug')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id AND ci.position = (arr.idx - 1)::integer
  AND (ci.linked_project_id IS NULL OR ci.linked_project_slug IS NULL)
  AND (elem->>'linkedProjectId' IS NOT NULL OR elem->>'linkedProjectSlug' IS NOT NULL);

UPDATE context_items ci SET
  storage_url           = COALESCE(ci.storage_url,           elem->>'storage_url'),
  thumbnail_storage_url = COALESCE(ci.thumbnail_storage_url, elem->>'thumbnail_storage_url')
FROM projects p,
     LATERAL jsonb_array_elements(COALESCE(p.metadata->'context', '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)
WHERE ci.project_id = p.id AND ci.position = (arr.idx - 1)::integer
  AND (ci.storage_url IS NULL OR ci.thumbnail_storage_url IS NULL)
  AND (elem->>'storage_url' IS NOT NULL OR elem->>'thumbnail_storage_url' IS NOT NULL);


-- ── 025: Speed Insights ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS speed_insights (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_type     text        NOT NULL,
  value           double precision NOT NULL,
  timestamp       timestamptz NOT NULL DEFAULT now(),
  path            text,
  route           text,
  origin          text,
  device_type     text,
  connection_speed text,
  country         text,
  deployment_id   text,
  vercel_env      text,
  attribution     jsonb,
  sdk_name        text,
  sdk_version     text,
  script_version  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE speed_insights ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_speed_insights_metric_time
  ON speed_insights (metric_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_speed_insights_path
  ON speed_insights (path, timestamp DESC);

CREATE OR REPLACE FUNCTION cleanup_speed_insights(p_retain_days INT DEFAULT 30)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM speed_insights WHERE created_at < now() - (p_retain_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


COMMIT;

-- ============================================================================
-- Done! All 8 migrations applied. Verify with:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- ============================================================================
