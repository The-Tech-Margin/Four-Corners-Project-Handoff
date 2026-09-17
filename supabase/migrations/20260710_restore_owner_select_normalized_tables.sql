-- ============================================================================
-- Restore owner SELECT visibility on normalized project tables
-- ============================================================================
-- Production's SELECT policies on the normalized tables were replaced (outside
-- this repo's migrations — live names *_select_anon_gallery /
-- *_select_authenticated_baseline) with published-only checks, dropping the
-- owner arm that 20260502a_rls_tables_in_gallery_gate.sql defines. Effect:
-- owners could not read their own rows for UNPUBLISHED projects, and because
-- Postgres applies SELECT policies to INSERT ... ON CONFLICT ... RETURNING
-- rows, every 1:1 upsert in the save path (crud-factory .upsert().select())
-- failed with 42501 — no new project could be created.
--
-- Fix: additive owner-only SELECT policies (permissive policies OR together,
-- so whatever gallery/baseline policies exist stay untouched). Idempotent and
-- safe on fresh CI replays where the repo's combined policies already grant
-- owner visibility.

-- ── 1:1 and 1:many tables keyed by project_id ───────────────────────────────

DROP POLICY IF EXISTS project_backstory_select_owner ON public.project_backstory;
CREATE POLICY project_backstory_select_owner ON public.project_backstory
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_backstory.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS project_creative_commons_select_owner ON public.project_creative_commons;
CREATE POLICY project_creative_commons_select_owner ON public.project_creative_commons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_creative_commons.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS project_ethics_select_owner ON public.project_ethics;
CREATE POLICY project_ethics_select_owner ON public.project_ethics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_ethics.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS project_photographer_info_select_owner ON public.project_photographer_info;
CREATE POLICY project_photographer_info_select_owner ON public.project_photographer_info
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_photographer_info.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS project_locations_select_owner ON public.project_locations;
CREATE POLICY project_locations_select_owner ON public.project_locations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_locations.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS photo_metadata_select_owner ON public.photo_metadata;
CREATE POLICY photo_metadata_select_owner ON public.photo_metadata
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = photo_metadata.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS context_items_select_owner ON public.context_items;
CREATE POLICY context_items_select_owner ON public.context_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = context_items.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS voice_transcriptions_select_owner ON public.voice_transcriptions;
CREATE POLICY voice_transcriptions_select_owner ON public.voice_transcriptions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = voice_transcriptions.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS links_select_owner ON public.links;
CREATE POLICY links_select_owner ON public.links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = links.project_id
      AND p.user_id = (SELECT auth.uid())
  ));

-- ── context_item_audio (junction — reaches projects via context_items) ──────

DROP POLICY IF EXISTS context_item_audio_select_owner ON public.context_item_audio;
CREATE POLICY context_item_audio_select_owner ON public.context_item_audio
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.context_items ci
    JOIN public.projects p ON p.id = ci.project_id
    WHERE ci.id = context_item_audio.context_item_id
      AND p.user_id = (SELECT auth.uid())
  ));
