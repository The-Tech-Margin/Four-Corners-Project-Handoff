-- Last updated: 2026-06-30
-- Harden public.spatial_ref_sys (PostGIS reference table), flagged Critical by the
-- Supabase Security Advisor (rls_disabled_in_public, 28 Jun 2026).
--
-- spatial_ref_sys is owned by supabase_admin, so the `postgres` role that runs
-- `supabase db push` cannot ENABLE RLS or REVOKE its grants (both need the table
-- owner / a superuser). This migration wraps the hardening in a DO block that
-- catches insufficient_privilege and degrades to a NOTICE no-op, so it records
-- cleanly via db push and self-applies if ever run by a privileged role
-- (Dashboard SQL Editor / local CI superuser). To apply on prod NOW, run the
-- same statements in the Supabase Dashboard SQL Editor — see SECURITY.md.
--
-- service_role / postgres bypass RLS, so backend writes are unaffected; the
-- permissive SELECT policy keeps PostGIS coordinate transforms working for
-- anon/authenticated. The app never writes spatial_ref_sys, so revoking its
-- write grants has zero functional impact.

BEGIN;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys'
      AND policyname = 'spatial_ref_sys_read_only'
  ) THEN
    EXECUTE $p$
      CREATE POLICY spatial_ref_sys_read_only
        ON public.spatial_ref_sys
        FOR SELECT TO anon, authenticated
        USING (true)
    $p$;
  END IF;

  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER '
       || 'ON public.spatial_ref_sys FROM anon, authenticated';

  RAISE NOTICE 'spatial_ref_sys hardened: RLS on, read-only policy added, writes revoked.';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped spatial_ref_sys hardening: role % is not the table owner. '
                 'Run the statements in the Supabase Dashboard SQL Editor. See SECURITY.md.',
                 current_user;
END $$;

COMMIT;
