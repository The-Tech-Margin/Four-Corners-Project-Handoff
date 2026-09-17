-- Last updated: 2026-06-09
-- ============================================================================
-- 049: issue_reports — in-app issue intake. Form collects type/severity/
-- description; everything else is auto-captured client-side and enriched
-- server-side. Mirrors 042_user_invites.sql conventions (RLS on, service-role
-- writes, SELECT own). Triage fields (assignee/priority/resolution/...) ship
-- now; only the admin UI that *transitions* status is deferred.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS issue_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status               TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix','duplicate')),
  type                 TEXT NOT NULL DEFAULT 'bug'
                       CHECK (type IN ('bug','visual','data','performance','feature','other')),
  severity             TEXT NOT NULL DEFAULT 'minor'
                       CHECK (severity IN ('blocker','major','minor','cosmetic')),
  title                TEXT,
  description          TEXT NOT NULL,
  steps                TEXT,
  reporter_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email       CITEXT,
  url                  TEXT,
  route                TEXT,
  referrer             TEXT,
  app_state            JSONB NOT NULL DEFAULT '{}'::jsonb,
  device               JSONB NOT NULL DEFAULT '{}'::jsonb,
  build                JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostics          JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent           TEXT,
  screenshot_path      TEXT,
  consent_screenshot   BOOLEAN NOT NULL DEFAULT TRUE,
  consent_diagnostics  BOOLEAN NOT NULL DEFAULT TRUE,
  assignee             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority             SMALLINT,
  resolution           TEXT,
  resolved_at          TIMESTAMPTZ,
  reviewed_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_status_idx      ON issue_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_reports_reporter_idx    ON issue_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS issue_reports_type_sev_idx    ON issue_reports (type, severity);
CREATE INDEX IF NOT EXISTS issue_reports_app_state_gin   ON issue_reports USING gin (app_state);
CREATE INDEX IF NOT EXISTS issue_reports_diagnostics_gin ON issue_reports USING gin (diagnostics);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY issue_reports_select_own ON issue_reports FOR SELECT
  USING (reporter_user_id = (SELECT auth.uid()));
-- No client INSERT/UPDATE/DELETE — service-role only.

CREATE TRIGGER update_issue_reports_updated_at
  BEFORE UPDATE ON issue_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-screenshots', 'issue-screenshots', false)
ON CONFLICT (id) DO NOTHING;
