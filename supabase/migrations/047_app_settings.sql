-- Last updated: 2026-05-15
-- App settings: key/value store for admin-controlled feature flags and site config.
-- Public read (these are non-sensitive flags consumed by the UI); writes via service-role only.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy "app_settings_public_read" on app_settings
  for select using (true);

-- No insert/update/delete policies — writes happen via service-role only.

-- Seed: ship dark — Explore mode hidden from gallery viewers until admin enables it.
insert into app_settings (key, value)
values ('gallery_explore_enabled', 'false'::jsonb)
on conflict (key) do nothing;
