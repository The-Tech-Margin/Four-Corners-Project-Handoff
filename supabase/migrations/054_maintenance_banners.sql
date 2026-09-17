-- Last updated: 2026-06-11
-- Maintenance banner library: named, reusable banner configs.
--
-- The ACTIVE banner remains the `maintenance_banner` key in app_settings
-- (see 053) — that is what the public read path serves. This table is the
-- super-admin's library of reusable configs: shipped presets plus any custom
-- banners saved for later. Config shape is owned by lib/maintenance-banner.ts
-- (MaintenanceBannerSchema) and validated in the admin API on write.
--
-- DDL only — populate the preset rows with:
--   npx tsx scripts/seed-maintenance-banners.ts

create table if not exists maintenance_banners (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  config      jsonb not null,
  is_preset   boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table maintenance_banners enable row level security;

-- No policies: this is admin-only data, read and written exclusively through
-- service-role admin API routes. Anon/authenticated clients get nothing.
