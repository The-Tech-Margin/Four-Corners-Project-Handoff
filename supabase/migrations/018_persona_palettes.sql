-- Last updated: 2026-03-25
-- Persona palettes: admin-defined color scheme overrides for demo instances.
-- Each row stores a named palette with dark/light mode CSS variable overrides.

create table if not exists persona_palettes (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  dark_overrides  jsonb not null default '{}',
  light_overrides jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public reads (no auth required — palettes are applied client-side)
alter table persona_palettes enable row level security;

create policy "Anyone can read palettes"
  on persona_palettes for select
  using (true);

-- No insert/update/delete policies — all writes go through
-- admin API routes using the service role key (bypasses RLS).

-- Auto-update updated_at on change
create or replace function update_persona_palettes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger persona_palettes_updated_at
  before update on persona_palettes
  for each row
  execute function update_persona_palettes_updated_at();
