-- Last updated: 2026-05-13
-- Migration: Lightweight project listing RPC functions
-- Strips heavy base64/blob data from metadata JSONB at the database level
-- so only display-relevant fields travel over the network.
-- This can reduce payload by 10-100x for projects with images/recordings.
--
-- The return type is declared with explicit TABLE(...) columns rather than
-- SETOF projects so the function stays valid when projects' column order
-- changes (e.g. migration 034 drops + re-adds `title` at the end, which
-- shifts every column after position 3, breaking SETOF-projects positional
-- matching). Postgres 17 enforces this strictly; older versions did not.

-- Function: list projects for a specific user (dashboard)
DROP FUNCTION IF EXISTS list_user_projects_light(uuid);
CREATE FUNCTION list_user_projects_light(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  slug text,
  title text,
  author text,
  date text,
  main_image_url text,
  main_image_storage_path text,
  published boolean,
  in_gallery boolean,
  parent_project_id uuid,
  version_number integer,
  forked_from_user_id uuid,
  is_fork boolean,
  created_at timestamptz,
  updated_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    user_id,
    slug,
    title,
    author,
    date,
    main_image_url,
    main_image_storage_path,
    published,
    in_gallery,
    parent_project_id,
    version_number,
    forked_from_user_id,
    is_fork,
    created_at,
    updated_at,
    -- Build lightweight metadata: keep display fields, strip heavy blobs
    jsonb_build_object(
      'backStory', COALESCE(metadata->'backStory', '{}'::jsonb),
      'creativeCommons', COALESCE(metadata->'creativeCommons', '{}'::jsonb),
      'ethics', metadata->'ethics',
      'photographerInfo', metadata->'photographerInfo',
      'links', COALESCE(metadata->'links', '[]'::jsonb),
      'location', CASE
        WHEN metadata->'location' IS NOT NULL THEN
          jsonb_build_object(
            'formattedLocation', metadata->'location'->'formattedLocation',
            'city', metadata->'location'->'city',
            'state', metadata->'location'->'state',
            'country', metadata->'location'->'country'
          )
        ELSE NULL
      END,
      'photoMetadata', CASE
        WHEN metadata->'photoMetadata' IS NOT NULL THEN
          jsonb_build_object(
            'dateTaken', metadata->'photoMetadata'->'dateTaken',
            'equipment', metadata->'photoMetadata'->'equipment'
          )
        ELSE NULL
      END,
      -- Strip context items to display-only fields (no base64, no audio blobs)
      'context', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', elem->'id',
            'sourceType', elem->'sourceType',
            'caption', elem->'caption',
            'description', elem->'description',
            'credit', elem->'credit',
            'date', elem->'date',
            'type', elem->'type',
            'storage_url', elem->'storage_url',
            'thumbnail_storage_url', elem->'thumbnail_storage_url',
            'linkedProjectId', elem->'linkedProjectId',
            'linkedProjectSlug', elem->'linkedProjectSlug'
          )
        ), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(metadata->'context', '[]'::jsonb)) AS elem
      ),
      -- Strip voice transcriptions to text-only (no audio blobs)
      'voiceTranscriptions', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', elem->'id',
            'recordingId', elem->'recordingId',
            'text', elem->'text',
            'transcribedAt', elem->'transcribedAt',
            'fieldId', elem->'fieldId',
            'duration', elem->'duration'
          )
        ), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(metadata->'voiceTranscriptions', '[]'::jsonb)) AS elem
      )
    ) AS metadata
  FROM projects
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;
$$;

-- Function: list published gallery projects (public gallery page)
DROP FUNCTION IF EXISTS list_gallery_projects_light();
CREATE FUNCTION list_gallery_projects_light()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  slug text,
  title text,
  author text,
  date text,
  main_image_url text,
  main_image_storage_path text,
  published boolean,
  in_gallery boolean,
  parent_project_id uuid,
  version_number integer,
  forked_from_user_id uuid,
  is_fork boolean,
  created_at timestamptz,
  updated_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    user_id,
    slug,
    title,
    author,
    date,
    main_image_url,
    main_image_storage_path,
    published,
    in_gallery,
    parent_project_id,
    version_number,
    forked_from_user_id,
    is_fork,
    created_at,
    updated_at,
    jsonb_build_object(
      'backStory', COALESCE(metadata->'backStory', '{}'::jsonb),
      'creativeCommons', COALESCE(metadata->'creativeCommons', '{}'::jsonb),
      'ethics', metadata->'ethics',
      'photographerInfo', metadata->'photographerInfo',
      'links', COALESCE(metadata->'links', '[]'::jsonb),
      'location', CASE
        WHEN metadata->'location' IS NOT NULL THEN
          jsonb_build_object(
            'formattedLocation', metadata->'location'->'formattedLocation',
            'city', metadata->'location'->'city',
            'state', metadata->'location'->'state',
            'country', metadata->'location'->'country'
          )
        ELSE NULL
      END,
      'photoMetadata', CASE
        WHEN metadata->'photoMetadata' IS NOT NULL THEN
          jsonb_build_object(
            'dateTaken', metadata->'photoMetadata'->'dateTaken',
            'equipment', metadata->'photoMetadata'->'equipment'
          )
        ELSE NULL
      END,
      'context', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', elem->'id',
            'sourceType', elem->'sourceType',
            'caption', elem->'caption',
            'description', elem->'description',
            'credit', elem->'credit',
            'date', elem->'date',
            'type', elem->'type',
            'storage_url', elem->'storage_url',
            'thumbnail_storage_url', elem->'thumbnail_storage_url',
            'linkedProjectId', elem->'linkedProjectId',
            'linkedProjectSlug', elem->'linkedProjectSlug'
          )
        ), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(metadata->'context', '[]'::jsonb)) AS elem
      ),
      'voiceTranscriptions', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', elem->'id',
            'recordingId', elem->'recordingId',
            'text', elem->'text',
            'transcribedAt', elem->'transcribedAt',
            'fieldId', elem->'fieldId',
            'duration', elem->'duration'
          )
        ), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(metadata->'voiceTranscriptions', '[]'::jsonb)) AS elem
      )
    ) AS metadata
  FROM projects
  WHERE published = true AND in_gallery = true
  ORDER BY created_at DESC;
$$;
