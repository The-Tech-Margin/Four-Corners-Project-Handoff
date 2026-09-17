-- Last updated: 2026-04-17
-- ============================================================================
-- 039: User plans — forward-compatible rails for per-user storage quotas.
--
-- NON-BREAKING: Purely additive. Defaults everyone to 'free'. The plan → bytes
-- mapping lives in code (lib/upload-limits.ts::PLAN_QUOTAS), so changing a
-- tier's cap is a code change + redeploy, not a row migration.
--
-- What this enables:
--   • Per-user storage quotas (checked pre-upload against SUM(user_assets.file_size))
--   • Future: upgrading a user is one UPDATE user_plans SET plan = 'pro' WHERE ...
--   • `custom_limit_bytes` overrides the tier default without changing the plan
--     name — useful for one-off early-access bumps or internal accounts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_plans (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan IN ('free', 'pro', 'team', 'unlimited')),
  -- Optional per-user override — takes precedence over the plan default.
  custom_limit_bytes  BIGINT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plans_plan ON user_plans (plan);

-- ============================================================================
-- RLS — users may read their own plan to render the usage badge. Writes are
-- service-role only (plan changes happen from a future payment webhook, not
-- from the client).
-- ============================================================================

ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_plans_select_own ON user_plans FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE policies — these require service_role.

-- ============================================================================
-- updated_at trigger (reuses the shared function defined in earlier migrations).
-- ============================================================================

CREATE TRIGGER update_user_plans_updated_at
  BEFORE UPDATE ON user_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
