-- Last updated: 2026-01-21
-- ============================================================================
-- Fix RLS Performance Issues
-- ============================================================================
-- This migration addresses Supabase linter warnings:
-- 1. auth_rls_initplan: Wrap auth.uid() in (select ...) to prevent per-row evaluation
-- 2. multiple_permissive_policies: Consolidate duplicate policies
-- 3. duplicate_index: Remove duplicate indexes
-- ============================================================================

-- ============================================================================
-- PART 1: Fix duplicate index
-- ============================================================================

DROP INDEX IF EXISTS idx_projects_parent;
-- Keep idx_projects_parent_id as the canonical index

-- ============================================================================
-- PART 2: Fix projects table RLS policies
-- ============================================================================

-- Drop all existing SELECT policies on projects (will consolidate into fewer)
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view published projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view parent relationships of published projects" ON public.projects;
DROP POLICY IF EXISTS "Public can read published projects" ON public.projects;
DROP POLICY IF EXISTS "Public can view gallery projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can read published projects" ON public.projects;

-- Drop existing mutation policies
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

-- Create consolidated SELECT policy for projects
-- Allows: own projects OR published projects
CREATE POLICY "projects_select_policy" ON public.projects
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR published = true
  );

-- Create optimized INSERT policy
CREATE POLICY "projects_insert_policy" ON public.projects
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- Create optimized UPDATE policy
CREATE POLICY "projects_update_policy" ON public.projects
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Create optimized DELETE policy
CREATE POLICY "projects_delete_policy" ON public.projects
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- PART 3: Fix context_items table RLS policies
-- ============================================================================

-- Drop all existing policies on context_items
DROP POLICY IF EXISTS "Users can view context items of own projects" ON public.context_items;
DROP POLICY IF EXISTS "Anyone can view context items of published projects" ON public.context_items;
DROP POLICY IF EXISTS "Users can insert context items to own projects" ON public.context_items;
DROP POLICY IF EXISTS "Users can update context items of own projects" ON public.context_items;
DROP POLICY IF EXISTS "Users can delete context items of own projects" ON public.context_items;

-- Create consolidated SELECT policy for context_items
CREATE POLICY "context_items_select_policy" ON public.context_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = context_items.project_id
      AND (p.user_id = (select auth.uid()) OR p.published = true)
    )
  );

-- Create optimized INSERT policy
CREATE POLICY "context_items_insert_policy" ON public.context_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = context_items.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- Create optimized UPDATE policy
CREATE POLICY "context_items_update_policy" ON public.context_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = context_items.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- Create optimized DELETE policy
CREATE POLICY "context_items_delete_policy" ON public.context_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = context_items.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PART 4: Fix links table RLS policies
-- ============================================================================

-- Drop all existing policies on links
DROP POLICY IF EXISTS "Users can view links of own projects" ON public.links;
DROP POLICY IF EXISTS "Users can manage links of own projects" ON public.links;
DROP POLICY IF EXISTS "Anyone can view links of published projects" ON public.links;
DROP POLICY IF EXISTS "Public can read links for published projects" ON public.links;
DROP POLICY IF EXISTS "Users can read links for accessible projects" ON public.links;
DROP POLICY IF EXISTS "Users can insert links for own projects" ON public.links;
DROP POLICY IF EXISTS "Users can update links for own projects" ON public.links;
DROP POLICY IF EXISTS "Users can delete links for own projects" ON public.links;

-- Create consolidated SELECT policy for links
CREATE POLICY "links_select_policy" ON public.links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = links.project_id
      AND (p.user_id = (select auth.uid()) OR p.published = true)
    )
  );

-- Create optimized INSERT policy
CREATE POLICY "links_insert_policy" ON public.links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = links.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- Create optimized UPDATE policy
CREATE POLICY "links_update_policy" ON public.links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = links.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- Create optimized DELETE policy
CREATE POLICY "links_delete_policy" ON public.links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = links.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PART 5: Fix voice_transcriptions table RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage voice transcriptions of own projects" ON public.voice_transcriptions;

-- Create optimized policies for voice_transcriptions
CREATE POLICY "voice_transcriptions_select_policy" ON public.voice_transcriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = voice_transcriptions.project_id
      AND (p.user_id = (select auth.uid()) OR p.published = true)
    )
  );

CREATE POLICY "voice_transcriptions_insert_policy" ON public.voice_transcriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = voice_transcriptions.project_id
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "voice_transcriptions_update_policy" ON public.voice_transcriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = voice_transcriptions.project_id
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "voice_transcriptions_delete_policy" ON public.voice_transcriptions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = voice_transcriptions.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PART 6: Fix consent_documents table RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage consent documents of own projects" ON public.consent_documents;

-- Create optimized policies for consent_documents
CREATE POLICY "consent_documents_select_policy" ON public.consent_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = consent_documents.project_id
      AND (p.user_id = (select auth.uid()) OR p.published = true)
    )
  );

CREATE POLICY "consent_documents_insert_policy" ON public.consent_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = consent_documents.project_id
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "consent_documents_update_policy" ON public.consent_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = consent_documents.project_id
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "consent_documents_delete_policy" ON public.consent_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = consent_documents.project_id
      AND p.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PART 7: Fix note_shares table RLS policies
-- (VoiceVault-owned table: exists in the shared prod project but not in this
--  repo's migrations — guarded with to_regclass so fresh CI/preview replays
--  don't fail with 42P01. Prod already ran the unguarded original; edited
--  migration files are not re-pushed to prod.)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.note_shares') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can create shares for their notes" ON public.note_shares;
    DROP POLICY IF EXISTS "Users can view their sent shares" ON public.note_shares;
    DROP POLICY IF EXISTS "Users can view shares sent to them" ON public.note_shares;
    DROP POLICY IF EXISTS "Users can update received shares" ON public.note_shares;

    -- Create consolidated SELECT policy (can see sent OR received shares)
    CREATE POLICY "note_shares_select_policy" ON public.note_shares
      FOR SELECT
      USING (
        sender_id = (select auth.uid())
        OR recipient_email = (select auth.email())
      );

    -- Create optimized INSERT policy
    CREATE POLICY "note_shares_insert_policy" ON public.note_shares
      FOR INSERT
      WITH CHECK (sender_id = (select auth.uid()));

    -- Create optimized UPDATE policy (recipients can update their received shares)
    CREATE POLICY "note_shares_update_policy" ON public.note_shares
      FOR UPDATE
      USING (recipient_email = (select auth.email()));
  END IF;
END $$;

-- ============================================================================
-- PART 8: Fix share_chains table RLS policies (VoiceVault-owned, guarded)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.share_chains') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view chains for accessible notes" ON public.share_chains;
    DROP POLICY IF EXISTS "Users can create chain entries" ON public.share_chains;

    -- Create optimized SELECT policy
    -- share_chains tracks note relationships via root_note_id, parent_note_id, child_note_id
    -- Users can view chains they created
    CREATE POLICY "share_chains_select_policy" ON public.share_chains
      FOR SELECT
      USING (created_by = (select auth.uid()));

    -- Create optimized INSERT policy
    CREATE POLICY "share_chains_insert_policy" ON public.share_chains
      FOR INSERT
      WITH CHECK (created_by = (select auth.uid()));
  END IF;
END $$;

-- ============================================================================
-- PART 9: Fix shared_note_access table RLS policies (VoiceVault-owned, guarded)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.shared_note_access') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view their own access" ON public.shared_note_access;
    DROP POLICY IF EXISTS "Service can manage access records" ON public.shared_note_access;

    -- Create consolidated SELECT policy
    CREATE POLICY "shared_note_access_select_policy" ON public.shared_note_access
      FOR SELECT
      USING (user_id = (select auth.uid()));

    -- Service role can manage all (for system operations)
    -- This is handled via service_role key, not RLS
  END IF;
END $$;

-- ============================================================================
-- PART 10: Fix user_settings table RLS policies (VoiceVault-owned, guarded)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.user_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
    DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
    DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;

    -- Create optimized policies for user_settings
    CREATE POLICY "user_settings_select_policy" ON public.user_settings
      FOR SELECT
      USING (user_id = (select auth.uid()));

    CREATE POLICY "user_settings_insert_policy" ON public.user_settings
      FOR INSERT
      WITH CHECK (user_id = (select auth.uid()));

    CREATE POLICY "user_settings_update_policy" ON public.user_settings
      FOR UPDATE
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
END $$;

-- ============================================================================
-- Summary of changes:
-- ============================================================================
-- 1. Removed duplicate index idx_projects_parent (kept idx_projects_parent_id)
-- 2. Wrapped all auth.uid() and auth.email() calls in (select ...) for performance
-- 3. Consolidated multiple permissive SELECT policies into single policies per table
-- 4. Renamed policies to consistent naming convention: {table}_{action}_policy
-- ============================================================================
