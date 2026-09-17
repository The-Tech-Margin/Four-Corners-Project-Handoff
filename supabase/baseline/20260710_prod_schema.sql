--
-- PostgreSQL database dump
--

\restrict gxfHVod6kE9J0ewdE9hiXydUX2N1D4vRwxlbauwTdsUqaU9OuV9dkze6scb3dzA

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'super_admin'
);


--
-- Name: check_rate_limit(text, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(p_identifier text, p_tier text, p_endpoint text, p_method text, p_window_seconds integer, p_max_requests integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
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


--
-- Name: cleanup_rate_limit_log(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_rate_limit_log(p_retain_hours integer DEFAULT 72) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
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


--
-- Name: count_pending_shares(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_pending_shares(p_user_email text) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::INTEGER
  FROM note_shares
  WHERE recipient_email = p_user_email
  AND status = 'pending'
  AND (expires_at IS NULL OR expires_at > NOW());
$$;


--
-- Name: create_user_from_phone(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_from_phone(p_user_id uuid, p_phone text, p_share_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := p_user_id;
BEGIN
  -- Insert or update the user profile with provided auth user id
  INSERT INTO user_profiles (id, phone, created_via_share, onboarding_completed)
  VALUES (v_user_id, p_phone, true, false)
  ON CONFLICT (id) DO UPDATE
    SET phone = EXCLUDED.phone,
        created_via_share = user_profiles.created_via_share OR EXCLUDED.created_via_share,
        updated_at = NOW()
  RETURNING id INTO v_user_id;

  -- Update share with recipient_id
  UPDATE note_shares 
  SET recipient_id = v_user_id, auto_created_account = true
  WHERE id = p_share_id;

  RETURN v_user_id;
END;
$$;


--
-- Name: expire_old_shares(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_shares() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE note_shares
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();
  
  RETURN NEW;
END;
$$;


--
-- Name: find_user_by_contact(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_user_by_contact(p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text) RETURNS TABLE(user_id uuid, user_email text, user_phone text, is_found boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.email as user_email,
    up.phone as user_phone,
    true as is_found
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.id = u.id
  WHERE 
    (p_email IS NOT NULL AND u.email = p_email) OR
    (p_phone IS NOT NULL AND up.phone = p_phone)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, false;
  END IF;
END;
$$;


--
-- Name: get_browser_breakdown(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_browser_breakdown(p_hours integer DEFAULT 24) RETURNS TABLE(browser text, views bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE(browser, 'Unknown') AS browser,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY COALESCE(browser, 'Unknown')
  ORDER BY COUNT(*) DESC;
$$;


--
-- Name: get_equipment_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_equipment_stats(p_limit integer DEFAULT 10) RETURNS TABLE(make text, model text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT camera_make AS make, camera_model AS model, count(*) AS count
  FROM photo_metadata
  WHERE camera_make IS NOT NULL
     OR camera_model IS NOT NULL
  GROUP BY camera_make, camera_model
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_geo_breakdown(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_geo_breakdown(p_hours integer DEFAULT 24) RETURNS TABLE(country text, city text, region text, count bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    country,
    city,
    region,
    COUNT(*)::bigint AS count
  FROM speed_insights
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND country IS NOT NULL
  GROUP BY country, city, region
  ORDER BY COUNT(*) DESC
  LIMIT 200;
$$;


--
-- Name: get_location_countries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_location_countries() RETURNS TABLE(country text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT country, count(*) AS count
  FROM project_locations
  WHERE country IS NOT NULL
    AND country != ''
  GROUP BY country
  ORDER BY count DESC;
$$;


--
-- Name: get_match_positions(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_match_positions(p_text text, p_search_query text) RETURNS integer[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_positions INTEGER[] := ARRAY[]::INTEGER[];
  v_pos INTEGER;
  v_search_lower TEXT;
  v_text_lower TEXT;
BEGIN
  v_search_lower := lower(p_search_query);
  v_text_lower := lower(p_text);
  v_pos := position(v_search_lower IN v_text_lower);
  
  WHILE v_pos > 0 LOOP
    v_positions := array_append(v_positions, v_pos);
    v_text_lower := substring(v_text_lower FROM v_pos + length(v_search_lower));
    v_pos := position(v_search_lower IN v_text_lower);
    IF v_pos > 0 THEN
      v_pos := v_pos + length(v_search_lower) * array_length(v_positions, 1);
    END IF;
  END LOOP;
  
  RETURN v_positions;
END;
$$;


--
-- Name: get_os_breakdown(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_os_breakdown(p_hours integer DEFAULT 24) RETURNS TABLE(os text, views bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE(os, 'Unknown') AS os,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY COALESCE(os, 'Unknown')
  ORDER BY COUNT(*) DESC;
$$;


--
-- Name: get_page_views_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_page_views_summary(p_hours integer DEFAULT 24) RETURNS TABLE(total_views bigint, unique_sessions bigint, unique_paths bigint, unique_countries bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COUNT(*)::bigint AS total_views,
    COUNT(DISTINCT session_id)::bigint AS unique_sessions,
    COUNT(DISTINCT path)::bigint AS unique_paths,
    COUNT(DISTINCT country)::bigint AS unique_countries
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval;
$$;


--
-- Name: get_project_children(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_children(project_uuid uuid) RETURNS TABLE(id uuid, slug text, main_image_url text, metadata jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.slug, p.main_image_url, p.metadata, p.created_at
  FROM projects p
  WHERE p.parent_project_id = project_uuid
    AND p.in_gallery = true
  ORDER BY p.created_at ASC;
END;
$$;


--
-- Name: get_project_search_text(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_project_search_text(target_project_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
DECLARE
  p_title       TEXT;
  p_author      TEXT;
  p_tags        TEXT;
  bs_text       TEXT;
  cc_text       TEXT;
  pi_text       TEXT;
  loc_text      TEXT;
  eth_text      TEXT;
  pm_text       TEXT;
  ci_text       TEXT;
  lk_text       TEXT;
  vt_text       TEXT;
BEGIN
  -- Project-level fields
  SELECT
    COALESCE(p.title, ''),
    COALESCE(p.author, ''),
    COALESCE(array_to_string(p.tags, ' '), '')
  INTO p_title, p_author, p_tags
  FROM projects p WHERE p.id = target_project_id;

  IF NOT FOUND THEN RETURN ''; END IF;

  -- Backstory
  SELECT COALESCE(string_agg(
    COALESCE(bs.text, '') || ' ' || COALESCE(bs.author, '') || ' ' || COALESCE(bs.publication, ''), ' '
  ), '') INTO bs_text
  FROM project_backstory bs WHERE bs.project_id = target_project_id;

  -- Creative commons
  SELECT COALESCE(string_agg(
    COALESCE(cc.copyright, '') || ' ' || COALESCE(cc.description, ''), ' '
  ), '') INTO cc_text
  FROM project_creative_commons cc WHERE cc.project_id = target_project_id;

  -- Photographer info
  SELECT COALESCE(string_agg(
    COALESCE(pi.bio, '') || ' ' || COALESCE(pi.contact, '') || ' ' || COALESCE(pi.website, ''), ' '
  ), '') INTO pi_text
  FROM project_photographer_info pi WHERE pi.project_id = target_project_id;

  -- Location
  SELECT COALESCE(string_agg(
    COALESCE(loc.city, '') || ' ' || COALESCE(loc.state, '') || ' ' ||
    COALESCE(loc.country, '') || ' ' || COALESCE(loc.formatted_location, '') || ' ' ||
    COALESCE(loc.street, '') || ' ' || COALESCE(loc.address_city, '') || ' ' ||
    COALESCE(loc.state_province, '') || ' ' || COALESCE(loc.address_country, '') || ' ' ||
    COALESCE(loc.postal_code, ''), ' '
  ), '') INTO loc_text
  FROM project_locations loc WHERE loc.project_id = target_project_id;

  -- Ethics
  SELECT COALESCE(string_agg(
    COALESCE(e.custom_ethics_text, '') || ' ' || COALESCE(e.manipulation_details, '') || ' ' ||
    COALESCE(e.staging_details, '') || ' ' || COALESCE(e.consent_details, '') || ' ' ||
    COALESCE(e.identity_protection_details, '') || ' ' || COALESCE(e.ai_altered_details, ''), ' '
  ), '') INTO eth_text
  FROM project_ethics e WHERE e.project_id = target_project_id;

  -- Photo metadata equipment
  SELECT COALESCE(string_agg(
    COALESCE(pm.camera_make, '') || ' ' || COALESCE(pm.camera_model, '') || ' ' || COALESCE(pm.lens_model, ''), ' '
  ), '') INTO pm_text
  FROM photo_metadata pm WHERE pm.project_id = target_project_id;

  -- Context items
  SELECT COALESCE(string_agg(
    COALESCE(c.caption, '') || ' ' || COALESCE(c.description, '') || ' ' || COALESCE(c.credit, ''), ' '
  ), '') INTO ci_text
  FROM context_items c WHERE c.project_id = target_project_id;

  -- Links
  SELECT COALESCE(string_agg(
    COALESCE(l.title, '') || ' ' || COALESCE(l.source, ''), ' '
  ), '') INTO lk_text
  FROM links l WHERE l.project_id = target_project_id;

  -- Voice transcriptions
  SELECT COALESCE(string_agg(COALESCE(vt.text, ''), ' '), '')
  INTO vt_text
  FROM voice_transcriptions vt WHERE vt.project_id = target_project_id;

  RETURN trim(
    p_title || ' ' || p_author || ' ' || p_tags || ' ' ||
    bs_text || ' ' || cc_text || ' ' ||
    pi_text || ' ' || loc_text || ' ' || eth_text || ' ' ||
    pm_text || ' ' || ci_text || ' ' || lk_text || ' ' || vt_text
  );
END;
$$;


--
-- Name: get_pv_country_breakdown(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pv_country_breakdown(p_hours integer DEFAULT 24) RETURNS TABLE(country text, city text, region text, views bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    country,
    city,
    region,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND country IS NOT NULL
  GROUP BY country, city, region
  ORDER BY COUNT(*) DESC
  LIMIT 200;
$$;


--
-- Name: get_rate_limit_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rate_limit_stats(p_hours integer DEFAULT 24) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
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


--
-- Name: get_root_parent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_root_parent(project_uuid uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
DECLARE
  current_id UUID := project_uuid;
  parent_id UUID;
BEGIN
  LOOP
    SELECT parent_project_id INTO parent_id
    FROM projects WHERE id = current_id;

    IF parent_id IS NULL THEN
      RETURN current_id;
    END IF;

    current_id := parent_id;
  END LOOP;
END;
$$;


--
-- Name: get_search_context(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer DEFAULT 2) RETURNS TABLE(note_id uuid, title text, transcript text, audio_url text, duration_seconds integer, created_at timestamp with time zone, chain_order integer, is_match boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH note_chain AS (
    SELECT 
      sc.root_note_id,
      sc.child_note_id,
      sc.chain_order
    FROM share_chains sc
    WHERE sc.child_note_id = p_note_id
    
    UNION
    
    SELECT 
      sc.root_note_id,
      sc.child_note_id,
      sc.chain_order
    FROM share_chains sc
    WHERE sc.root_note_id = (
      SELECT root_note_id FROM share_chains WHERE child_note_id = p_note_id LIMIT 1
    )
  ),
  match_order AS (
    SELECT chain_order FROM note_chain WHERE child_note_id = p_note_id
  )
  SELECT 
    vn.id,
    vn.title,
    vn.transcript,
    vn.audio_url,
    vn.duration_seconds,
    vn.created_at,
    nc.chain_order,
    (vn.id = p_note_id) as is_match
  FROM note_chain nc
  INNER JOIN voice_notes vn ON vn.id = nc.child_note_id
  CROSS JOIN match_order mo
  WHERE 
    nc.chain_order BETWEEN (mo.chain_order - p_context_size) 
                       AND (mo.chain_order + p_context_size)
    AND (vn.user_id = p_user_id OR EXISTS (
      SELECT 1 FROM shared_note_access sna 
      WHERE sna.note_id = vn.id AND sna.user_id = p_user_id
    ))
  ORDER BY nc.chain_order ASC;
END;
$$;


--
-- Name: FUNCTION get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer) IS 'Get surrounding notes in chain for context around a match';


--
-- Name: get_share_chain(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share_chain(p_note_id uuid) RETURNS TABLE(note_id uuid, title text, transcript text, audio_url text, duration_seconds integer, user_id uuid, created_at timestamp with time zone, depth integer, chain_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE chain AS (
    -- Root note
    SELECT 
      sc.child_note_id,
      sc.depth,
      sc.chain_order,
      sc.root_note_id
    FROM share_chains sc
    WHERE sc.root_note_id = p_note_id
    
    UNION ALL
    
    -- Chain descendants
    SELECT 
      sc.child_note_id,
      sc.depth,
      sc.chain_order,
      sc.root_note_id
    FROM share_chains sc
    INNER JOIN chain c ON sc.parent_note_id = c.child_note_id
  )
  SELECT 
    vn.id,
    vn.title,
    vn.transcript,
    vn.audio_url,
    vn.duration_seconds,
    vn.user_id,
    vn.created_at,
    c.depth,
    c.chain_order
  FROM chain c
  JOIN voice_notes vn ON vn.id = c.child_note_id
  ORDER BY c.chain_order;
END;
$$;


--
-- Name: get_shares_by_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shares_by_phone(p_phone text) RETURNS TABLE(share_id uuid, note_id uuid, sender_id uuid, status text, message text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ns.id,
    ns.note_id,
    ns.sender_id,
    ns.status,
    ns.message,
    ns.created_at
  FROM note_shares ns
  WHERE ns.recipient_phone = p_phone
    AND ns.status IN ('pending', 'accepted')
  ORDER BY ns.created_at DESC;
END;
$$;


--
-- Name: get_storage_total_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_storage_total_for_user(target_user_id uuid) RETURNS TABLE(total_bytes bigint, object_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> target_user_id
     AND NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_roles.user_id = auth.uid()
         AND user_roles.role IN ('admin', 'super_admin')
     )
  THEN
    -- Non-admins can only ask about themselves.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)::bigint AS total_bytes,
    COUNT(*)::int AS object_count
  FROM storage.objects o
  WHERE o.bucket_id IN (
          'context-media',
          'voice-recordings',
          'consent-documents',
          'project-images'
        )
    AND (string_to_array(o.name, '/'))[1] = target_user_id::text;
END;
$$;


--
-- Name: get_storage_totals_by_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_storage_totals_by_user() RETURNS TABLE(user_id uuid, total_bytes bigint, object_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  -- Gate: only admin / super_admin can read aggregate storage data for all users.
  -- Service role bypasses RLS automatically (auth.uid() is NULL), so service-role
  -- callers pass this check via the NULL branch.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_roles.user_id = auth.uid()
         AND user_roles.role IN ('admin', 'super_admin')
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    -- Path convention: {userId}/bucket-specific-path/…
    ((string_to_array(o.name, '/'))[1])::uuid AS user_id,
    COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)::bigint AS total_bytes,
    COUNT(*)::int AS object_count
  FROM storage.objects o
  WHERE o.bucket_id IN (
          'context-media',
          'voice-recordings',
          'consent-documents',
          'project-images'
        )
    -- Only rows whose first path segment looks like a UUID — ignore anything else.
    AND (string_to_array(o.name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  GROUP BY 1;
END;
$_$;


--
-- Name: get_tag_distribution(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tag_distribution(p_limit integer DEFAULT 50) RETURNS TABLE(tag text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT t.tag, count(*) AS count
  FROM projects, unnest(tags) AS t(tag)
  WHERE tags IS NOT NULL
    AND array_length(tags, 1) > 0
  GROUP BY t.tag
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_top_cities(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_cities(p_limit integer DEFAULT 10) RETURNS TABLE(city text, country text, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT city, country, count(*) AS count
  FROM project_locations
  WHERE city IS NOT NULL
    AND city != ''
  GROUP BY city, country
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_top_pages(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_pages(p_hours integer DEFAULT 24, p_limit integer DEFAULT 10) RETURNS TABLE(path text, views bigint, sessions bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    path,
    COUNT(*)::bigint AS views,
    COUNT(DISTINCT session_id)::bigint AS sessions
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
  GROUP BY path
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;


--
-- Name: get_top_referrers(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_referrers(p_hours integer DEFAULT 24, p_limit integer DEFAULT 10) RETURNS TABLE(referrer_host text, views bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    referrer_host,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND referrer_host IS NOT NULL
    AND referrer_host <> ''
  GROUP BY referrer_host
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;


--
-- Name: get_utm_breakdown(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_utm_breakdown(p_hours integer DEFAULT 24, p_limit integer DEFAULT 10) RETURNS TABLE(source text, medium text, campaign text, views bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    utm_source AS source,
    utm_medium AS medium,
    utm_campaign AS campaign,
    COUNT(*)::bigint AS views
  FROM page_views
  WHERE timestamp > now() - (p_hours || ' hours')::interval
    AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
  GROUP BY utm_source, utm_medium, utm_campaign
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_by_browser_engine(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_browser_engine(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20) RETURNS TABLE(engine text, engine_version text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    browser_engine AS engine,
    browser_engine_version AS engine_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND browser_engine IS NOT NULL
  GROUP BY browser_engine, browser_engine_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_by_client(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_client(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20) RETURNS TABLE(client_name text, client_type text, client_version text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    client_name,
    client_type,
    client_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND client_name IS NOT NULL
  GROUP BY client_name, client_type, client_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_by_connection(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_connection(p_hours integer DEFAULT 24) RETURNS TABLE(connection_speed text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    connection_speed,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND connection_speed IS NOT NULL
  GROUP BY connection_speed
  ORDER BY count DESC;
$$;


--
-- Name: get_web_vitals_by_device(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_device(p_hours integer DEFAULT 24) RETURNS TABLE(device text, lcp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT
    COALESCE(device_type, 'unknown') AS device,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
  GROUP BY device_type
  ORDER BY count DESC;
$$;


--
-- Name: get_web_vitals_by_device_brand(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_device_brand(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20) RETURNS TABLE(device_brand text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    device_brand,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND device_brand IS NOT NULL
  GROUP BY device_brand
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_by_os(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_os(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20) RETURNS TABLE(os_name text, os_version text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    os_name,
    os_version,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND os_name IS NOT NULL
  GROUP BY os_name, os_version
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_by_route(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_by_route(p_hours integer DEFAULT 24, p_limit integer DEFAULT 20) RETURNS TABLE(path text, lcp_p75 double precision, cls_p75 double precision, inp_p75 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT
    path,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'LCP') AS lcp_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'CLS') AS cls_p75,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'INP') AS inp_p75,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
    AND path IS NOT NULL
  GROUP BY path
  ORDER BY count DESC
  LIMIT p_limit;
$$;


--
-- Name: get_web_vitals_summary(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_vitals_summary(p_hours integer DEFAULT 24) RETURNS TABLE(metric text, p50 double precision, p75 double precision, p95 double precision, count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT
    metric_type AS metric,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY value) AS p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95,
    count(*) AS count
  FROM speed_insights
  WHERE timestamp >= now() - (p_hours || ' hours')::interval
  GROUP BY metric_type
  ORDER BY metric_type;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    slug text,
    date text GENERATED ALWAYS AS (((metadata -> 'backStory'::text) ->> 'date'::text)) STORED,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    main_image_url text,
    main_image_storage_path text,
    published boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parent_project_id uuid,
    version_number integer DEFAULT 1,
    forked_from_user_id uuid,
    is_fork boolean DEFAULT false,
    in_gallery boolean DEFAULT false,
    title text,
    author text,
    editor_version text,
    mode text,
    tags text[] DEFAULT '{}'::text[],
    search_vector tsvector,
    search_embedding public.vector(1536),
    main_image_thumbnail_path text,
    CONSTRAINT check_gallery_requires_published CHECK (((in_gallery = false) OR ((in_gallery = true) AND (published = true)))),
    CONSTRAINT projects_mode_check CHECK ((mode = ANY (ARRAY['minimal'::text, 'standard'::text, 'complete'::text])))
);


--
-- Name: COLUMN projects.parent_project_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.parent_project_id IS 'References the parent project when this project was created from a context image (daisy-chaining)';


--
-- Name: COLUMN projects.version_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.version_number IS 'Version number for tracking copies (incremented for each copy)';


--
-- Name: COLUMN projects.forked_from_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.forked_from_user_id IS 'User ID of the original project owner (if forked from another user)';


--
-- Name: COLUMN projects.is_fork; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.is_fork IS 'True if this project was copied from another user''s project';


--
-- Name: COLUMN projects.in_gallery; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.in_gallery IS 'Whether this project should appear in the public gallery';


--
-- Name: COLUMN projects.main_image_thumbnail_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.main_image_thumbnail_path IS '400px-max aspect-preserving JPEG thumbnail of main_image, stored alongside it in the same bucket. Best-effort: NULL when generation failed or the row predates this column. Gallery cards prefer this over main_image_url and fall back to the full image when NULL.';


--
-- Name: list_gallery_projects_light(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_gallery_projects_light() RETURNS SETOF public.projects
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT * FROM projects WHERE published = true AND in_gallery = true ORDER BY created_at DESC;
$$;


--
-- Name: list_user_projects_light(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_user_projects_light(p_user_id uuid) RETURNS SETOF public.projects
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT * FROM projects WHERE user_id = p_user_id ORDER BY created_at DESC;
$$;


--
-- Name: project_locations_set_coordinates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_locations_set_coordinates() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  NEW.coordinates := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$;


--
-- Name: projects_author_autofill(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_author_autofill() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.author IS NULL OR btrim(NEW.author) = '') THEN
      NEW.author := COALESCE((NEW.metadata -> 'backStory') ->> 'author', NEW.metadata ->> 'author');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.author IS NULL OR btrim(NEW.author) = '') THEN
      NEW.author := COALESCE((NEW.metadata -> 'backStory') ->> 'author', NEW.metadata ->> 'author');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: projects_title_autofill(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projects_title_autofill() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  -- On INSERT: if NEW.title is null or empty, try from metadata
  IF TG_OP = 'INSERT' THEN
    IF (NEW.title IS NULL OR btrim(NEW.title) = '') THEN
      NEW.title := NEW.metadata ->> 'title';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If client did not change title (left NULL) but changed metadata title, fill it
    IF (NEW.title IS NULL OR btrim(NEW.title) = '') THEN
      -- If metadata changed or title was cleared, derive from metadata
      NEW.title := NEW.metadata ->> 'title';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: rebuild_project_search_vector(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rebuild_project_search_vector(target_project_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
DECLARE
  p_title       TEXT;
  p_author      TEXT;
  p_tags        TEXT;
  bs_text       TEXT;
  bs_author     TEXT;
  bs_pub        TEXT;
  cc_copy       TEXT;
  cc_desc       TEXT;
  pi_bio        TEXT;
  pi_contact    TEXT;
  pi_website    TEXT;
  loc_text      TEXT;
  eth_text      TEXT;
  pm_text       TEXT;
  ci_text       TEXT;
  lk_text       TEXT;
  vt_text       TEXT;
BEGIN
  -- Project-level fields (weight A)
  SELECT
    COALESCE(p.title, ''),
    COALESCE(p.author, ''),
    COALESCE(array_to_string(p.tags, ' '), '')
  INTO p_title, p_author, p_tags
  FROM projects p WHERE p.id = target_project_id;

  -- Backstory (weight B)
  SELECT
    COALESCE(string_agg(
      COALESCE(bs.text, '') || ' ' ||
      COALESCE(bs.author, '') || ' ' ||
      COALESCE(bs.publication, ''),
      ' '
    ), '')
  INTO bs_text
  FROM project_backstory bs WHERE bs.project_id = target_project_id;

  -- Creative commons (weight B)
  SELECT
    COALESCE(string_agg(
      COALESCE(cc.copyright, '') || ' ' ||
      COALESCE(cc.description, ''),
      ' '
    ), '')
  INTO cc_copy
  FROM project_creative_commons cc WHERE cc.project_id = target_project_id;

  -- Photographer info (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(pi.bio, '') || ' ' ||
      COALESCE(pi.contact, '') || ' ' ||
      COALESCE(pi.website, ''),
      ' '
    ), '')
  INTO pi_bio
  FROM project_photographer_info pi WHERE pi.project_id = target_project_id;

  -- Location (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(loc.city, '') || ' ' ||
      COALESCE(loc.state, '') || ' ' ||
      COALESCE(loc.country, '') || ' ' ||
      COALESCE(loc.formatted_location, '') || ' ' ||
      COALESCE(loc.street, '') || ' ' ||
      COALESCE(loc.address_city, '') || ' ' ||
      COALESCE(loc.state_province, '') || ' ' ||
      COALESCE(loc.address_country, '') || ' ' ||
      COALESCE(loc.postal_code, ''),
      ' '
    ), '')
  INTO loc_text
  FROM project_locations loc WHERE loc.project_id = target_project_id;

  -- Ethics (weight C)
  SELECT
    COALESCE(string_agg(
      COALESCE(e.custom_ethics_text, '') || ' ' ||
      COALESCE(e.manipulation_details, '') || ' ' ||
      COALESCE(e.staging_details, '') || ' ' ||
      COALESCE(e.consent_details, '') || ' ' ||
      COALESCE(e.identity_protection_details, '') || ' ' ||
      COALESCE(e.ai_altered_details, ''),
      ' '
    ), '')
  INTO eth_text
  FROM project_ethics e WHERE e.project_id = target_project_id;

  -- Photo metadata equipment (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(pm.camera_make, '') || ' ' ||
      COALESCE(pm.camera_model, '') || ' ' ||
      COALESCE(pm.lens_model, ''),
      ' '
    ), '')
  INTO pm_text
  FROM photo_metadata pm WHERE pm.project_id = target_project_id;

  -- Context items (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(c.caption, '') || ' ' ||
      COALESCE(c.description, '') || ' ' ||
      COALESCE(c.credit, ''),
      ' '
    ), '')
  INTO ci_text
  FROM context_items c WHERE c.project_id = target_project_id;

  -- Links (weight D)
  SELECT
    COALESCE(string_agg(
      COALESCE(l.title, '') || ' ' ||
      COALESCE(l.source, ''),
      ' '
    ), '')
  INTO lk_text
  FROM links l WHERE l.project_id = target_project_id;

  -- Voice transcriptions (weight D)
  SELECT COALESCE(string_agg(COALESCE(vt.text, ''), ' '), '')
  INTO vt_text
  FROM voice_transcriptions vt WHERE vt.project_id = target_project_id;

  -- Build weighted tsvector and update
  UPDATE projects SET search_vector =
    setweight(to_tsvector('english', p_title || ' ' || p_author || ' ' || p_tags), 'A') ||
    setweight(to_tsvector('english', bs_text || ' ' || cc_copy), 'B') ||
    setweight(to_tsvector('english', pi_bio || ' ' || loc_text || ' ' || eth_text), 'C') ||
    setweight(to_tsvector('english', pm_text || ' ' || ci_text || ' ' || lk_text || ' ' || vt_text), 'D')
  WHERE id = target_project_id;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: search_all_user_chains(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer DEFAULT 50) RETURNS TABLE(note_id uuid, title text, transcript text, audio_url text, duration_seconds integer, user_id uuid, created_at timestamp with time zone, recorded_at timestamp with time zone, root_note_id uuid, depth integer, chain_order integer, match_rank real, match_snippet text, match_positions integer[], four_corners jsonb, is_shared boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_ts_query tsquery;
BEGIN
  v_ts_query := plainto_tsquery('english', p_search_query);
  
  RETURN QUERY
  SELECT 
    vn.id,
    vn.title,
    vn.transcript,
    vn.audio_url,
    vn.duration_seconds,
    vn.user_id,
    vn.created_at,
    vn.recorded_at,
    COALESCE(sc.root_note_id, vn.id) as root_note_id,
    COALESCE(sc.depth, 0) as depth,
    COALESCE(sc.chain_order, 0) as chain_order,
    ts_rank(vn.search_vector, v_ts_query) as rank,
    ts_headline('english', vn.transcript, v_ts_query,
      'MaxWords=50, MinWords=25, ShortWord=3') as snippet,
    get_match_positions(vn.transcript, p_search_query) as match_positions,
    vn.four_corners,
    vn.is_shared
  FROM voice_notes vn
  LEFT JOIN share_chains sc ON sc.child_note_id = vn.id
  WHERE 
    vn.user_id = p_user_id
    AND vn.search_vector @@ v_ts_query
  ORDER BY ts_rank(vn.search_vector, v_ts_query) DESC, vn.created_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: FUNCTION search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer) IS 'Search across all conversation chains for a user';


--
-- Name: search_conversation_chain(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid) RETURNS TABLE(note_id uuid, title text, transcript text, audio_url text, duration_seconds integer, user_id uuid, created_at timestamp with time zone, recorded_at timestamp with time zone, depth integer, chain_order integer, match_rank real, match_snippet text, match_positions integer[], four_corners jsonb, photo_metadata jsonb, device_metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_ts_query tsquery;
BEGIN
  -- Convert search query to tsquery
  v_ts_query := plainto_tsquery('english', p_search_query);
  
  RETURN QUERY
  WITH chain_notes AS (
    -- Get all notes in the chain
    SELECT 
      sc.child_note_id as note_id,
      sc.depth,
      sc.chain_order
    FROM share_chains sc
    WHERE sc.root_note_id = p_root_note_id
    
    UNION
    
    -- Include root note
    SELECT 
      p_root_note_id as note_id,
      0 as depth,
      0 as chain_order
  ),
  search_results AS (
    SELECT 
      vn.id,
      vn.title,
      vn.transcript,
      vn.audio_url,
      vn.duration_seconds,
      vn.user_id,
      vn.created_at,
      vn.recorded_at,
      cn.depth,
      cn.chain_order,
      ts_rank(vn.search_vector, v_ts_query) as rank,
      ts_headline('english', vn.transcript, v_ts_query, 
        'MaxWords=50, MinWords=25, ShortWord=3, HighlightAll=false') as snippet,
      vn.four_corners,
      vn.photo_metadata,
      vn.device_metadata
    FROM voice_notes vn
    INNER JOIN chain_notes cn ON cn.note_id = vn.id
    WHERE 
      vn.search_vector @@ v_ts_query
      AND (vn.user_id = p_user_id OR EXISTS (
        SELECT 1 FROM shared_note_access sna 
        WHERE sna.note_id = vn.id AND sna.user_id = p_user_id
      ))
  )
  SELECT 
    sr.id,
    sr.title,
    sr.transcript,
    sr.audio_url,
    sr.duration_seconds,
    sr.user_id,
    sr.created_at,
    sr.recorded_at,
    sr.depth,
    sr.chain_order,
    sr.rank,
    sr.snippet,
    get_match_positions(sr.transcript, p_search_query) as match_positions,
    sr.four_corners,
    sr.photo_metadata,
    sr.device_metadata
  FROM search_results sr
  ORDER BY sr.rank DESC, sr.chain_order ASC;
END;
$$;


--
-- Name: FUNCTION search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid) IS 'Full-text search within a specific conversation chain with ranking';


--
-- Name: search_gallery_projects(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_gallery_projects(search_query text, result_limit integer DEFAULT 24, result_offset integer DEFAULT 0) RETURNS TABLE(id uuid, slug text, title text, author text, date text, main_image_url text, main_image_storage_path text, published boolean, in_gallery boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, parent_project_id uuid, tags text[], backstory_text text, backstory_author text, backstory_publication text, backstory_date text, cc_copyright text, cc_description text, location_city text, location_state text, location_country text, location_formatted text, camera_make text, camera_model text, context_items json, links json, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT
    p.id,
    p.slug,
    p.title,
    p.author,
    p.date,
    CASE
      WHEN p.main_image_storage_path IS NOT NULL THEN NULL
      ELSE p.main_image_url
    END AS main_image_url,
    p.main_image_storage_path,
    p.published,
    p.in_gallery,
    p.created_at,
    p.updated_at,
    p.user_id,
    p.parent_project_id,
    p.tags,
    bs.text        AS backstory_text,
    bs.author      AS backstory_author,
    bs.publication AS backstory_publication,
    bs.date        AS backstory_date,
    cc.copyright   AS cc_copyright,
    cc.description AS cc_description,
    loc.city       AS location_city,
    loc.state      AS location_state,
    loc.country    AS location_country,
    loc.formatted_location AS location_formatted,
    pm.camera_make,
    pm.camera_model,
    COALESCE(ci.items, '[]'::json) AS context_items,
    COALESCE(lk.items, '[]'::json) AS links,
    ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query)) AS rank

  FROM projects p
  LEFT JOIN project_backstory bs  ON bs.project_id = p.id
  LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
  LEFT JOIN project_locations loc ON loc.project_id = p.id
  LEFT JOIN photo_metadata pm     ON pm.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
    FROM context_items c
    WHERE c.project_id = p.id
  ) ci ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
    FROM links l
    WHERE l.project_id = p.id
  ) lk ON TRUE

  WHERE p.published = TRUE
    AND p.in_gallery = TRUE
    AND p.search_vector @@ websearch_to_tsquery('english', search_query)

  ORDER BY rank DESC, p.created_at DESC
  LIMIT result_limit
  OFFSET result_offset;
$$;


--
-- Name: search_gallery_projects(text, public.vector, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_gallery_projects(search_query text, query_embedding public.vector, result_limit integer DEFAULT 24, result_offset integer DEFAULT 0) RETURNS TABLE(id uuid, slug text, title text, author text, date text, main_image_url text, main_image_storage_path text, published boolean, in_gallery boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id uuid, parent_project_id uuid, tags text[], backstory_text text, backstory_author text, backstory_publication text, backstory_date text, cc_copyright text, cc_description text, location_city text, location_state text, location_country text, location_formatted text, camera_make text, camera_model text, context_items json, links json, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
  SELECT
    p.id,
    p.slug,
    p.title,
    p.author,
    p.date,
    CASE
      WHEN p.main_image_storage_path IS NOT NULL THEN NULL
      ELSE p.main_image_url
    END AS main_image_url,
    p.main_image_storage_path,
    p.published,
    p.in_gallery,
    p.created_at,
    p.updated_at,
    p.user_id,
    p.parent_project_id,
    p.tags,
    bs.text        AS backstory_text,
    bs.author      AS backstory_author,
    bs.publication AS backstory_publication,
    bs.date        AS backstory_date,
    cc.copyright   AS cc_copyright,
    cc.description AS cc_description,
    loc.city       AS location_city,
    loc.state      AS location_state,
    loc.country    AS location_country,
    loc.formatted_location AS location_formatted,
    pm.camera_make,
    pm.camera_model,
    COALESCE(ci.items, '[]'::json) AS context_items,
    COALESCE(lk.items, '[]'::json) AS links,
    -- Hybrid score: blend tsvector rank with cosine similarity when both available
    CASE
      WHEN query_embedding IS NOT NULL AND p.search_embedding IS NOT NULL THEN
        0.7 * ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query))
        + 0.3 * (1.0 - (p.search_embedding <=> query_embedding))::real
      ELSE
        ts_rank_cd(p.search_vector, websearch_to_tsquery('english', search_query))
    END AS rank

  FROM projects p
  LEFT JOIN project_backstory bs  ON bs.project_id = p.id
  LEFT JOIN project_creative_commons cc ON cc.project_id = p.id
  LEFT JOIN project_locations loc ON loc.project_id = p.id
  LEFT JOIN photo_metadata pm     ON pm.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
    FROM context_items c
    WHERE c.project_id = p.id
  ) ci ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
    FROM links l
    WHERE l.project_id = p.id
  ) lk ON TRUE

  WHERE p.published = TRUE
    AND p.in_gallery = TRUE
    AND p.search_vector @@ websearch_to_tsquery('english', search_query)

  ORDER BY rank DESC, p.created_at DESC
  LIMIT result_limit
  OFFSET result_offset;
$$;


--
-- Name: trg_projects_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_projects_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  PERFORM rebuild_project_search_vector(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: trg_rebuild_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_rebuild_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM rebuild_project_search_vector(OLD.project_id);
    RETURN OLD;
  ELSE
    PERFORM rebuild_project_search_vector(NEW.project_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: update_persona_palettes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_persona_palettes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_voice_note_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_voice_note_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.transcript, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: validate_project_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_project_metadata() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'pg_catalog'
    AS $$
BEGIN
  -- Ensure required root fields exist
  IF NOT (NEW.metadata ? 'backStory') THEN
    RAISE EXCEPTION 'metadata must contain backStory field';
  END IF;
  
  IF NOT (NEW.metadata ? 'creativeCommons') THEN
    RAISE EXCEPTION 'metadata must contain creativeCommons field';
  END IF;
  
  IF NOT (NEW.metadata ? 'meta') THEN
    RAISE EXCEPTION 'metadata must contain meta field';
  END IF;
  
  -- Ensure arrays are arrays
  IF NEW.metadata ? 'context' AND jsonb_typeof(NEW.metadata->'context') != 'array' THEN
    RAISE EXCEPTION 'metadata.context must be an array';
  END IF;
  
  IF NEW.metadata ? 'links' AND jsonb_typeof(NEW.metadata->'links') != 'array' THEN
    RAISE EXCEPTION 'metadata.links must be an array';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: vn_update_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vn_update_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.transcript, '') || ' ' ||
    coalesce(NEW.summary, '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: vn_update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vn_update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: consent_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    filename text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: context_item_audio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_item_audio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    context_item_id uuid NOT NULL,
    voice_transcription_id uuid,
    storage_path text,
    storage_url text,
    mime_type text,
    duration numeric,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: context_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    source_type text NOT NULL,
    filename text,
    mime_type text,
    caption text,
    media_type text,
    storage_path text,
    thumbnail_storage_path text,
    url text,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    credit text,
    date text,
    linked_project_id uuid,
    linked_project_slug text,
    audio_storage_path text,
    audio_storage_url text,
    audio_mime_type text,
    audio_duration numeric,
    duration numeric,
    width integer,
    height integer,
    codec text,
    storage_url text,
    thumbnail_storage_url text,
    CONSTRAINT context_items_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT context_items_source_type_check CHECK ((source_type = ANY (ARRAY['upload'::text, 'url'::text])))
);


--
-- Name: links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.links (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    title text NOT NULL,
    url text NOT NULL,
    source text,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: photo_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    date_taken text,
    camera_make text,
    camera_model text,
    lens_model text,
    focal_length text,
    iso text,
    aperture text,
    shutter_speed text,
    width integer,
    height integer,
    orientation integer,
    software text,
    host_computer text,
    artist text,
    exif_copyright text,
    user_comment text,
    image_description text,
    temporal_data jsonb,
    gps_extended jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_backstory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_backstory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    text text,
    author text,
    publication text,
    publication_url text,
    date text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_creative_commons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_creative_commons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    copyright text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    coordinates public.geography(Point,4326),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    city text,
    state text,
    country text,
    formatted_location text,
    captured_at timestamp with time zone,
    source text,
    street text,
    street2 text,
    address_city text,
    district text,
    state_province text,
    postal_code text,
    address_country text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_locations_source_check CHECK ((source = ANY (ARRAY['exif'::text, 'device'::text, 'manual'::text, 'voicevault'::text])))
);


--
-- Name: gallery_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.gallery_feed WITH (security_invoker='true') AS
 SELECT p.id,
    p.slug,
    p.title,
    p.author,
    p.date,
        CASE
            WHEN (p.main_image_storage_path IS NOT NULL) THEN NULL::text
            ELSE p.main_image_url
        END AS main_image_url,
    p.main_image_storage_path,
    p.main_image_thumbnail_path,
    p.published,
    p.in_gallery,
    p.created_at,
    p.updated_at,
    p.user_id,
    p.parent_project_id,
    p.tags,
    bs.text AS backstory_text,
    bs.author AS backstory_author,
    bs.publication AS backstory_publication,
    bs.date AS backstory_date,
    cc.copyright AS cc_copyright,
    cc.description AS cc_description,
    loc.city AS location_city,
    loc.state AS location_state,
    loc.country AS location_country,
    loc.formatted_location AS location_formatted,
    pm.camera_make,
    pm.camera_model,
    COALESCE(ci.items, '[]'::json) AS context_items,
    COALESCE(lk.items, '[]'::json) AS links
   FROM ((((((public.projects p
     LEFT JOIN public.project_backstory bs ON ((bs.project_id = p.id)))
     LEFT JOIN public.project_creative_commons cc ON ((cc.project_id = p.id)))
     LEFT JOIN public.project_locations loc ON ((loc.project_id = p.id)))
     LEFT JOIN public.photo_metadata pm ON ((pm.project_id = p.id)))
     LEFT JOIN LATERAL ( SELECT json_agg(json_build_object('id', c.id, 'caption', c.caption)) AS items
           FROM public.context_items c
          WHERE (c.project_id = p.id)) ci ON (true))
     LEFT JOIN LATERAL ( SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) AS items
           FROM public.links l
          WHERE (l.project_id = p.id)) lk ON (true))
  WHERE ((p.published = true) AND (p.in_gallery = true));


--
-- Name: issue_report_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_report_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    author_user_id uuid,
    author_kind text NOT NULL,
    kind text NOT NULL,
    body text,
    changes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_report_events_author_kind_check CHECK ((author_kind = ANY (ARRAY['reporter'::text, 'admin'::text]))),
    CONSTRAINT issue_report_events_kind_check CHECK ((kind = ANY (ARRAY['comment'::text, 'status'::text, 'assignment'::text, 'priority'::text, 'resolution'::text, 'edit'::text])))
);


--
-- Name: issue_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    type text DEFAULT 'bug'::text NOT NULL,
    severity smallint DEFAULT 3 NOT NULL,
    title text,
    description text NOT NULL,
    steps text,
    reporter_user_id uuid,
    reporter_email public.citext,
    url text,
    route text,
    referrer text,
    app_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    device jsonb DEFAULT '{}'::jsonb NOT NULL,
    build jsonb DEFAULT '{}'::jsonb NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_agent text,
    screenshot_path text,
    consent_screenshot boolean DEFAULT true NOT NULL,
    consent_diagnostics boolean DEFAULT true NOT NULL,
    assignee uuid,
    priority smallint,
    resolution text,
    resolved_at timestamp with time zone,
    reviewed_by uuid,
    captured_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    extra text,
    CONSTRAINT issue_reports_severity_check CHECK (((severity >= 1) AND (severity <= 5))),
    CONSTRAINT issue_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'triaged'::text, 'in_progress'::text, 'resolved'::text, 'wont_fix'::text, 'duplicate'::text]))),
    CONSTRAINT issue_reports_type_check CHECK ((type = ANY (ARRAY['bug'::text, 'visual'::text, 'data'::text, 'performance'::text, 'feature'::text, 'other'::text])))
);


--
-- Name: COLUMN issue_reports.extra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issue_reports.extra IS 'Reporter-supplied link or extra info ("Add a link or anything else?").';


--
-- Name: maintenance_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    config jsonb NOT NULL,
    is_preset boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: note_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    recipient_email text NOT NULL,
    recipient_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    rejected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_phone text,
    auto_created_account boolean DEFAULT false,
    sms_sent_at timestamp with time zone,
    sms_message_id text,
    CONSTRAINT note_shares_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: TABLE note_shares; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.note_shares IS 'Tracks voice note shares via SMS or email with auto-account creation';


--
-- Name: page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_views (
    id bigint NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    session_id text,
    path text NOT NULL,
    route text,
    referrer text,
    referrer_host text,
    user_agent text,
    browser text,
    os text,
    device_type text,
    country text,
    city text,
    region text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    deployment_id text,
    vercel_env text
);


--
-- Name: page_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.page_views ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.page_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: persona_palettes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_palettes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    dark_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    light_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    created_by uuid
);


--
-- Name: voice_transcriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_transcriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid,
    recording_id text NOT NULL,
    text text NOT NULL,
    transcribed_at timestamp with time zone DEFAULT now(),
    audio_storage_path text,
    created_at timestamp with time zone DEFAULT now(),
    field_id text,
    audio_storage_url text,
    mime_type text,
    duration numeric,
    context_item_id uuid,
    "position" integer DEFAULT 0 NOT NULL
);


--
-- Name: platform_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.platform_stats AS
 SELECT ( SELECT count(DISTINCT projects.user_id) AS count
           FROM public.projects) AS total_users,
    ( SELECT count(*) AS count
           FROM public.projects) AS total_projects,
    ( SELECT count(*) AS count
           FROM public.projects
          WHERE (projects.published = true)) AS total_published,
    ( SELECT count(*) AS count
           FROM public.projects
          WHERE ((projects.published = true) AND (projects.in_gallery = true))) AS total_gallery,
    ( SELECT count(*) AS count
           FROM public.projects
          WHERE (projects.published = false)) AS total_private,
    ( SELECT count(*) AS count
           FROM public.context_items) AS total_context_items,
    ( SELECT count(DISTINCT context_items.project_id) AS count
           FROM public.context_items) AS projects_with_context,
    ( SELECT count(*) AS count
           FROM public.voice_transcriptions) AS total_transcriptions,
    now() AS refreshed_at
  WITH NO DATA;


--
-- Name: project_ethics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_ethics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    custom_ethics_text text,
    no_manipulation boolean DEFAULT false NOT NULL,
    manipulation_details text,
    no_staging boolean DEFAULT false NOT NULL,
    staging_details text,
    informed_consent boolean DEFAULT false NOT NULL,
    consent_details text,
    identity_protected boolean DEFAULT false NOT NULL,
    identity_protection_details text,
    consent_document_url text,
    ai_altered boolean DEFAULT false,
    ai_altered_details text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_photographer_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_photographer_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    bio text,
    contact text,
    website text,
    collaborators text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rate_limit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_log (
    id bigint NOT NULL,
    identifier text NOT NULL,
    tier text NOT NULL,
    endpoint text NOT NULL,
    method text DEFAULT 'GET'::text NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rate_limit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: share_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    root_note_id uuid NOT NULL,
    parent_note_id uuid,
    child_note_id uuid NOT NULL,
    depth integer DEFAULT 0 NOT NULL,
    chain_order integer NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shared_note_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_note_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    access_type text DEFAULT 'view'::text NOT NULL,
    can_reshare boolean DEFAULT false NOT NULL,
    added_via_share_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_note_access_access_type_check CHECK ((access_type = ANY (ARRAY['view'::text, 'reply'::text, 'owner'::text])))
);


--
-- Name: sms_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_id uuid,
    recipient_phone text NOT NULL,
    message_body text NOT NULL,
    sms_provider text,
    sms_status text,
    sms_error text,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone
);


--
-- Name: TABLE sms_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_notifications IS 'Logs SMS notifications sent for share invitations';


--
-- Name: spatial_ref_sys_readonly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.spatial_ref_sys_readonly WITH (security_invoker='on') AS
 SELECT srid,
    auth_name,
    auth_srid,
    srtext,
    proj4text
   FROM public.spatial_ref_sys;


--
-- Name: speed_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speed_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_type text NOT NULL,
    value double precision NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    path text,
    route text,
    origin text,
    device_type text,
    device_id bigint,
    os_name text,
    os_version text,
    client_name text,
    client_version text,
    connection_speed text,
    country text,
    region text,
    city text,
    deployment_id text,
    vercel_env text,
    attribution text,
    created_at timestamp with time zone DEFAULT now(),
    project_id_vercel text,
    owner_id text,
    device_brand text,
    client_type text,
    browser_engine text,
    browser_engine_version text,
    script_version text,
    sdk_version text,
    sdk_name text,
    vercel_url text,
    browser text,
    os text
);


--
-- Name: user_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    media_type text NOT NULL,
    mime_type text NOT NULL,
    file_name text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    storage_url text NOT NULL,
    thumbnail_storage_path text,
    thumbnail_storage_url text,
    file_size bigint,
    width integer,
    height integer,
    duration numeric,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_assets_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'document'::text])))
);


--
-- Name: user_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    full_name text NOT NULL,
    organization text,
    status text DEFAULT 'pending'::text NOT NULL,
    invite_token text,
    token_expires_at timestamp with time zone,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    created_by uuid,
    accepted_user_id uuid,
    notes text,
    reviewed_by_name text,
    CONSTRAINT user_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- Name: user_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_plans (
    user_id uuid NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    custom_limit_bytes bigint,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_plans_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text, 'team'::text, 'unlimited'::text])))
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    palette_slug text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    organization text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'moderator'::public.app_role NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    feedback_mode text DEFAULT 'guide'::text NOT NULL,
    voice_feedback_enabled boolean DEFAULT true NOT NULL,
    haptic_feedback_enabled boolean DEFAULT true NOT NULL,
    selected_voice_id text,
    max_recording_seconds integer DEFAULT 120 NOT NULL,
    audio_quality text DEFAULT 'high'::text NOT NULL,
    auto_sync_enabled boolean DEFAULT true NOT NULL,
    hints_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_settings_audio_quality_check CHECK ((audio_quality = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT user_settings_feedback_mode_check CHECK ((feedback_mode = ANY (ARRAY['focus'::text, 'guide'::text])))
);


--
-- Name: vn_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT '📁'::text,
    color text DEFAULT '#2dd4bf'::text,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: vn_note_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_note_folders (
    note_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vn_note_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_note_tags (
    note_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vn_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#2dd4bf'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vn_transcription_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_transcription_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    text text NOT NULL,
    start_time numeric(10,3) NOT NULL,
    end_time numeric(10,3) NOT NULL,
    confidence numeric(3,2),
    speaker_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vn_user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    audio_quality text DEFAULT 'high'::text,
    max_recording_seconds integer DEFAULT 300,
    auto_transcribe boolean DEFAULT true,
    theme text DEFAULT 'system'::text,
    haptic_feedback boolean DEFAULT true,
    transcription_notifications boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT vn_user_settings_audio_quality_check CHECK ((audio_quality = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT vn_user_settings_theme_check CHECK ((theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])))
);


--
-- Name: vn_voice_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vn_voice_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    transcript text,
    summary text,
    audio_url text,
    duration_seconds integer DEFAULT 0,
    audio_format text DEFAULT 'webm'::text,
    file_size_bytes integer,
    device_metadata jsonb DEFAULT '{}'::jsonb,
    location jsonb DEFAULT '{}'::jsonb,
    ai_status text DEFAULT 'pending'::text,
    ai_model text,
    ai_confidence numeric(3,2),
    search_vector tsvector,
    recorded_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT vn_voice_notes_ai_status_check CHECK ((ai_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: voice_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text,
    transcript text,
    audio_url text,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_shared boolean DEFAULT false,
    share_chain_id uuid,
    original_note_id uuid,
    shared_from_user_id uuid,
    ai_model text DEFAULT 'whisper-1'::text,
    ai_status text DEFAULT 'pending'::text,
    ai_confidence numeric,
    tags text[] DEFAULT '{}'::text[],
    project_id text,
    exported_to_four_corners boolean DEFAULT false,
    four_corners_export_url text,
    workflow_type text,
    device_metadata jsonb DEFAULT '{}'::jsonb,
    photo_metadata jsonb DEFAULT '{}'::jsonb,
    four_corners jsonb DEFAULT '{}'::jsonb,
    location jsonb,
    recorded_at timestamp with time zone DEFAULT now(),
    summary text,
    search_vector tsvector,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT voice_notes_ai_status_check CHECK ((ai_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT voice_notes_workflow_type_check CHECK ((workflow_type = ANY (ARRAY['assignment'::text, 'feature'::text, 'film'::text, 'commercial'::text])))
);


--
-- Name: COLUMN voice_notes.ai_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.ai_model IS 'AI model used for transcription (e.g., whisper-1, gpt-4o-mini)';


--
-- Name: COLUMN voice_notes.ai_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.ai_status IS 'Status of AI processing: pending, processing, completed, failed';


--
-- Name: COLUMN voice_notes.ai_confidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.ai_confidence IS 'Confidence score of AI analysis (0-1)';


--
-- Name: COLUMN voice_notes.device_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.device_metadata IS 'Device information captured during recording (device type, OS, browser, etc.)';


--
-- Name: COLUMN voice_notes.photo_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.photo_metadata IS 'Photo metadata if captured with the note';


--
-- Name: COLUMN voice_notes.four_corners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.four_corners IS 'Four Corners workflow metadata for film/journalism projects';


--
-- Name: COLUMN voice_notes.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.location IS 'GPS coordinates where the note was recorded';


--
-- Name: COLUMN voice_notes.recorded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.voice_notes.recorded_at IS 'Timestamp when the recording started';


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: consent_documents consent_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_documents
    ADD CONSTRAINT consent_documents_pkey PRIMARY KEY (id);


--
-- Name: context_item_audio context_item_audio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_item_audio
    ADD CONSTRAINT context_item_audio_pkey PRIMARY KEY (id);


--
-- Name: context_items context_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_items
    ADD CONSTRAINT context_items_pkey PRIMARY KEY (id);


--
-- Name: issue_report_events issue_report_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_report_events
    ADD CONSTRAINT issue_report_events_pkey PRIMARY KEY (id);


--
-- Name: issue_reports issue_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_pkey PRIMARY KEY (id);


--
-- Name: links links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);


--
-- Name: maintenance_banners maintenance_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_banners
    ADD CONSTRAINT maintenance_banners_pkey PRIMARY KEY (id);


--
-- Name: maintenance_banners maintenance_banners_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_banners
    ADD CONSTRAINT maintenance_banners_slug_key UNIQUE (slug);


--
-- Name: note_shares note_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_shares
    ADD CONSTRAINT note_shares_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);


--
-- Name: persona_palettes persona_palettes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_palettes
    ADD CONSTRAINT persona_palettes_pkey PRIMARY KEY (id);


--
-- Name: persona_palettes persona_palettes_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_palettes
    ADD CONSTRAINT persona_palettes_slug_key UNIQUE (slug);


--
-- Name: photo_metadata photo_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_metadata
    ADD CONSTRAINT photo_metadata_pkey PRIMARY KEY (id);


--
-- Name: photo_metadata photo_metadata_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_metadata
    ADD CONSTRAINT photo_metadata_project_id_key UNIQUE (project_id);


--
-- Name: project_backstory project_backstory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_backstory
    ADD CONSTRAINT project_backstory_pkey PRIMARY KEY (id);


--
-- Name: project_backstory project_backstory_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_backstory
    ADD CONSTRAINT project_backstory_project_id_key UNIQUE (project_id);


--
-- Name: project_creative_commons project_creative_commons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_creative_commons
    ADD CONSTRAINT project_creative_commons_pkey PRIMARY KEY (id);


--
-- Name: project_creative_commons project_creative_commons_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_creative_commons
    ADD CONSTRAINT project_creative_commons_project_id_key UNIQUE (project_id);


--
-- Name: project_ethics project_ethics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_ethics
    ADD CONSTRAINT project_ethics_pkey PRIMARY KEY (id);


--
-- Name: project_ethics project_ethics_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_ethics
    ADD CONSTRAINT project_ethics_project_id_key UNIQUE (project_id);


--
-- Name: project_locations project_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_locations
    ADD CONSTRAINT project_locations_pkey PRIMARY KEY (id);


--
-- Name: project_locations project_locations_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_locations
    ADD CONSTRAINT project_locations_project_id_key UNIQUE (project_id);


--
-- Name: project_photographer_info project_photographer_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_photographer_info
    ADD CONSTRAINT project_photographer_info_pkey PRIMARY KEY (id);


--
-- Name: project_photographer_info project_photographer_info_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_photographer_info
    ADD CONSTRAINT project_photographer_info_project_id_key UNIQUE (project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_slug_key UNIQUE (slug);


--
-- Name: rate_limit_log rate_limit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_log
    ADD CONSTRAINT rate_limit_log_pkey PRIMARY KEY (id);


--
-- Name: share_chains share_chains_child_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_child_note_id_key UNIQUE (child_note_id);


--
-- Name: share_chains share_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_pkey PRIMARY KEY (id);


--
-- Name: shared_note_access shared_note_access_note_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_access
    ADD CONSTRAINT shared_note_access_note_id_user_id_key UNIQUE (note_id, user_id);


--
-- Name: shared_note_access shared_note_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_access
    ADD CONSTRAINT shared_note_access_pkey PRIMARY KEY (id);


--
-- Name: sms_notifications sms_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_notifications
    ADD CONSTRAINT sms_notifications_pkey PRIMARY KEY (id);


--
-- Name: speed_insights speed_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speed_insights
    ADD CONSTRAINT speed_insights_pkey PRIMARY KEY (id);


--
-- Name: user_assets user_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_pkey PRIMARY KEY (id);


--
-- Name: user_assets user_assets_user_id_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_user_id_storage_path_key UNIQUE (user_id, storage_path);


--
-- Name: user_invites user_invites_invite_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_invite_token_key UNIQUE (invite_token);


--
-- Name: user_invites user_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_pkey PRIMARY KEY (id);


--
-- Name: user_plans user_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_plans
    ADD CONSTRAINT user_plans_pkey PRIMARY KEY (user_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);


--
-- Name: vn_folders vn_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_folders
    ADD CONSTRAINT vn_folders_pkey PRIMARY KEY (id);


--
-- Name: vn_note_folders vn_note_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_folders
    ADD CONSTRAINT vn_note_folders_pkey PRIMARY KEY (note_id, folder_id);


--
-- Name: vn_note_tags vn_note_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_tags
    ADD CONSTRAINT vn_note_tags_pkey PRIMARY KEY (note_id, tag_id);


--
-- Name: vn_tags vn_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_tags
    ADD CONSTRAINT vn_tags_pkey PRIMARY KEY (id);


--
-- Name: vn_tags vn_tags_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_tags
    ADD CONSTRAINT vn_tags_user_id_name_key UNIQUE (user_id, name);


--
-- Name: vn_transcription_segments vn_transcription_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_transcription_segments
    ADD CONSTRAINT vn_transcription_segments_pkey PRIMARY KEY (id);


--
-- Name: vn_user_settings vn_user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_user_settings
    ADD CONSTRAINT vn_user_settings_pkey PRIMARY KEY (id);


--
-- Name: vn_user_settings vn_user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_user_settings
    ADD CONSTRAINT vn_user_settings_user_id_key UNIQUE (user_id);


--
-- Name: vn_voice_notes vn_voice_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_voice_notes
    ADD CONSTRAINT vn_voice_notes_pkey PRIMARY KEY (id);


--
-- Name: voice_notes voice_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_notes
    ADD CONSTRAINT voice_notes_pkey PRIMARY KEY (id);


--
-- Name: voice_transcriptions voice_transcriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_transcriptions
    ADD CONSTRAINT voice_transcriptions_pkey PRIMARY KEY (id);


--
-- Name: idx_consent_documents_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_documents_project_id ON public.consent_documents USING btree (project_id);


--
-- Name: idx_context_item_audio_context_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_item_audio_context_item_id ON public.context_item_audio USING btree (context_item_id);


--
-- Name: idx_context_item_audio_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_item_audio_position ON public.context_item_audio USING btree (context_item_id, "position");


--
-- Name: idx_context_item_audio_transcription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_item_audio_transcription_id ON public.context_item_audio USING btree (voice_transcription_id);


--
-- Name: idx_context_items_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_items_position ON public.context_items USING btree (project_id, "position");


--
-- Name: idx_context_items_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_items_project ON public.context_items USING btree (project_id);


--
-- Name: idx_context_items_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_context_items_project_id ON public.context_items USING btree (project_id);


--
-- Name: idx_links_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_position ON public.links USING btree (project_id, "position");


--
-- Name: idx_links_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_project ON public.links USING btree (project_id);


--
-- Name: idx_links_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_project_id ON public.links USING btree (project_id);


--
-- Name: idx_note_shares_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_shares_note ON public.note_shares USING btree (note_id);


--
-- Name: idx_note_shares_note_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_shares_note_status ON public.note_shares USING btree (note_id, status);


--
-- Name: idx_note_shares_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_shares_phone ON public.note_shares USING btree (recipient_phone) WHERE (recipient_phone IS NOT NULL);


--
-- Name: idx_note_shares_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_shares_recipient ON public.note_shares USING btree (recipient_email, status);


--
-- Name: idx_note_shares_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_shares_sender ON public.note_shares USING btree (sender_id, created_at DESC);


--
-- Name: idx_note_shares_unique_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_note_shares_unique_recipient ON public.note_shares USING btree (note_id, COALESCE(recipient_email, ''::text), COALESCE(recipient_phone, ''::text), status) WHERE (status = 'pending'::text);


--
-- Name: idx_persona_palettes_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persona_palettes_created_by ON public.persona_palettes USING btree (created_by);


--
-- Name: idx_photo_metadata_camera; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_metadata_camera ON public.photo_metadata USING btree (camera_make, camera_model);


--
-- Name: idx_photo_metadata_lens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_metadata_lens ON public.photo_metadata USING btree (lens_model);


--
-- Name: idx_photo_metadata_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_metadata_project ON public.photo_metadata USING btree (project_id);


--
-- Name: idx_photo_metadata_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_metadata_project_id ON public.photo_metadata USING btree (project_id);


--
-- Name: idx_project_backstory_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_backstory_project_id ON public.project_backstory USING btree (project_id);


--
-- Name: idx_project_creative_commons_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_creative_commons_project_id ON public.project_creative_commons USING btree (project_id);


--
-- Name: idx_project_ethics_ai_altered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_ethics_ai_altered ON public.project_ethics USING btree (ai_altered) WHERE (ai_altered = true);


--
-- Name: idx_project_ethics_consent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_ethics_consent ON public.project_ethics USING btree (informed_consent) WHERE (informed_consent = true);


--
-- Name: idx_project_ethics_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_ethics_project_id ON public.project_ethics USING btree (project_id);


--
-- Name: idx_project_locations_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_locations_city ON public.project_locations USING btree (city);


--
-- Name: idx_project_locations_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_locations_coordinates ON public.project_locations USING gist (coordinates);


--
-- Name: idx_project_locations_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_locations_country ON public.project_locations USING btree (country);


--
-- Name: idx_project_locations_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_locations_project_id ON public.project_locations USING btree (project_id);


--
-- Name: idx_project_photographer_info_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_photographer_info_project_id ON public.project_photographer_info USING btree (project_id);


--
-- Name: idx_projects_backstory_text; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_backstory_text ON public.projects USING gin ((((metadata -> 'backStory'::text) -> 'text'::text)));


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at DESC);


--
-- Name: idx_projects_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_date ON public.projects USING btree (date DESC);


--
-- Name: idx_projects_forked_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_forked_from ON public.projects USING btree (forked_from_user_id);


--
-- Name: idx_projects_in_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_in_gallery ON public.projects USING btree (in_gallery) WHERE (in_gallery = true);


--
-- Name: idx_projects_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_location ON public.projects USING gin (((metadata -> 'location'::text)));


--
-- Name: idx_projects_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_metadata ON public.projects USING gin (metadata);


--
-- Name: idx_projects_parent_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_parent_gallery ON public.projects USING btree (parent_project_id, in_gallery) WHERE (parent_project_id IS NOT NULL);


--
-- Name: idx_projects_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_parent_id ON public.projects USING btree (parent_project_id);


--
-- Name: idx_projects_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_published ON public.projects USING btree (published);


--
-- Name: idx_projects_published_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_published_gallery ON public.projects USING btree (published, in_gallery, created_at DESC) WHERE ((published = true) AND (in_gallery = true));


--
-- Name: idx_projects_search_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_search_embedding ON public.projects USING hnsw (search_embedding public.vector_cosine_ops);


--
-- Name: idx_projects_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_search_vector ON public.projects USING gin (search_vector);


--
-- Name: idx_projects_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_slug ON public.projects USING btree (slug);


--
-- Name: idx_projects_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_tags ON public.projects USING gin (tags);


--
-- Name: idx_projects_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_user_created ON public.projects USING btree (user_id, created_at DESC);


--
-- Name: idx_projects_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_user_id ON public.projects USING btree (user_id);


--
-- Name: idx_pv_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_country ON public.page_views USING btree (country) WHERE (country IS NOT NULL);


--
-- Name: idx_pv_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_path ON public.page_views USING btree (path, "timestamp" DESC);


--
-- Name: idx_pv_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_referrer ON public.page_views USING btree (referrer_host) WHERE (referrer_host IS NOT NULL);


--
-- Name: idx_pv_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_session ON public.page_views USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_pv_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_timestamp ON public.page_views USING btree ("timestamp" DESC);


--
-- Name: idx_rl_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rl_check ON public.rate_limit_log USING btree (identifier, tier, created_at DESC);


--
-- Name: idx_rl_dashboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rl_dashboard ON public.rate_limit_log USING btree (created_at DESC, tier, blocked);


--
-- Name: idx_share_chains_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_chains_parent ON public.share_chains USING btree (parent_note_id);


--
-- Name: idx_share_chains_parent_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_chains_parent_child ON public.share_chains USING btree (parent_note_id, child_note_id);


--
-- Name: idx_share_chains_root; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_chains_root ON public.share_chains USING btree (root_note_id, chain_order);


--
-- Name: idx_shared_access_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_access_note ON public.shared_note_access USING btree (note_id, user_id);


--
-- Name: idx_shared_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_access_user ON public.shared_note_access USING btree (user_id, note_id);


--
-- Name: idx_si_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_city ON public.speed_insights USING btree (city) WHERE (city IS NOT NULL);


--
-- Name: idx_si_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_country ON public.speed_insights USING btree (country) WHERE (country IS NOT NULL);


--
-- Name: idx_sms_notifications_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_notifications_phone ON public.sms_notifications USING btree (recipient_phone);


--
-- Name: idx_sms_notifications_share; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_notifications_share ON public.sms_notifications USING btree (share_id);


--
-- Name: idx_speed_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_composite ON public.speed_insights USING btree (metric_type, path, "timestamp");


--
-- Name: idx_speed_device_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_device_type ON public.speed_insights USING btree (device_type);


--
-- Name: idx_speed_insights_metric_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_insights_metric_time ON public.speed_insights USING btree (metric_type, "timestamp" DESC);


--
-- Name: idx_speed_insights_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_insights_path ON public.speed_insights USING btree (path, "timestamp" DESC);


--
-- Name: idx_speed_metric_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_metric_type ON public.speed_insights USING btree (metric_type);


--
-- Name: idx_speed_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_path ON public.speed_insights USING btree (path);


--
-- Name: idx_speed_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speed_timestamp ON public.speed_insights USING btree ("timestamp");


--
-- Name: idx_user_assets_file_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_assets_file_name_trgm ON public.user_assets USING gin (file_name public.gin_trgm_ops);


--
-- Name: idx_user_assets_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_assets_user_created ON public.user_assets USING btree (user_id, created_at DESC);


--
-- Name: idx_user_assets_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_assets_user_type ON public.user_assets USING btree (user_id, media_type);


--
-- Name: idx_user_plans_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_plans_plan ON public.user_plans USING btree (plan);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_user_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_settings_user_id ON public.user_settings USING btree (user_id);


--
-- Name: idx_vn_segments_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vn_segments_note_id ON public.vn_transcription_segments USING btree (note_id);


--
-- Name: idx_vn_segments_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vn_segments_time ON public.vn_transcription_segments USING btree (note_id, start_time);


--
-- Name: idx_vn_voice_notes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vn_voice_notes_created_at ON public.vn_voice_notes USING btree (user_id, created_at DESC);


--
-- Name: idx_vn_voice_notes_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vn_voice_notes_search ON public.vn_voice_notes USING gin (search_vector);


--
-- Name: idx_vn_voice_notes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vn_voice_notes_user_id ON public.vn_voice_notes USING btree (user_id);


--
-- Name: idx_voice_notes_ai_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_ai_status ON public.voice_notes USING btree (ai_status);


--
-- Name: idx_voice_notes_chain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_chain ON public.voice_notes USING btree (share_chain_id);


--
-- Name: idx_voice_notes_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_location ON public.voice_notes USING gin (location);


--
-- Name: idx_voice_notes_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_search_vector ON public.voice_notes USING gin (search_vector);


--
-- Name: idx_voice_notes_shared; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_shared ON public.voice_notes USING btree (is_shared, user_id);


--
-- Name: idx_voice_notes_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_tags ON public.voice_notes USING gin (tags);


--
-- Name: idx_voice_notes_transcript_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_transcript_gin ON public.voice_notes USING gin (to_tsvector('english'::regconfig, transcript));


--
-- Name: idx_voice_notes_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_user_created ON public.voice_notes USING btree (user_id, created_at DESC);


--
-- Name: idx_voice_transcriptions_context_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_transcriptions_context_item_id ON public.voice_transcriptions USING btree (context_item_id);


--
-- Name: idx_voice_transcriptions_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_transcriptions_project_id ON public.voice_transcriptions USING btree (project_id);


--
-- Name: issue_report_events_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_report_events_report_idx ON public.issue_report_events USING btree (report_id, created_at);


--
-- Name: issue_reports_app_state_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_reports_app_state_gin ON public.issue_reports USING gin (app_state);


--
-- Name: issue_reports_diagnostics_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_reports_diagnostics_gin ON public.issue_reports USING gin (diagnostics);


--
-- Name: issue_reports_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_reports_reporter_idx ON public.issue_reports USING btree (reporter_user_id);


--
-- Name: issue_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_reports_status_idx ON public.issue_reports USING btree (status, created_at DESC);


--
-- Name: issue_reports_type_sev_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX issue_reports_type_sev_idx ON public.issue_reports USING btree (type, severity);


--
-- Name: persona_palettes_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX persona_palettes_global_unique ON public.persona_palettes USING btree (is_global) WHERE (is_global = true);


--
-- Name: platform_stats_refreshed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_stats_refreshed_at_idx ON public.platform_stats USING btree (refreshed_at);


--
-- Name: uq_note_pending_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_note_pending_recipient ON public.note_shares USING btree (note_id, recipient_email) WHERE (status = 'pending'::text);


--
-- Name: user_invites_email_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_invites_email_active ON public.user_invites USING btree (lower((email)::text)) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text, 'accepted'::text]));


--
-- Name: user_invites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_invites_status ON public.user_invites USING btree (status);


--
-- Name: user_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_invites_token ON public.user_invites USING btree (invite_token) WHERE (invite_token IS NOT NULL);


--
-- Name: persona_palettes persona_palettes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER persona_palettes_updated_at BEFORE UPDATE ON public.persona_palettes FOR EACH ROW EXECUTE FUNCTION public.update_persona_palettes_updated_at();


--
-- Name: projects projects_author_autofill_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_author_autofill_trg BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_author_autofill();


--
-- Name: projects projects_title_autofill_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_title_autofill_trg BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_title_autofill();


--
-- Name: project_backstory search_vector_on_backstory; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_backstory AFTER INSERT OR DELETE OR UPDATE ON public.project_backstory FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: context_items search_vector_on_context_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_context_items AFTER INSERT OR DELETE OR UPDATE ON public.context_items FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: project_creative_commons search_vector_on_creative_commons; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_creative_commons AFTER INSERT OR DELETE OR UPDATE ON public.project_creative_commons FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: project_ethics search_vector_on_ethics; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_ethics AFTER INSERT OR DELETE OR UPDATE ON public.project_ethics FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: links search_vector_on_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_links AFTER INSERT OR DELETE OR UPDATE ON public.links FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: project_locations search_vector_on_locations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_locations AFTER INSERT OR DELETE OR UPDATE ON public.project_locations FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: photo_metadata search_vector_on_photo_metadata; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_photo_metadata AFTER INSERT OR DELETE OR UPDATE ON public.photo_metadata FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: project_photographer_info search_vector_on_photographer_info; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_photographer_info AFTER INSERT OR DELETE OR UPDATE ON public.project_photographer_info FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: projects search_vector_on_projects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_projects AFTER UPDATE OF title, author, tags ON public.projects FOR EACH ROW EXECUTE FUNCTION public.trg_projects_search_vector();


--
-- Name: voice_transcriptions search_vector_on_voice_transcriptions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_vector_on_voice_transcriptions AFTER INSERT OR DELETE OR UPDATE ON public.voice_transcriptions FOR EACH ROW EXECUTE FUNCTION public.trg_rebuild_search_vector();


--
-- Name: project_locations trg_project_locations_set_coordinates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_locations_set_coordinates BEFORE INSERT OR UPDATE OF latitude, longitude ON public.project_locations FOR EACH ROW EXECUTE FUNCTION public.project_locations_set_coordinates();


--
-- Name: note_shares trigger_expire_shares; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_expire_shares AFTER INSERT OR UPDATE ON public.note_shares FOR EACH STATEMENT EXECUTE FUNCTION public.expire_old_shares();


--
-- Name: voice_notes trigger_voice_note_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_voice_note_search_vector BEFORE INSERT OR UPDATE OF title, transcript, summary ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.update_voice_note_search_vector();


--
-- Name: context_item_audio update_context_item_audio_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_context_item_audio_updated_at BEFORE UPDATE ON public.context_item_audio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: context_items update_context_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_context_items_updated_at BEFORE UPDATE ON public.context_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: issue_reports update_issue_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_issue_reports_updated_at BEFORE UPDATE ON public.issue_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: photo_metadata update_photo_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_photo_metadata_updated_at BEFORE UPDATE ON public.photo_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_backstory update_project_backstory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_backstory_updated_at BEFORE UPDATE ON public.project_backstory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_creative_commons update_project_creative_commons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_creative_commons_updated_at BEFORE UPDATE ON public.project_creative_commons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_ethics update_project_ethics_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_ethics_updated_at BEFORE UPDATE ON public.project_ethics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_locations update_project_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_locations_updated_at BEFORE UPDATE ON public.project_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_photographer_info update_project_photographer_info_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_photographer_info_updated_at BEFORE UPDATE ON public.project_photographer_info FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_plans update_user_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_plans_updated_at BEFORE UPDATE ON public.user_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_profiles update_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_settings update_user_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: voice_notes update_voice_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_voice_notes_updated_at BEFORE UPDATE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects validate_metadata_before_insert_or_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_metadata_before_insert_or_update BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.validate_project_metadata();


--
-- Name: vn_folders vn_update_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vn_update_folders_updated_at BEFORE UPDATE ON public.vn_folders FOR EACH ROW EXECUTE FUNCTION public.vn_update_updated_at_column();


--
-- Name: vn_user_settings vn_update_user_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vn_update_user_settings_updated_at BEFORE UPDATE ON public.vn_user_settings FOR EACH ROW EXECUTE FUNCTION public.vn_update_updated_at_column();


--
-- Name: vn_voice_notes vn_update_voice_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vn_update_voice_notes_updated_at BEFORE UPDATE ON public.vn_voice_notes FOR EACH ROW EXECUTE FUNCTION public.vn_update_updated_at_column();


--
-- Name: vn_voice_notes vn_voice_notes_search_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vn_voice_notes_search_update BEFORE INSERT OR UPDATE OF title, transcript, summary ON public.vn_voice_notes FOR EACH ROW EXECUTE FUNCTION public.vn_update_search_vector();


--
-- Name: consent_documents consent_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_documents
    ADD CONSTRAINT consent_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: context_item_audio context_item_audio_context_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_item_audio
    ADD CONSTRAINT context_item_audio_context_item_id_fkey FOREIGN KEY (context_item_id) REFERENCES public.context_items(id) ON DELETE CASCADE;


--
-- Name: context_item_audio context_item_audio_voice_transcription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_item_audio
    ADD CONSTRAINT context_item_audio_voice_transcription_id_fkey FOREIGN KEY (voice_transcription_id) REFERENCES public.voice_transcriptions(id) ON DELETE SET NULL;


--
-- Name: context_items context_items_linked_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_items
    ADD CONSTRAINT context_items_linked_project_id_fkey FOREIGN KEY (linked_project_id) REFERENCES public.projects(id);


--
-- Name: context_items context_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_items
    ADD CONSTRAINT context_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: issue_report_events issue_report_events_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_report_events
    ADD CONSTRAINT issue_report_events_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: issue_report_events issue_report_events_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_report_events
    ADD CONSTRAINT issue_report_events_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.issue_reports(id) ON DELETE CASCADE;


--
-- Name: issue_reports issue_reports_assignee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_assignee_fkey FOREIGN KEY (assignee) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: issue_reports issue_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: issue_reports issue_reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: links links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: maintenance_banners maintenance_banners_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_banners
    ADD CONSTRAINT maintenance_banners_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: note_shares note_shares_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_shares
    ADD CONSTRAINT note_shares_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.voice_notes(id) ON DELETE CASCADE;


--
-- Name: note_shares note_shares_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_shares
    ADD CONSTRAINT note_shares_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: note_shares note_shares_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_shares
    ADD CONSTRAINT note_shares_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: persona_palettes persona_palettes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_palettes
    ADD CONSTRAINT persona_palettes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: photo_metadata photo_metadata_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_metadata
    ADD CONSTRAINT photo_metadata_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_backstory project_backstory_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_backstory
    ADD CONSTRAINT project_backstory_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_creative_commons project_creative_commons_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_creative_commons
    ADD CONSTRAINT project_creative_commons_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_ethics project_ethics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_ethics
    ADD CONSTRAINT project_ethics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_locations project_locations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_locations
    ADD CONSTRAINT project_locations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_photographer_info project_photographer_info_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_photographer_info
    ADD CONSTRAINT project_photographer_info_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_forked_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_forked_from_user_id_fkey FOREIGN KEY (forked_from_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_parent_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_parent_project_id_fkey FOREIGN KEY (parent_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: share_chains share_chains_child_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_child_note_id_fkey FOREIGN KEY (child_note_id) REFERENCES public.voice_notes(id) ON DELETE CASCADE;


--
-- Name: share_chains share_chains_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: share_chains share_chains_parent_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_parent_note_id_fkey FOREIGN KEY (parent_note_id) REFERENCES public.voice_notes(id) ON DELETE CASCADE;


--
-- Name: share_chains share_chains_root_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_chains
    ADD CONSTRAINT share_chains_root_note_id_fkey FOREIGN KEY (root_note_id) REFERENCES public.voice_notes(id) ON DELETE CASCADE;


--
-- Name: shared_note_access shared_note_access_added_via_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_access
    ADD CONSTRAINT shared_note_access_added_via_share_id_fkey FOREIGN KEY (added_via_share_id) REFERENCES public.note_shares(id);


--
-- Name: shared_note_access shared_note_access_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_access
    ADD CONSTRAINT shared_note_access_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.voice_notes(id) ON DELETE CASCADE;


--
-- Name: shared_note_access shared_note_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_access
    ADD CONSTRAINT shared_note_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sms_notifications sms_notifications_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_notifications
    ADD CONSTRAINT sms_notifications_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.note_shares(id) ON DELETE CASCADE;


--
-- Name: user_assets user_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assets
    ADD CONSTRAINT user_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_invites user_invites_accepted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_accepted_user_id_fkey FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_invites user_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_invites user_invites_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_plans user_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_plans
    ADD CONSTRAINT user_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_palette_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_palette_slug_fkey FOREIGN KEY (palette_slug) REFERENCES public.persona_palettes(slug) ON DELETE SET NULL;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vn_folders vn_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_folders
    ADD CONSTRAINT vn_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.vn_folders(id) ON DELETE SET NULL;


--
-- Name: vn_folders vn_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_folders
    ADD CONSTRAINT vn_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vn_note_folders vn_note_folders_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_folders
    ADD CONSTRAINT vn_note_folders_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.vn_folders(id) ON DELETE CASCADE;


--
-- Name: vn_note_folders vn_note_folders_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_folders
    ADD CONSTRAINT vn_note_folders_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.vn_voice_notes(id) ON DELETE CASCADE;


--
-- Name: vn_note_tags vn_note_tags_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_tags
    ADD CONSTRAINT vn_note_tags_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.vn_voice_notes(id) ON DELETE CASCADE;


--
-- Name: vn_note_tags vn_note_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_note_tags
    ADD CONSTRAINT vn_note_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.vn_tags(id) ON DELETE CASCADE;


--
-- Name: vn_tags vn_tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_tags
    ADD CONSTRAINT vn_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vn_transcription_segments vn_transcription_segments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_transcription_segments
    ADD CONSTRAINT vn_transcription_segments_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.vn_voice_notes(id) ON DELETE CASCADE;


--
-- Name: vn_user_settings vn_user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_user_settings
    ADD CONSTRAINT vn_user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vn_voice_notes vn_voice_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vn_voice_notes
    ADD CONSTRAINT vn_voice_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: voice_notes voice_notes_share_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_notes
    ADD CONSTRAINT voice_notes_share_chain_id_fkey FOREIGN KEY (share_chain_id) REFERENCES public.share_chains(id);


--
-- Name: voice_notes voice_notes_shared_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_notes
    ADD CONSTRAINT voice_notes_shared_from_user_id_fkey FOREIGN KEY (shared_from_user_id) REFERENCES auth.users(id);


--
-- Name: voice_notes voice_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_notes
    ADD CONSTRAINT voice_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: voice_transcriptions voice_transcriptions_context_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_transcriptions
    ADD CONSTRAINT voice_transcriptions_context_item_id_fkey FOREIGN KEY (context_item_id) REFERENCES public.context_items(id) ON DELETE SET NULL;


--
-- Name: voice_transcriptions voice_transcriptions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_transcriptions
    ADD CONSTRAINT voice_transcriptions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: persona_palettes Anyone can read palettes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read palettes" ON public.persona_palettes FOR SELECT USING (true);


--
-- Name: context_items Owner manage context_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner manage context_items" ON public.context_items USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = context_items.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: links Owner manage links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner manage links" ON public.links USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = links.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: photo_metadata Owner manage photo_metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner manage photo_metadata" ON public.photo_metadata USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = photo_metadata.project_id) AND (projects.user_id = auth.uid())))));


--
-- Name: sms_notifications Service can manage SMS notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can manage SMS notifications" ON public.sms_notifications TO service_role USING (true) WITH CHECK (true);


--
-- Name: vn_voice_notes Users can delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notes" ON public.vn_voice_notes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: vn_voice_notes Users can insert own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notes" ON public.vn_voice_notes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_preferences Users can insert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: vn_transcription_segments Users can insert own segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own segments" ON public.vn_transcription_segments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.vn_voice_notes
  WHERE ((vn_voice_notes.id = vn_transcription_segments.note_id) AND (vn_voice_notes.user_id = auth.uid())))));


--
-- Name: vn_user_settings Users can insert own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own settings" ON public.vn_user_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: vn_folders Users can manage own folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own folders" ON public.vn_folders USING ((auth.uid() = user_id));


--
-- Name: vn_note_folders Users can manage own note folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own note folders" ON public.vn_note_folders USING ((EXISTS ( SELECT 1
   FROM public.vn_voice_notes
  WHERE ((vn_voice_notes.id = vn_note_folders.note_id) AND (vn_voice_notes.user_id = auth.uid())))));


--
-- Name: vn_note_tags Users can manage own note tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own note tags" ON public.vn_note_tags USING ((EXISTS ( SELECT 1
   FROM public.vn_voice_notes
  WHERE ((vn_voice_notes.id = vn_note_tags.note_id) AND (vn_voice_notes.user_id = auth.uid())))));


--
-- Name: vn_tags Users can manage own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own tags" ON public.vn_tags USING ((auth.uid() = user_id));


--
-- Name: user_preferences Users can read own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own preferences" ON public.user_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: vn_voice_notes Users can update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notes" ON public.vn_voice_notes FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: vn_user_settings Users can update own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own settings" ON public.vn_user_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: vn_voice_notes Users can view own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notes" ON public.vn_voice_notes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vn_transcription_segments Users can view own segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own segments" ON public.vn_transcription_segments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.vn_voice_notes
  WHERE ((vn_voice_notes.id = vn_transcription_segments.note_id) AND (vn_voice_notes.user_id = auth.uid())))));


--
-- Name: vn_user_settings Users can view own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own settings" ON public.vn_user_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: voice_notes Users delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own notes" ON public.voice_notes FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: voice_notes Users read own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own notes" ON public.voice_notes FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: voice_notes Users update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notes" ON public.voice_notes FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: voice_notes Users write own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users write own notes" ON public.voice_notes FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_public_read ON public.app_settings FOR SELECT USING (true);


--
-- Name: consent_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_documents consent_documents_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_documents_delete_policy ON public.consent_documents FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = consent_documents.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: consent_documents consent_documents_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_documents_insert_policy ON public.consent_documents FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = consent_documents.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: consent_documents consent_documents_select_anon_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_documents_select_anon_published ON public.consent_documents FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = consent_documents.project_id) AND (p.published = true)))));


--
-- Name: consent_documents consent_documents_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_documents_select_authenticated_baseline ON public.consent_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = consent_documents.project_id) AND (p.published = true)))));


--
-- Name: consent_documents consent_documents_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_documents_update_policy ON public.consent_documents FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = consent_documents.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_item_audio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_item_audio ENABLE ROW LEVEL SECURITY;

--
-- Name: context_item_audio context_item_audio_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_delete_policy ON public.context_item_audio FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_item_audio context_item_audio_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_insert_policy ON public.context_item_audio FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_item_audio context_item_audio_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_select_anon_gallery ON public.context_item_audio FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.published = true)))));


--
-- Name: context_item_audio context_item_audio_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_select_authenticated_baseline ON public.context_item_audio FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.published = true)))));


--
-- Name: context_item_audio context_item_audio_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_select_owner ON public.context_item_audio FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_item_audio context_item_audio_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_item_audio_update_policy ON public.context_item_audio FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.context_items ci
     JOIN public.projects p ON ((p.id = ci.project_id)))
  WHERE ((ci.id = context_item_audio.context_item_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_items ENABLE ROW LEVEL SECURITY;

--
-- Name: context_items context_items_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_delete_policy ON public.context_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_items context_items_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_insert_policy ON public.context_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_items context_items_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_select_anon_gallery ON public.context_items FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.published = true)))));


--
-- Name: context_items context_items_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_select_authenticated_baseline ON public.context_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.published = true)))));


--
-- Name: context_items context_items_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_select_owner ON public.context_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: context_items context_items_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY context_items_update_policy ON public.context_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = context_items.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: issue_report_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.issue_report_events ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_report_events issue_report_events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY issue_report_events_select_own ON public.issue_report_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.issue_reports r
  WHERE ((r.id = issue_report_events.report_id) AND (r.reporter_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: issue_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_reports issue_reports_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY issue_reports_select_own ON public.issue_reports FOR SELECT USING ((reporter_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

--
-- Name: links links_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_delete_policy ON public.links FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: links links_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_insert_policy ON public.links FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: links links_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_select_anon_gallery ON public.links FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.published = true)))));


--
-- Name: links links_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_select_authenticated_baseline ON public.links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.published = true)))));


--
-- Name: links links_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_select_owner ON public.links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: links links_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_update_policy ON public.links FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = links.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: maintenance_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.maintenance_banners ENABLE ROW LEVEL SECURITY;

--
-- Name: note_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: note_shares note_shares_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_shares_insert_policy ON public.note_shares FOR INSERT WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));


--
-- Name: note_shares note_shares_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_shares_select_policy ON public.note_shares FOR SELECT USING (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_email = ( SELECT auth.email() AS email))));


--
-- Name: note_shares note_shares_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_shares_update_policy ON public.note_shares FOR UPDATE USING ((recipient_email = ( SELECT auth.email() AS email)));


--
-- Name: page_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

--
-- Name: persona_palettes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.persona_palettes ENABLE ROW LEVEL SECURITY;

--
-- Name: photo_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.photo_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: photo_metadata photo_metadata_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_delete_policy ON public.photo_metadata FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = photo_metadata.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: photo_metadata photo_metadata_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_insert_policy ON public.photo_metadata FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = photo_metadata.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: photo_metadata photo_metadata_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_select_anon_gallery ON public.photo_metadata FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = photo_metadata.project_id) AND (p.published = true)))));


--
-- Name: photo_metadata photo_metadata_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_select_authenticated_baseline ON public.photo_metadata FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = photo_metadata.project_id) AND (p.published = true)))));


--
-- Name: photo_metadata photo_metadata_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_select_owner ON public.photo_metadata FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = photo_metadata.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: photo_metadata photo_metadata_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY photo_metadata_update_policy ON public.photo_metadata FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = photo_metadata.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_backstory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_backstory ENABLE ROW LEVEL SECURITY;

--
-- Name: project_backstory project_backstory_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_delete_policy ON public.project_backstory FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_backstory.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_backstory project_backstory_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_insert_policy ON public.project_backstory FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_backstory.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_backstory project_backstory_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_select_anon_gallery ON public.project_backstory FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_backstory.project_id) AND (p.published = true)))));


--
-- Name: project_backstory project_backstory_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_select_authenticated_baseline ON public.project_backstory FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_backstory.project_id) AND (p.published = true)))));


--
-- Name: project_backstory project_backstory_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_select_owner ON public.project_backstory FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_backstory.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_backstory project_backstory_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_backstory_update_policy ON public.project_backstory FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_backstory.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_creative_commons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_creative_commons ENABLE ROW LEVEL SECURITY;

--
-- Name: project_creative_commons project_creative_commons_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_delete_policy ON public.project_creative_commons FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_creative_commons.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_creative_commons project_creative_commons_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_insert_policy ON public.project_creative_commons FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_creative_commons.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_creative_commons project_creative_commons_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_select_anon_gallery ON public.project_creative_commons FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_creative_commons.project_id) AND (p.published = true)))));


--
-- Name: project_creative_commons project_creative_commons_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_select_authenticated_baseline ON public.project_creative_commons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_creative_commons.project_id) AND (p.published = true)))));


--
-- Name: project_creative_commons project_creative_commons_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_select_owner ON public.project_creative_commons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_creative_commons.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_creative_commons project_creative_commons_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_creative_commons_update_policy ON public.project_creative_commons FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_creative_commons.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_ethics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_ethics ENABLE ROW LEVEL SECURITY;

--
-- Name: project_ethics project_ethics_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_delete_policy ON public.project_ethics FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_ethics.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_ethics project_ethics_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_insert_policy ON public.project_ethics FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_ethics.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_ethics project_ethics_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_select_anon_gallery ON public.project_ethics FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_ethics.project_id) AND (p.published = true)))));


--
-- Name: project_ethics project_ethics_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_select_authenticated_baseline ON public.project_ethics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_ethics.project_id) AND (p.published = true)))));


--
-- Name: project_ethics project_ethics_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_select_owner ON public.project_ethics FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_ethics.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_ethics project_ethics_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_ethics_update_policy ON public.project_ethics FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_ethics.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: project_locations project_locations_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_delete_policy ON public.project_locations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_locations.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_locations project_locations_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_insert_policy ON public.project_locations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_locations.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_locations project_locations_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_select_anon_gallery ON public.project_locations FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_locations.project_id) AND (p.published = true)))));


--
-- Name: project_locations project_locations_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_select_authenticated_baseline ON public.project_locations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_locations.project_id) AND (p.published = true)))));


--
-- Name: project_locations project_locations_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_select_owner ON public.project_locations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_locations.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_locations project_locations_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_locations_update_policy ON public.project_locations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_locations.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_photographer_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_photographer_info ENABLE ROW LEVEL SECURITY;

--
-- Name: project_photographer_info project_photographer_info_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_delete_policy ON public.project_photographer_info FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_photographer_info.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_photographer_info project_photographer_info_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_insert_policy ON public.project_photographer_info FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_photographer_info.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_photographer_info project_photographer_info_select_anon_gallery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_select_anon_gallery ON public.project_photographer_info FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_photographer_info.project_id) AND (p.published = true)))));


--
-- Name: project_photographer_info project_photographer_info_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_select_authenticated_baseline ON public.project_photographer_info FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_photographer_info.project_id) AND (p.published = true)))));


--
-- Name: project_photographer_info project_photographer_info_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_select_owner ON public.project_photographer_info FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_photographer_info.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: project_photographer_info project_photographer_info_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_photographer_info_update_policy ON public.project_photographer_info FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_photographer_info.project_id) AND (projects.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_policy ON public.projects FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: projects projects_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_policy ON public.projects FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: projects projects_select_anon_public_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_anon_public_published ON public.projects FOR SELECT TO anon USING ((published = true));


--
-- Name: projects projects_select_authenticated_baseline_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_authenticated_baseline_published ON public.projects FOR SELECT TO authenticated USING ((published = true));


--
-- Name: projects projects_select_authenticated_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_authenticated_own ON public.projects FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: projects projects_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_policy ON public.projects FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: rate_limit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: share_chains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_chains ENABLE ROW LEVEL SECURITY;

--
-- Name: share_chains share_chains_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_chains_insert_policy ON public.share_chains FOR INSERT WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));


--
-- Name: share_chains share_chains_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_chains_select_policy ON public.share_chains FOR SELECT USING ((created_by = ( SELECT auth.uid() AS uid)));


--
-- Name: shared_note_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_note_access ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_note_access shared_note_access_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_note_access_select_policy ON public.shared_note_access FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: sms_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: speed_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speed_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: user_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_assets user_assets_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_assets_delete_own ON public.user_assets FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_assets user_assets_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_assets_insert_own ON public.user_assets FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_assets user_assets_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_assets_select_own ON public.user_assets FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_assets user_assets_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_assets_update_own ON public.user_assets FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: user_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: user_plans user_plans_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_plans_select_own ON public.user_plans FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles user_profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_select_own ON public.user_profiles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_profiles user_profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_update_own ON public.user_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings user_settings_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_insert_policy ON public.user_settings FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_settings user_settings_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_select_policy ON public.user_settings FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_settings user_settings_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_update_policy ON public.user_settings FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: vn_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_note_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_note_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_note_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_note_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_transcription_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_transcription_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: vn_voice_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vn_voice_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_transcriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_transcriptions voice_transcriptions_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_delete_policy ON public.voice_transcriptions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: voice_transcriptions voice_transcriptions_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_insert_policy ON public.voice_transcriptions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: voice_transcriptions voice_transcriptions_select_anon_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_select_anon_published ON public.voice_transcriptions FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.published = true)))));


--
-- Name: voice_transcriptions voice_transcriptions_select_authenticated_baseline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_select_authenticated_baseline ON public.voice_transcriptions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.published = true)))));


--
-- Name: voice_transcriptions voice_transcriptions_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_select_owner ON public.voice_transcriptions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: voice_transcriptions voice_transcriptions_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_transcriptions_update_policy ON public.voice_transcriptions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = voice_transcriptions.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION check_rate_limit(p_identifier text, p_tier text, p_endpoint text, p_method text, p_window_seconds integer, p_max_requests integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_rate_limit(p_identifier text, p_tier text, p_endpoint text, p_method text, p_window_seconds integer, p_max_requests integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_rate_limit(p_identifier text, p_tier text, p_endpoint text, p_method text, p_window_seconds integer, p_max_requests integer) TO service_role;


--
-- Name: FUNCTION cleanup_rate_limit_log(p_retain_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_rate_limit_log(p_retain_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_rate_limit_log(p_retain_hours integer) TO service_role;


--
-- Name: FUNCTION count_pending_shares(p_user_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.count_pending_shares(p_user_email text) TO anon;
GRANT ALL ON FUNCTION public.count_pending_shares(p_user_email text) TO authenticated;
GRANT ALL ON FUNCTION public.count_pending_shares(p_user_email text) TO service_role;


--
-- Name: FUNCTION create_user_from_phone(p_user_id uuid, p_phone text, p_share_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_user_from_phone(p_user_id uuid, p_phone text, p_share_id uuid) TO anon;
GRANT ALL ON FUNCTION public.create_user_from_phone(p_user_id uuid, p_phone text, p_share_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_user_from_phone(p_user_id uuid, p_phone text, p_share_id uuid) TO service_role;


--
-- Name: FUNCTION expire_old_shares(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expire_old_shares() TO anon;
GRANT ALL ON FUNCTION public.expire_old_shares() TO authenticated;
GRANT ALL ON FUNCTION public.expire_old_shares() TO service_role;


--
-- Name: FUNCTION find_user_by_contact(p_email text, p_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_user_by_contact(p_email text, p_phone text) TO anon;
GRANT ALL ON FUNCTION public.find_user_by_contact(p_email text, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.find_user_by_contact(p_email text, p_phone text) TO service_role;


--
-- Name: FUNCTION get_browser_breakdown(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_browser_breakdown(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_browser_breakdown(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_equipment_stats(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_equipment_stats(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_equipment_stats(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_geo_breakdown(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_geo_breakdown(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_geo_breakdown(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_location_countries(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_location_countries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_location_countries() TO service_role;


--
-- Name: FUNCTION get_match_positions(p_text text, p_search_query text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_match_positions(p_text text, p_search_query text) TO anon;
GRANT ALL ON FUNCTION public.get_match_positions(p_text text, p_search_query text) TO authenticated;
GRANT ALL ON FUNCTION public.get_match_positions(p_text text, p_search_query text) TO service_role;


--
-- Name: FUNCTION get_os_breakdown(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_os_breakdown(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_os_breakdown(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_page_views_summary(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_page_views_summary(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_page_views_summary(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_project_children(project_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_project_children(project_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_project_children(project_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_project_children(project_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_project_search_text(target_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_project_search_text(target_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_project_search_text(target_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_project_search_text(target_project_id uuid) TO service_role;


--
-- Name: FUNCTION get_pv_country_breakdown(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_pv_country_breakdown(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pv_country_breakdown(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_rate_limit_stats(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_rate_limit_stats(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_rate_limit_stats(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_root_parent(project_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_root_parent(project_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_root_parent(project_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_root_parent(project_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer) TO anon;
GRANT ALL ON FUNCTION public.get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_search_context(p_note_id uuid, p_user_id uuid, p_context_size integer) TO service_role;


--
-- Name: FUNCTION get_share_chain(p_note_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_share_chain(p_note_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_share_chain(p_note_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_share_chain(p_note_id uuid) TO service_role;


--
-- Name: FUNCTION get_shares_by_phone(p_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_shares_by_phone(p_phone text) TO anon;
GRANT ALL ON FUNCTION public.get_shares_by_phone(p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_shares_by_phone(p_phone text) TO service_role;


--
-- Name: FUNCTION get_storage_total_for_user(target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_storage_total_for_user(target_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_storage_total_for_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_storage_totals_by_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_storage_totals_by_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_storage_totals_by_user() TO service_role;


--
-- Name: FUNCTION get_tag_distribution(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_tag_distribution(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_tag_distribution(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_top_cities(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_top_cities(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_top_cities(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_top_pages(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_top_pages(p_hours integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_top_pages(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_top_referrers(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_top_referrers(p_hours integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_top_referrers(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_utm_breakdown(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_utm_breakdown(p_hours integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_utm_breakdown(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_browser_engine(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_web_vitals_by_browser_engine(p_hours integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_web_vitals_by_browser_engine(p_hours integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_web_vitals_by_browser_engine(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_client(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_web_vitals_by_client(p_hours integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_web_vitals_by_client(p_hours integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_web_vitals_by_client(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_connection(p_hours integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_web_vitals_by_connection(p_hours integer) TO anon;
GRANT ALL ON FUNCTION public.get_web_vitals_by_connection(p_hours integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_web_vitals_by_connection(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_device(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_web_vitals_by_device(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_web_vitals_by_device(p_hours integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_device_brand(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_web_vitals_by_device_brand(p_hours integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_web_vitals_by_device_brand(p_hours integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_web_vitals_by_device_brand(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_os(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_web_vitals_by_os(p_hours integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_web_vitals_by_os(p_hours integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_web_vitals_by_os(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_by_route(p_hours integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_web_vitals_by_route(p_hours integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_web_vitals_by_route(p_hours integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_web_vitals_summary(p_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_web_vitals_summary(p_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_web_vitals_summary(p_hours integer) TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;
GRANT SELECT ON TABLE public.projects TO PUBLIC;
GRANT SELECT ON TABLE public.projects TO anon;


--
-- Name: FUNCTION list_gallery_projects_light(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_gallery_projects_light() TO anon;
GRANT ALL ON FUNCTION public.list_gallery_projects_light() TO authenticated;
GRANT ALL ON FUNCTION public.list_gallery_projects_light() TO service_role;


--
-- Name: FUNCTION list_user_projects_light(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_user_projects_light(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.list_user_projects_light(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_user_projects_light(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION project_locations_set_coordinates(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_locations_set_coordinates() TO anon;
GRANT ALL ON FUNCTION public.project_locations_set_coordinates() TO authenticated;
GRANT ALL ON FUNCTION public.project_locations_set_coordinates() TO service_role;


--
-- Name: FUNCTION projects_author_autofill(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_author_autofill() TO anon;
GRANT ALL ON FUNCTION public.projects_author_autofill() TO authenticated;
GRANT ALL ON FUNCTION public.projects_author_autofill() TO service_role;


--
-- Name: FUNCTION projects_title_autofill(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projects_title_autofill() TO anon;
GRANT ALL ON FUNCTION public.projects_title_autofill() TO authenticated;
GRANT ALL ON FUNCTION public.projects_title_autofill() TO service_role;


--
-- Name: FUNCTION rebuild_project_search_vector(target_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rebuild_project_search_vector(target_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.rebuild_project_search_vector(target_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rebuild_project_search_vector(target_project_id uuid) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_all_user_chains(p_user_id uuid, p_search_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.search_conversation_chain(p_root_note_id uuid, p_search_query text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION search_gallery_projects(search_query text, result_limit integer, result_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, result_limit integer, result_offset integer) TO anon;
GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, result_limit integer, result_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, result_limit integer, result_offset integer) TO service_role;


--
-- Name: FUNCTION search_gallery_projects(search_query text, query_embedding public.vector, result_limit integer, result_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, query_embedding public.vector, result_limit integer, result_offset integer) TO anon;
GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, query_embedding public.vector, result_limit integer, result_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_gallery_projects(search_query text, query_embedding public.vector, result_limit integer, result_offset integer) TO service_role;


--
-- Name: FUNCTION trg_projects_search_vector(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_projects_search_vector() TO anon;
GRANT ALL ON FUNCTION public.trg_projects_search_vector() TO authenticated;
GRANT ALL ON FUNCTION public.trg_projects_search_vector() TO service_role;


--
-- Name: FUNCTION trg_rebuild_search_vector(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_rebuild_search_vector() TO anon;
GRANT ALL ON FUNCTION public.trg_rebuild_search_vector() TO authenticated;
GRANT ALL ON FUNCTION public.trg_rebuild_search_vector() TO service_role;


--
-- Name: FUNCTION update_persona_palettes_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_persona_palettes_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_persona_palettes_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_persona_palettes_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_voice_note_search_vector(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_voice_note_search_vector() TO anon;
GRANT ALL ON FUNCTION public.update_voice_note_search_vector() TO authenticated;
GRANT ALL ON FUNCTION public.update_voice_note_search_vector() TO service_role;


--
-- Name: FUNCTION validate_project_metadata(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_project_metadata() TO anon;
GRANT ALL ON FUNCTION public.validate_project_metadata() TO authenticated;
GRANT ALL ON FUNCTION public.validate_project_metadata() TO service_role;


--
-- Name: FUNCTION vn_update_search_vector(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vn_update_search_vector() TO anon;
GRANT ALL ON FUNCTION public.vn_update_search_vector() TO authenticated;
GRANT ALL ON FUNCTION public.vn_update_search_vector() TO service_role;


--
-- Name: FUNCTION vn_update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vn_update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.vn_update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.vn_update_updated_at_column() TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;
GRANT SELECT ON TABLE public.app_settings TO PUBLIC;
GRANT SELECT ON TABLE public.app_settings TO anon;


--
-- Name: TABLE consent_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.consent_documents TO authenticated;
GRANT ALL ON TABLE public.consent_documents TO service_role;
GRANT SELECT ON TABLE public.consent_documents TO PUBLIC;
GRANT SELECT ON TABLE public.consent_documents TO anon;


--
-- Name: TABLE context_item_audio; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.context_item_audio TO authenticated;
GRANT ALL ON TABLE public.context_item_audio TO service_role;
GRANT SELECT ON TABLE public.context_item_audio TO PUBLIC;
GRANT SELECT ON TABLE public.context_item_audio TO anon;


--
-- Name: TABLE context_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.context_items TO authenticated;
GRANT ALL ON TABLE public.context_items TO service_role;
GRANT SELECT ON TABLE public.context_items TO PUBLIC;
GRANT SELECT ON TABLE public.context_items TO anon;


--
-- Name: TABLE links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.links TO authenticated;
GRANT ALL ON TABLE public.links TO service_role;
GRANT SELECT ON TABLE public.links TO PUBLIC;
GRANT SELECT ON TABLE public.links TO anon;


--
-- Name: TABLE photo_metadata; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.photo_metadata TO authenticated;
GRANT ALL ON TABLE public.photo_metadata TO service_role;
GRANT SELECT ON TABLE public.photo_metadata TO PUBLIC;
GRANT SELECT ON TABLE public.photo_metadata TO anon;


--
-- Name: TABLE project_backstory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_backstory TO authenticated;
GRANT ALL ON TABLE public.project_backstory TO service_role;
GRANT SELECT ON TABLE public.project_backstory TO PUBLIC;
GRANT SELECT ON TABLE public.project_backstory TO anon;


--
-- Name: TABLE project_creative_commons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_creative_commons TO authenticated;
GRANT ALL ON TABLE public.project_creative_commons TO service_role;
GRANT SELECT ON TABLE public.project_creative_commons TO PUBLIC;
GRANT SELECT ON TABLE public.project_creative_commons TO anon;


--
-- Name: TABLE project_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_locations TO authenticated;
GRANT ALL ON TABLE public.project_locations TO service_role;
GRANT SELECT ON TABLE public.project_locations TO PUBLIC;
GRANT SELECT ON TABLE public.project_locations TO anon;


--
-- Name: TABLE gallery_feed; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gallery_feed TO anon;
GRANT ALL ON TABLE public.gallery_feed TO authenticated;
GRANT ALL ON TABLE public.gallery_feed TO service_role;


--
-- Name: TABLE issue_report_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.issue_report_events TO authenticated;
GRANT ALL ON TABLE public.issue_report_events TO service_role;
GRANT SELECT ON TABLE public.issue_report_events TO PUBLIC;
GRANT SELECT ON TABLE public.issue_report_events TO anon;


--
-- Name: TABLE issue_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.issue_reports TO authenticated;
GRANT ALL ON TABLE public.issue_reports TO service_role;
GRANT SELECT ON TABLE public.issue_reports TO PUBLIC;
GRANT SELECT ON TABLE public.issue_reports TO anon;


--
-- Name: TABLE maintenance_banners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.maintenance_banners TO authenticated;
GRANT ALL ON TABLE public.maintenance_banners TO service_role;
GRANT SELECT ON TABLE public.maintenance_banners TO PUBLIC;
GRANT SELECT ON TABLE public.maintenance_banners TO anon;


--
-- Name: TABLE note_shares; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_shares TO authenticated;
GRANT ALL ON TABLE public.note_shares TO service_role;
GRANT SELECT ON TABLE public.note_shares TO PUBLIC;
GRANT SELECT ON TABLE public.note_shares TO anon;


--
-- Name: TABLE page_views; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.page_views TO authenticated;
GRANT ALL ON TABLE public.page_views TO service_role;
GRANT SELECT ON TABLE public.page_views TO PUBLIC;
GRANT SELECT ON TABLE public.page_views TO anon;


--
-- Name: SEQUENCE page_views_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.page_views_id_seq TO anon;
GRANT ALL ON SEQUENCE public.page_views_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.page_views_id_seq TO service_role;


--
-- Name: TABLE persona_palettes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.persona_palettes TO authenticated;
GRANT ALL ON TABLE public.persona_palettes TO service_role;
GRANT SELECT ON TABLE public.persona_palettes TO PUBLIC;
GRANT SELECT ON TABLE public.persona_palettes TO anon;


--
-- Name: TABLE voice_transcriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.voice_transcriptions TO authenticated;
GRANT ALL ON TABLE public.voice_transcriptions TO service_role;
GRANT SELECT ON TABLE public.voice_transcriptions TO PUBLIC;
GRANT SELECT ON TABLE public.voice_transcriptions TO anon;


--
-- Name: TABLE platform_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_stats TO service_role;


--
-- Name: TABLE project_ethics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_ethics TO authenticated;
GRANT ALL ON TABLE public.project_ethics TO service_role;
GRANT SELECT ON TABLE public.project_ethics TO PUBLIC;
GRANT SELECT ON TABLE public.project_ethics TO anon;


--
-- Name: TABLE project_photographer_info; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_photographer_info TO authenticated;
GRANT ALL ON TABLE public.project_photographer_info TO service_role;
GRANT SELECT ON TABLE public.project_photographer_info TO PUBLIC;
GRANT SELECT ON TABLE public.project_photographer_info TO anon;


--
-- Name: TABLE rate_limit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limit_log TO authenticated;
GRANT ALL ON TABLE public.rate_limit_log TO service_role;
GRANT SELECT ON TABLE public.rate_limit_log TO PUBLIC;
GRANT SELECT ON TABLE public.rate_limit_log TO anon;


--
-- Name: SEQUENCE rate_limit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.rate_limit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.rate_limit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.rate_limit_log_id_seq TO service_role;


--
-- Name: TABLE share_chains; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.share_chains TO authenticated;
GRANT ALL ON TABLE public.share_chains TO service_role;
GRANT SELECT ON TABLE public.share_chains TO PUBLIC;
GRANT SELECT ON TABLE public.share_chains TO anon;


--
-- Name: TABLE shared_note_access; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_note_access TO authenticated;
GRANT ALL ON TABLE public.shared_note_access TO service_role;
GRANT SELECT ON TABLE public.shared_note_access TO PUBLIC;
GRANT SELECT ON TABLE public.shared_note_access TO anon;


--
-- Name: TABLE sms_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_notifications TO authenticated;
GRANT ALL ON TABLE public.sms_notifications TO service_role;
GRANT SELECT ON TABLE public.sms_notifications TO PUBLIC;
GRANT SELECT ON TABLE public.sms_notifications TO anon;


--
-- Name: TABLE spatial_ref_sys_readonly; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.spatial_ref_sys_readonly TO service_role;
GRANT SELECT ON TABLE public.spatial_ref_sys_readonly TO authenticated;


--
-- Name: TABLE speed_insights; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.speed_insights TO authenticated;
GRANT ALL ON TABLE public.speed_insights TO service_role;
GRANT SELECT ON TABLE public.speed_insights TO PUBLIC;
GRANT SELECT ON TABLE public.speed_insights TO anon;


--
-- Name: TABLE user_assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_assets TO authenticated;
GRANT ALL ON TABLE public.user_assets TO service_role;
GRANT SELECT ON TABLE public.user_assets TO PUBLIC;
GRANT SELECT ON TABLE public.user_assets TO anon;


--
-- Name: TABLE user_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_invites TO authenticated;
GRANT ALL ON TABLE public.user_invites TO service_role;
GRANT SELECT ON TABLE public.user_invites TO PUBLIC;
GRANT SELECT ON TABLE public.user_invites TO anon;


--
-- Name: TABLE user_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_plans TO authenticated;
GRANT ALL ON TABLE public.user_plans TO service_role;
GRANT SELECT ON TABLE public.user_plans TO PUBLIC;
GRANT SELECT ON TABLE public.user_plans TO anon;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;
GRANT SELECT ON TABLE public.user_preferences TO PUBLIC;
GRANT SELECT ON TABLE public.user_preferences TO anon;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;
GRANT SELECT ON TABLE public.user_profiles TO PUBLIC;
GRANT SELECT ON TABLE public.user_profiles TO anon;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT SELECT ON TABLE public.user_roles TO PUBLIC;
GRANT SELECT ON TABLE public.user_roles TO anon;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;
GRANT SELECT ON TABLE public.user_settings TO PUBLIC;
GRANT SELECT ON TABLE public.user_settings TO anon;


--
-- Name: TABLE vn_folders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_folders TO authenticated;
GRANT ALL ON TABLE public.vn_folders TO service_role;
GRANT SELECT ON TABLE public.vn_folders TO PUBLIC;
GRANT SELECT ON TABLE public.vn_folders TO anon;


--
-- Name: TABLE vn_note_folders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_note_folders TO authenticated;
GRANT ALL ON TABLE public.vn_note_folders TO service_role;
GRANT SELECT ON TABLE public.vn_note_folders TO PUBLIC;
GRANT SELECT ON TABLE public.vn_note_folders TO anon;


--
-- Name: TABLE vn_note_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_note_tags TO authenticated;
GRANT ALL ON TABLE public.vn_note_tags TO service_role;
GRANT SELECT ON TABLE public.vn_note_tags TO PUBLIC;
GRANT SELECT ON TABLE public.vn_note_tags TO anon;


--
-- Name: TABLE vn_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_tags TO authenticated;
GRANT ALL ON TABLE public.vn_tags TO service_role;
GRANT SELECT ON TABLE public.vn_tags TO PUBLIC;
GRANT SELECT ON TABLE public.vn_tags TO anon;


--
-- Name: TABLE vn_transcription_segments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_transcription_segments TO authenticated;
GRANT ALL ON TABLE public.vn_transcription_segments TO service_role;
GRANT SELECT ON TABLE public.vn_transcription_segments TO PUBLIC;
GRANT SELECT ON TABLE public.vn_transcription_segments TO anon;


--
-- Name: TABLE vn_user_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_user_settings TO authenticated;
GRANT ALL ON TABLE public.vn_user_settings TO service_role;
GRANT SELECT ON TABLE public.vn_user_settings TO PUBLIC;
GRANT SELECT ON TABLE public.vn_user_settings TO anon;


--
-- Name: TABLE vn_voice_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vn_voice_notes TO authenticated;
GRANT ALL ON TABLE public.vn_voice_notes TO service_role;
GRANT SELECT ON TABLE public.vn_voice_notes TO PUBLIC;
GRANT SELECT ON TABLE public.vn_voice_notes TO anon;


--
-- Name: TABLE voice_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.voice_notes TO authenticated;
GRANT ALL ON TABLE public.voice_notes TO service_role;
GRANT SELECT ON TABLE public.voice_notes TO PUBLIC;
GRANT SELECT ON TABLE public.voice_notes TO anon;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict gxfHVod6kE9J0ewdE9hiXydUX2N1D4vRwxlbauwTdsUqaU9OuV9dkze6scb3dzA

