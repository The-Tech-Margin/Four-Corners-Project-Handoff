-- Last updated: 2026-05-02
-- ============================================================================
-- Tighten public-read RLS: anon = in_gallery only, authenticated = published
-- ============================================================================
-- Previously, anon could SELECT every project where `published = true` (and
-- all 11 child tables). That made share-link projects publicly readable via
-- direct PostgREST queries even when they were not in the public gallery.
--
-- New model:
--   - owner            → user_id = auth.uid()                  (read/write)
--   - authenticated    → published = true                      (read only)
--   - anon             → in_gallery = true                     (read only)
--
-- The DB constraint `in_gallery = true → published = true` (migration 006)
-- guarantees the anon clause is a strict subset of the authenticated clause.
--
-- Storage bucket policies (project-images, context-media) are tightened in a
-- companion migration so that direct image URLs respect the same gate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;

CREATE POLICY "projects_select_policy" ON public.projects
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR ((select auth.role()) = 'authenticated' AND published = true)
    OR in_gallery = true
  );

-- ----------------------------------------------------------------------------
-- context_items
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "context_items_select_policy" ON public.context_items;

CREATE POLICY "context_items_select_policy" ON public.context_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = context_items.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- links
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "links_select_policy" ON public.links;

CREATE POLICY "links_select_policy" ON public.links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = links.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- voice_transcriptions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "voice_transcriptions_select_policy" ON public.voice_transcriptions;

CREATE POLICY "voice_transcriptions_select_policy" ON public.voice_transcriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = voice_transcriptions.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- consent_documents
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "consent_documents_select_policy" ON public.consent_documents;

CREATE POLICY "consent_documents_select_policy" ON public.consent_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = consent_documents.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- project_ethics
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_ethics_select_policy ON public.project_ethics;

CREATE POLICY project_ethics_select_policy ON public.project_ethics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_ethics.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- project_locations
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_locations_select_policy ON public.project_locations;

CREATE POLICY project_locations_select_policy ON public.project_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_locations.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- photo_metadata
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS photo_metadata_select_policy ON public.photo_metadata;

CREATE POLICY photo_metadata_select_policy ON public.photo_metadata
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = photo_metadata.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- context_item_audio (joined through context_items.project_id)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS context_item_audio_select_policy ON public.context_item_audio;

CREATE POLICY context_item_audio_select_policy ON public.context_item_audio
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.context_items ci
      JOIN public.projects p ON p.id = ci.project_id
      WHERE ci.id = context_item_audio.context_item_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- project_backstory
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_backstory_select_policy ON public.project_backstory;

CREATE POLICY project_backstory_select_policy ON public.project_backstory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_backstory.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- project_creative_commons
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_creative_commons_select_policy ON public.project_creative_commons;

CREATE POLICY project_creative_commons_select_policy ON public.project_creative_commons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_creative_commons.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- project_photographer_info
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_photographer_info_select_policy ON public.project_photographer_info;

CREATE POLICY project_photographer_info_select_policy ON public.project_photographer_info
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_photographer_info.project_id
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ============================================================================
-- Storage bucket SELECT policies are tightened in a SEPARATE migration:
--   20260502b_rls_storage_in_gallery_gate.sql
-- That file is split out because the storage policies extract project_id
-- from the object path via string parsing, which is brittle to legacy
-- uploads with non-standard paths. Apply 20260502a first and verify
-- table-level access before moving to 20260502b.
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To revert this migration, run:
--
--   DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;
--   CREATE POLICY "projects_select_policy" ON public.projects
--     FOR SELECT
--     USING (
--       user_id = (select auth.uid())
--       OR published = true
--     );
--   -- ...and similarly recreate each child-table SELECT policy with the
--   -- old `(p.user_id = auth.uid() OR p.published = true)` shape.
--   -- Source of the old policies: 20250121_fix_rls_performance.sql.
-- ============================================================================
