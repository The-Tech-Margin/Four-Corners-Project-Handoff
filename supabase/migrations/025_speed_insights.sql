-- Last updated: 2026-04-08
-- Speed Insights table for Web Vitals log drain.
-- Stores CLS, FCP, FID, INP, LCP, TTFB metrics from @vercel/speed-insights.

create table if not exists speed_insights (
  id              bigint generated always as identity primary key,
  metric_type     text        not null,  -- CLS, FCP, FID, INP, LCP, TTFB
  value           double precision not null,
  timestamp       timestamptz not null default now(),
  path            text,
  route           text,
  origin          text,
  device_type     text,
  connection_speed text,
  country         text,
  deployment_id   text,
  vercel_env      text,
  attribution     jsonb,
  sdk_name        text,
  sdk_version     text,
  script_version  text,
  created_at      timestamptz not null default now()
);

alter table speed_insights enable row level security;
-- No policies: only service_role can write (from vitals API route)

-- Index for dashboard queries (metric type + time range)
create index if not exists idx_speed_insights_metric_time
  on speed_insights (metric_type, timestamp desc);

-- Index for path-based analysis
create index if not exists idx_speed_insights_path
  on speed_insights (path, timestamp desc);

-- Cleanup: removes entries older than retention window
create or replace function cleanup_speed_insights(
  p_retain_days int default 30
)
returns int
language plpgsql
security definer
as $$
declare
  v_deleted int;
begin
  delete from speed_insights
   where created_at < now() - (p_retain_days || ' days')::interval;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
