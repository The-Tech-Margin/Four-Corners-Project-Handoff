-- Last updated: 2026-05-14
-- ============================================================================
-- 045: Recreate user_profiles + user_invites cleanly.
--
-- Migration 042 used CREATE TABLE IF NOT EXISTS, which silently no-ops when a
-- conflicting relation exists. On at least one environment this left
-- user_profiles without a user_id column, so the follow-on
-- `CREATE POLICY ... USING (user_id = auth.uid())` failed with 42703 and the
-- rest of 042 never ran (user_invites never got created).
--
-- This migration tears down any prior state from 042/043 and rebuilds from
-- scratch in one transaction. Safe only because there should be no production
-- data in either table yet — if you've stored real invites or profile rows,
-- back them up before running.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

DROP TABLE IF EXISTS user_invites CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- ----------------------------------------------------------------------------
-- user_profiles
-- ----------------------------------------------------------------------------
CREATE TABLE user_profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  organization TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_own ON user_profiles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_profiles_update_own ON user_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- user_invites
-- ----------------------------------------------------------------------------
CREATE TABLE user_invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            CITEXT NOT NULL,
  full_name        TEXT NOT NULL,
  organization     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'denied', 'accepted', 'revoked')),
  invite_token     TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            TEXT
);

CREATE UNIQUE INDEX user_invites_email_active
  ON user_invites (lower(email))
  WHERE status IN ('pending', 'approved', 'accepted');

CREATE INDEX user_invites_status ON user_invites (status);

CREATE INDEX user_invites_token ON user_invites (invite_token)
  WHERE invite_token IS NOT NULL;

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only. All access goes through API routes that
-- authenticate the caller (public /join, admin /api/admin/invites, etc.).

-- ----------------------------------------------------------------------------
-- Backfill profiles for pre-existing auth.users (replaces 043)
-- ----------------------------------------------------------------------------
INSERT INTO user_profiles (user_id, full_name, organization)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(u.email, '@', 1)
  ),
  NULL
FROM auth.users u;
