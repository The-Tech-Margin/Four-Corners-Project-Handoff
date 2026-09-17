-- Last updated: 2026-01-19
-- ============================================================================
-- Storage Buckets Configuration
-- ============================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('project-images', 'project-images', true),
  ('context-media', 'context-media', true),
  ('consent-documents', 'consent-documents', false),
  ('voice-recordings', 'voice-recordings', false);

-- ============================================================================
-- STORAGE POLICIES - project-images (main photographs)
-- ============================================================================

-- Allow authenticated users to upload their own images
CREATE POLICY "Users can upload own project images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to update their own images
CREATE POLICY "Users can update own project images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own images
CREATE POLICY "Users can delete own project images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access (for published projects)
CREATE POLICY "Public read access for project images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-images');

-- ============================================================================
-- STORAGE POLICIES - context-media (context images/videos)
-- ============================================================================

CREATE POLICY "Users can upload own context media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'context-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own context media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'context-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own context media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'context-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public read access for context media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'context-media');

-- ============================================================================
-- STORAGE POLICIES - consent-documents (private)
-- ============================================================================

CREATE POLICY "Users can upload own consent documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'consent-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own consent documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'consent-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own consent documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'consent-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- STORAGE POLICIES - voice-recordings (private)
-- ============================================================================

CREATE POLICY "Users can upload own voice recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-recordings'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own voice recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'voice-recordings'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own voice recordings"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'voice-recordings'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
