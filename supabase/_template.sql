-- Migration template — copy-paste source, NOT a runnable migration.
--
-- Stored at supabase/_template.sql (one level above supabase/migrations/) so
-- the Supabase CLI's numeric-prefix glob does not pick it up.
--
-- Background: Supabase removes the implicit Data API grant on the public
-- schema on 2026-10-30. After that, supabase-js / PostgREST / GraphQL cannot
-- reach a new public table unless an explicit GRANT lives in the same
-- migration. See SUPABASE-AUDIT.md → "Migration convention — explicit GRANTs
-- for the Data API" for the rationale and the audit query.
--
-- Pick ONE of the three blocks below per table. Replace <table> and column
-- names. Keep the GRANT/REVOKE lines in every new CREATE TABLE migration.

-- =============================================================================
-- Template 1 — User-owned table (Data API, owner-only)
--
-- Use for tables touched from supabase-js with rows scoped by auth.uid().
-- This is the default shape for almost every table in this repo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.<table> (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ... your columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

-- Data API access — required after Supabase 2026-10-30 default change.
-- Anon stays off direct table grants; public reads route through views/RPCs.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;

CREATE POLICY "<table>_select_own" ON public.<table>
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "<table>_insert_own" ON public.<table>
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<table>_update_own" ON public.<table>
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<table>_delete_own" ON public.<table>
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =============================================================================
-- Template 2 — Internal / service-role-only table
--
-- Use for tables only written/read by server endpoints with the service-role
-- client (e.g. rate_limit_log, page_views). RLS-on + no policies = implicit
-- deny for anon/authenticated; the REVOKE makes that explicit in migration
-- history so the audit in SUPABASE-AUDIT.md Block 2 is unambiguous.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.<table> (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ... your columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- No policies: RLS-on + no policy = implicit deny for anon/authenticated.

REVOKE ALL ON public.<table> FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.<table> TO service_role;

-- =============================================================================
-- Template 3 — Public read via view (or RPC)
--
-- For tables that need anon read access (gallery, search). Do NOT grant anon
-- on the base table — add a SECURITY INVOKER view that filters to the
-- public-safe subset, or an RPC, and grant that to anon.
-- Mirrors the gallery_feed pattern in 023_gallery_feed_view.sql /
-- 030_security_linter_fixes.sql and the search RPC in 028_search_embedding.sql.
-- =============================================================================

-- Base table follows Template 1.

CREATE VIEW public.<table>_public WITH (security_invoker = true) AS
SELECT <safe columns>
FROM public.<table>
WHERE <public-visibility predicate>;  -- e.g. published = true AND in_gallery = true

GRANT SELECT ON public.<table>_public TO anon, authenticated;

-- Or, for a function:

CREATE OR REPLACE FUNCTION public.<rpc_name>(...) RETURNS TABLE (...)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT <safe columns> FROM public.<table> WHERE <public-visibility predicate>;
$$;

REVOKE ALL ON FUNCTION public.<rpc_name>(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<rpc_name>(...) TO anon, authenticated;
