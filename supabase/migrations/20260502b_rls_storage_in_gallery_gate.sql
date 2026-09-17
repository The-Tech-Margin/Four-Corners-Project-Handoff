-- Last updated: 2026-05-02
-- ============================================================================
-- Tighten storage SELECT policies for project-images and context-media
-- ============================================================================
-- Companion to 20260502a (table RLS). Both buckets remain `public = true` at
-- the bucket level so existing public CDN URLs keep their shape; the
-- visibility gate is enforced by storage.objects RLS instead.
--
-- Path conventions enforced by the upload helpers
-- (lib/supabase-context-storage.ts):
--
--   project-images:   {userId}/main-images/{projectId}.{ext}
--                     {userId}/main-images/{projectId}.thumb.jpg
--   context-media:    {userId}/main-images/{projectId}.{ext}            (same)
--                     {userId}/context-images/{projectId}/{filename}
--                     {userId}/context-images/{projectId}/thumbs/{filename}
--
-- We extract the projectId either as the basename of the 3rd path segment
-- (main-images path) or as the 3rd folder segment (context-images path),
-- then join to projects for the visibility check.
--
-- ⚠️  PRE-FLIGHT BEFORE APPLYING
-- This migration assumes every existing object's path matches one of the
-- shapes above. Run the pre-flight queries in SUPABASE-AUDIT.md (Block 0)
-- against the LIVE project before applying — any storage object whose path
-- doesn't match becomes inaccessible after this migration runs (it would
-- show as a broken image in the gallery / view page).
-- ============================================================================

DROP POLICY IF EXISTS "Public read access for project images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for context media" ON storage.objects;

CREATE POLICY "project_images_gated_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-images'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(
        split_part(name, '/', 3),
        '.', 1
      )
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

CREATE POLICY "context_media_gated_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'context-media'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE (
        p.id::text = split_part(split_part(name, '/', 3), '.', 1)
        OR p.id::text = (storage.foldername(name))[3]
      )
      AND (
        p.user_id = (select auth.uid())
        OR ((select auth.role()) = 'authenticated' AND p.published = true)
        OR p.in_gallery = true
      )
    )
  );

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To revert this migration, run:
--
--   DROP POLICY IF EXISTS "project_images_gated_read" ON storage.objects;
--   DROP POLICY IF EXISTS "context_media_gated_read" ON storage.objects;
--   CREATE POLICY "Public read access for project images"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'project-images');
--   CREATE POLICY "Public read access for context media"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'context-media');
--
-- Source of the old policies: 002_storage_setup.sql.
-- ============================================================================
