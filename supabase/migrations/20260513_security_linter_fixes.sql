-- Last updated: 2026-05-13
-- Security linter fixes (Supabase Security Advisor, May 2026).
--
-- Scope of this migration is intentionally narrow. This Supabase project
-- is shared with a sister "VoiceVault" app that owns the voice_notes /
-- note_shares / share_chains / shared_note_access tables and a set of
-- SECURITY DEFINER helper functions backing them (find_user_by_contact,
-- create_user_from_phone, get_shares_by_phone, get_share_chain,
-- count_pending_shares, search_*_chain*, get_search_context,
-- expire_old_shares, vn_update_*, update_voice_note_search_vector,
-- get_match_positions, rls_auto_enable). Four Corners reads `voice_notes`
-- via components/voicevault-import.tsx but doesn't call those RPCs. We
-- DO NOT touch them here — drops or revokes need VoiceVault sign-off.
--
-- This migration does only:
-- 1. REVOKE EXECUTE from anon/authenticated on admin-only Four Corners
--    SECURITY DEFINER functions whose only callers are our admin
--    endpoints (service-role bypasses GRANTs, so production code is
--    unaffected). Verified call sites:
--      check_rate_limit            ← lib/rate-limit.ts (service-role)
--      cleanup_rate_limit_log      ← app/api/admin/rate-limits/route.ts
--      get_rate_limit_stats        ← app/api/admin/rate-limits/route.ts
--      get_equipment_stats         ← app/api/admin/content/route.ts
--      get_tag_distribution        ← app/api/admin/content/route.ts
--      get_top_cities              ← admin-only by intent, no current caller
--      get_location_countries      ← admin-only by intent, no current caller
--      get_web_vitals_summary      ← app/api/admin/performance/route.ts
--      get_web_vitals_by_device    ← app/api/admin/performance/route.ts
--      get_web_vitals_by_route     ← app/api/admin/performance/route.ts
--      get_storage_totals_by_user  ← app/api/admin/storage/route.ts
--      get_storage_total_for_user  ← app/api/admin/users/[id]/route.ts
-- 2. Pin search_path on every non-extension public function (including
--    the VoiceVault ones — this is a metadata-only change, no behavior
--    impact). Closes function_search_path_mutable across the board.
--
-- NOT done here, separate decisions needed:
--   • DROP / REVOKE on VoiceVault-owned functions (find_user_by_contact,
--     etc.) — coordinate with the VoiceVault app first.
--   • DROP unused Four Corners helpers list_user_projects_light /
--     list_gallery_projects_light from migration 010 — left in place
--     pending confirmation they're not called from VoiceVault either.
--
-- Manual follow-ups NOT in SQL:
--   • Dashboard: Authentication → Providers → Email → enable
--     "Leaked password protection" (HaveIBeenPwned check).
--   • Deferred: moving postgis / vector / pg_trgm out of the public
--     schema. High blast radius, WARN-level finding.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) Revoke EXECUTE on Four Corners admin / service-role-only
--    DEFINER functions.
-- ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rate_limit_stats(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_equipment_stats(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tag_distribution(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_top_cities(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_location_countries()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_web_vitals_summary(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_web_vitals_by_device(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_web_vitals_by_route(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_totals_by_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_total_for_user(uuid)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) Pin search_path = (public, auth, pg_catalog) on Four Corners
--    functions only. Resolves function_search_path_mutable for our
--    own functions. VoiceVault-owned functions are deliberately
--    excluded — even though SET search_path is a metadata-only
--    ALTER, touching VoiceVault objects is out of scope here.
--
--    Allowlist is the set of functions defined in our own
--    supabase/migrations/*.sql files, plus `projects_title_autofill`
--    and `projects_author_autofill` which are triggers on
--    public.projects (added via dashboard but unambiguously ours by
--    table ownership).
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        -- 003
        'update_updated_at_column',
        'validate_project_metadata',
        -- 006
        'get_project_children',
        'get_root_parent',
        -- 010
        'list_user_projects_light',
        'list_gallery_projects_light',
        -- 011
        'project_locations_set_coordinates',
        -- 018
        'update_persona_palettes_updated_at',
        -- 020
        'check_rate_limit',
        'cleanup_rate_limit_log',
        'get_rate_limit_stats',
        -- 027
        'trg_projects_search_vector',
        'trg_rebuild_search_vector',
        'rebuild_project_search_vector',
        -- 028
        'get_project_search_text',
        'search_gallery_projects',
        -- 029
        'get_equipment_stats',
        'get_location_countries',
        'get_tag_distribution',
        'get_top_cities',
        'get_web_vitals_by_device',
        'get_web_vitals_by_route',
        'get_web_vitals_summary',
        -- triggers on public.projects (added via dashboard)
        'projects_title_autofill',
        'projects_author_autofill'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, auth, pg_catalog',
      r.proname, r.args
    );
  END LOOP;
END $$;

COMMIT;
