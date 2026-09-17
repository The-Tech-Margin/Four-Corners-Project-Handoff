-- Last updated: 2026-05-15
-- ============================================================================
-- 046: Store the acting admin's display name on the invite row.
--
-- reviewed_by already holds the admin's UUID, but rendering "who acted" in the
-- admin invites card would otherwise require a per-listing join against
-- user_profiles. Snapshotting the name at action time is cheaper to read,
-- preserves the historical reviewer name even if their profile is later
-- renamed, and the name is already in hand on the server when the action
-- happens (auth.user.user_metadata.full_name, falling back to email).
-- ============================================================================

ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;
