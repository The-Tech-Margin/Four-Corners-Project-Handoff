-- Last updated: 2026-04-01
-- Rate limit log table and RPC functions
-- Stores per-request rate limit checks for enforcement and admin dashboard.
-- Only accessible via service_role (RLS enabled, no policies).

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier TEXT        NOT NULL,  -- SHA-256 hash prefix (16 hex chars) of user ID or IP
  tier       TEXT        NOT NULL,  -- 'ai' | 'write' | 'read' | 'admin'
  endpoint   TEXT        NOT NULL,  -- e.g. '/api/ai/generate'
  method     TEXT        NOT NULL DEFAULT 'GET',
  blocked    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role can access

-- Index for rate limit checks (hot path)
CREATE INDEX idx_rl_check
  ON rate_limit_log (identifier, tier, created_at DESC);

-- Index for admin dashboard aggregations
CREATE INDEX idx_rl_dashboard
  ON rate_limit_log (created_at DESC, tier, blocked);

-- Atomic rate limit check: counts recent requests, inserts log entry, returns result
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier     TEXT,
  p_tier           TEXT,
  p_endpoint       TEXT,
  p_method         TEXT,
  p_window_seconds INT,
  p_max_requests   INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
  v_allowed      BOOLEAN;
  v_remaining    INT;
  v_reset_at     TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::INTERVAL;
  v_reset_at     := now() + (p_window_seconds || ' seconds')::INTERVAL;

  -- Count requests in current window
  SELECT COUNT(*)
    INTO v_count
    FROM rate_limit_log
   WHERE identifier = p_identifier
     AND tier       = p_tier
     AND created_at > v_window_start;

  v_allowed   := v_count < p_max_requests;
  v_remaining := GREATEST(0, p_max_requests - v_count - 1);

  -- Always log the request (including blocked ones)
  INSERT INTO rate_limit_log (identifier, tier, endpoint, method, blocked)
  VALUES (p_identifier, p_tier, p_endpoint, p_method, NOT v_allowed);

  RETURN json_build_object(
    'allowed',   v_allowed,
    'remaining', v_remaining,
    'limit',     p_max_requests,
    'reset_at',  v_reset_at
  );
END;
$$;

-- Dashboard aggregation: returns stats for the admin panel
CREATE OR REPLACE FUNCTION get_rate_limit_stats(
  p_hours INT DEFAULT 24
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_since       TIMESTAMPTZ;
  v_total       INT;
  v_blocked     INT;
  v_by_tier     JSON;
  v_top_blocked JSON;
  v_recent      JSON;
BEGIN
  v_since := now() - (p_hours || ' hours')::INTERVAL;

  -- Total and blocked counts
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE blocked)
    INTO v_total, v_blocked
    FROM rate_limit_log
   WHERE created_at > v_since;

  -- Per-tier breakdown
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON)
    INTO v_by_tier
    FROM (
      SELECT tier,
             COUNT(*)                       AS total,
             COUNT(*) FILTER (WHERE blocked) AS blocked
        FROM rate_limit_log
       WHERE created_at > v_since
       GROUP BY tier
       ORDER BY total DESC
    ) t;

  -- Top blocked endpoints
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON)
    INTO v_top_blocked
    FROM (
      SELECT endpoint, tier,
             COUNT(*) AS block_count
        FROM rate_limit_log
       WHERE created_at > v_since
         AND blocked = true
       GROUP BY endpoint, tier
       ORDER BY block_count DESC
       LIMIT 10
    ) t;

  -- Recent violations (last 20)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON)
    INTO v_recent
    FROM (
      SELECT LEFT(identifier, 8) || '...' AS identifier_short,
             endpoint,
             tier,
             created_at
        FROM rate_limit_log
       WHERE created_at > v_since
         AND blocked = true
       ORDER BY created_at DESC
       LIMIT 20
    ) t;

  RETURN json_build_object(
    'total_requests', v_total,
    'total_blocked',  v_blocked,
    'by_tier',        v_by_tier,
    'top_blocked',    v_top_blocked,
    'recent_violations', v_recent,
    'since',          v_since,
    'generated_at',   now()
  );
END;
$$;

-- Cleanup: removes entries older than retention window
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log(
  p_retain_hours INT DEFAULT 72
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM rate_limit_log
   WHERE created_at < now() - (p_retain_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
