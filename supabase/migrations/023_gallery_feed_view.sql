-- Last updated: 2026-04-07
-- Materialized-style view for gallery feed.
--
-- Replaces PostgREST's 6-separate-query approach with a single query plan.
-- All JOINs are LEFT so projects without related data still appear.
-- 1:many tables (context_items, links) are aggregated with json_agg
-- inside lateral subqueries to avoid row multiplication.

-- Drop existing view if column layout changed (non-destructive — views hold no data)
drop view if exists gallery_feed;

create view gallery_feed as
select
  p.id,
  p.slug,
  p.title,
  p.author,
  p.date,
  -- When storage path exists, return NULL for main_image_url to avoid
  -- sending multi-MB base64 strings. The app constructs the public URL
  -- from main_image_storage_path at the transform layer.
  case
    when p.main_image_storage_path is not null then null
    else p.main_image_url
  end as main_image_url,
  p.main_image_storage_path,
  p.published,
  p.in_gallery,
  p.created_at,
  p.updated_at,
  p.user_id,
  p.parent_project_id,

  -- 1:1 backstory
  bs.text        as backstory_text,
  bs.author      as backstory_author,
  bs.publication as backstory_publication,
  bs.date        as backstory_date,

  -- 1:1 creative commons
  cc.copyright   as cc_copyright,
  cc.description as cc_description,

  -- 1:1 location
  loc.city       as location_city,
  loc.state      as location_state,
  loc.country    as location_country,
  loc.formatted_location as location_formatted,

  -- 1:1 photo metadata
  pm.camera_make,
  pm.camera_model,

  -- 1:many context items — aggregated to JSON array
  coalesce(ci.items, '[]'::json) as context_items,

  -- 1:many links — aggregated to JSON array
  coalesce(lk.items, '[]'::json) as links

from projects p
left join project_backstory bs  on bs.project_id = p.id
left join project_creative_commons cc on cc.project_id = p.id
left join project_locations loc on loc.project_id = p.id
left join photo_metadata pm     on pm.project_id = p.id
left join lateral (
  select json_agg(json_build_object('id', c.id, 'caption', c.caption)) as items
  from context_items c
  where c.project_id = p.id
) ci on true
left join lateral (
  select json_agg(json_build_object('id', l.id, 'title', l.title, 'source', l.source)) as items
  from links l
  where l.project_id = p.id
) lk on true

where p.published = true
  and p.in_gallery = true;

-- Grant read access so the anon key can query this view
grant select on gallery_feed to anon, authenticated;
