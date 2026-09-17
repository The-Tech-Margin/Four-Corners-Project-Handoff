-- Last updated: 2026-06-10
-- ============================================================================
-- 050: issue_report_events — append-only activity log for issue tickets.
--
-- Every update to a ticket (reporter edit/comment, super-admin status change,
-- assignment, priority, resolution) writes a row here so ticket history is
-- preserved additively — the issue_reports row reflects the latest state, this
-- table is the immutable audit trail. Mirrors 049 conventions: RLS on,
-- service-role writes only, reporters may SELECT events for their own tickets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue_report_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        UUID NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  author_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_kind      TEXT NOT NULL CHECK (author_kind IN ('reporter','admin')),
  kind             TEXT NOT NULL
                   CHECK (kind IN ('comment','status','assignment','priority','resolution','edit')),
  body             TEXT,
  changes          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_report_events_report_idx
  ON issue_report_events (report_id, created_at);

ALTER TABLE issue_report_events ENABLE ROW LEVEL SECURITY;

-- Reporters can read the event thread for their own tickets. All writes go
-- through service-role API routes (no client INSERT/UPDATE/DELETE policy);
-- events are append-only — never updated or deleted from the client.
CREATE POLICY issue_report_events_select_own ON issue_report_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issue_reports r
      WHERE r.id = issue_report_events.report_id
        AND r.reporter_user_id = (SELECT auth.uid())
    )
  );
