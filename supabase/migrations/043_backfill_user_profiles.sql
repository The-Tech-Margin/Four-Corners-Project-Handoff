-- Last updated: 2026-05-14
-- ============================================================================
-- 043: Backfill user_profiles for existing auth.users rows.
--
-- Migration 042 created user_profiles for new invite-flow users.
-- Existing users (who signed up before the hard gate) need rows too so
-- application code that reads from user_profiles doesn't 404 on them.
--
-- full_name is pulled from auth.users.raw_user_meta_data->>'full_name'
-- when present, else falls back to the email's local part.
-- organization is left NULL — users can fill it in via settings later.
-- ============================================================================

INSERT INTO user_profiles (user_id, full_name, organization)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(u.email, '@', 1)
  ) AS full_name,
  NULL AS organization
FROM auth.users u
LEFT JOIN user_profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;
