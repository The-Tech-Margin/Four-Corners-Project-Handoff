-- Last updated: 2026-06-12
-- Hotfix: rate-limit lockout spiral.
--
-- check_rate_limit() logs every request including blocked ones, but the
-- window count was COUNT(*) with no blocked filter. Once an identifier hit
-- the cap, each rejected request inserted a fresh row into the window, so
-- steady client retries (e.g. the admin dashboard's 4-parallel-fetch page
-- load) kept the window full and the caller stayed 429'd indefinitely.
--
-- Fix: count only allowed requests. Blocked rows are still logged for the
-- admin dashboard, they just no longer consume budget.
--
-- Same signature as 020_rate_limit_log.sql so the PostgREST RPC keeps
-- resolving; grants from 20260513_security_linter_fixes.sql (service-role
-- only) are unaffected by CREATE OR REPLACE.

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
SET search_path = public, auth, pg_catalog
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

  -- Count only allowed requests in the current window; blocked requests
  -- must not refill the window (lockout spiral).
  SELECT COUNT(*)
    INTO v_count
    FROM rate_limit_log
   WHERE identifier = p_identifier
     AND tier       = p_tier
     AND blocked    = false
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
