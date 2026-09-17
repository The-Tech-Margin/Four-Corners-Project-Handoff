-- Last updated: 2026-04-06
-- Add global palette flag: at most one palette can be the site-wide default.
-- When is_global = true, PersonaProvider applies it without ?persona= param.

alter table persona_palettes
  add column if not exists is_global boolean not null default false;

-- Partial unique index: only one row can have is_global = true
create unique index if not exists persona_palettes_global_unique
  on persona_palettes (is_global) where (is_global = true);
