-- Last updated: 2026-04-07
-- User preferences — persists per-user settings like palette override.
-- RLS scoped to auth.uid() so users can only read/write their own row.

create table if not exists user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  palette_slug  text references persona_palettes(slug) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table user_preferences enable row level security;

create policy "Users can read own preferences"
  on user_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on user_preferences for update
  using (auth.uid() = user_id);
