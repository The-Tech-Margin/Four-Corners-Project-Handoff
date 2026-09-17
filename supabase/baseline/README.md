# Production schema baseline

`20260710_prod_schema.sql` is a **read-only reference snapshot** of the
production `public` schema (tables, functions, triggers, grants, and all 116
RLS policies) taken 2026-07-10 with:

```sh
pg_dump "$POSTGRES_URL_NON_POOLING" --schema-only --schema=public --no-owner
```

It is NOT an executable migration and is never applied by tooling — it exists
because production had drifted from `supabase/migrations/`:

- Migrations were historically applied by hand (the CI `migrate` job had never
  run — it was gated behind the chronically red lint job), so
  `supabase_migrations.schema_migrations` held 1 row against 60 repo files.
- SELECT policies on the normalized project tables were replaced outside this
  repo (live names `*_select_anon_gallery` / `*_select_authenticated_baseline`;
  VoiceVault shares this Supabase project). The dropped owner arm broke all
  project creation until `20260710_restore_owner_select_normalized_tables.sql`.

This snapshot is the agreed "real baseline of current state". Diff future
dumps against it to detect drift.

## RLS exposure audit (2026-07-10, against this baseline)

Invariant: **CRUD only for authenticated owners; anonymous may only read
published / in-gallery content.** Verified by classifying every policy
expression in `pg_policies`:

- No write policy is reachable anonymously — every INSERT/UPDATE/DELETE/ALL
  policy anchors on `auth.uid()` ownership (or `auth.email()` for VoiceVault's
  `note_shares`), except `sms_notifications` which is `service_role`-only.
- Anonymous SELECT is limited to `published`-gated project content plus two
  intentional public-config tables: `app_settings` (banner/feature-flag keys
  only) and `persona_palettes` (theme config).
- `spatial_ref_sys` (PostGIS reference data) has no RLS — Supabase-owned,
  hardened in `20260630_spatial_ref_sys_rls_hardening.sql`.

## Regenerating

```sh
/opt/homebrew/opt/libpq/bin/pg_dump "$POSTGRES_URL_NON_POOLING" \
  --schema-only --schema=public --no-owner \
  -f supabase/baseline/$(date +%Y%m%d)_prod_schema.sql
```
