-- Last updated: 2026-05-14
-- ============================================================================
-- 042: user_invites + user_profiles — email-gated access flow.
--
-- Adds two tables:
--   • user_profiles  — name + organization for everyone who signs up
--   • user_invites   — one row per access request / direct invite
--
-- Replaces open magic-link signup with an invite-gated flow:
--   1. Prospective user submits name/org/email at /join (creates pending row)
--   2. Admin approves at /admin/invites (status → approved, token generated)
--   3. User clicks token link, sets password, profile row inserted
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ----------------------------------------------------------------------------
-- user_profiles — non-credential identity (name + organization).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  organization  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_own ON user_profiles FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_profiles_update_own ON user_profiles FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No INSERT/DELETE policies — service-role only (set during accept-invite).

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- user_invites — one row per access request / direct invite.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT NOT NULL,
  full_name         TEXT NOT NULL,
  organization      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'accepted', 'revoked')),
  invite_token      TEXT UNIQUE,
  token_expires_at  TIMESTAMPTZ,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             TEXT
);

-- One active (non-revoked / non-denied) request per email
CREATE UNIQUE INDEX IF NOT EXISTS user_invites_email_active
  ON user_invites (lower(email))
  WHERE status IN ('pending', 'approved', 'accepted');

CREATE INDEX IF NOT EXISTS user_invites_status ON user_invites (status);
CREATE INDEX IF NOT EXISTS user_invites_token ON user_invites (invite_token)
  WHERE invite_token IS NOT NULL;

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only. All access goes through API routes that
-- authenticate the caller (public /join, admin /api/admin/invites, etc.).
