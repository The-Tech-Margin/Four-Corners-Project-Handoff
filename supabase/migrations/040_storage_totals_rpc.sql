-- Last updated: 2026-04-17
-- ============================================================================
-- 040: Storage totals RPC — true per-user bytes from storage.objects.
--
-- The admin Storage view was summing `user_assets.file_size`, which is only
-- populated for uploads recorded AFTER migration 036. Rows backfilled by
-- migration 037 have NULL file_size, so legacy users appear as 0 B.
--
-- This RPC reads the storage.objects system table directly — the source of
-- truth for every byte in every bucket — and aggregates by user_id parsed
-- from the `{userId}/...` path prefix used app-wide.
--
-- SECURITY: marked as SECURITY DEFINER and bound to service_role + authenticated
-- roles, but the function itself still checks that the caller has an admin
-- user_roles entry. Callers without admin roles get an empty result — no PII.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_storage_totals_by_user()
RETURNS TABLE (
  user_id      UUID,
  total_bytes  BIGINT,
  object_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Gate: only admin / super_admin can read aggregate storage data for all users.
  -- Service role bypasses RLS automatically (auth.uid() is NULL), so service-role
  -- callers pass this check via the NULL branch.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_roles.user_id = auth.uid()
         AND user_roles.role IN ('admin', 'super_admin')
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    -- Path convention: {userId}/bucket-specific-path/…
    ((string_to_array(o.name, '/'))[1])::uuid AS user_id,
    COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)::bigint AS total_bytes,
    COUNT(*)::int AS object_count
  FROM storage.objects o
  WHERE o.bucket_id IN (
          'context-media',
          'voice-recordings',
          'consent-documents',
          'project-images'
        )
    -- Only rows whose first path segment looks like a UUID — ignore anything else.
    AND (string_to_array(o.name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  GROUP BY 1;
END;
$$;

-- Grant to authenticated roles; the body still checks for admin role.
GRANT EXECUTE ON FUNCTION public.get_storage_totals_by_user() TO authenticated, service_role;

-- ============================================================================
-- Single-user variant — lets /api/admin/users/[id] fetch just one user's total
-- without pulling the full table. Same admin gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_storage_total_for_user(target_user_id UUID)
RETURNS TABLE (
  total_bytes  BIGINT,
  object_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> target_user_id
     AND NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_roles.user_id = auth.uid()
         AND user_roles.role IN ('admin', 'super_admin')
     )
  THEN
    -- Non-admins can only ask about themselves.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)::bigint AS total_bytes,
    COUNT(*)::int AS object_count
  FROM storage.objects o
  WHERE o.bucket_id IN (
          'context-media',
          'voice-recordings',
          'consent-documents',
          'project-images'
        )
    AND (string_to_array(o.name, '/'))[1] = target_user_id::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storage_total_for_user(UUID)
  TO authenticated, service_role;
