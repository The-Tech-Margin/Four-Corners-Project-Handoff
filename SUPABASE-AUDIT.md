# Supabase Live Audit — RLS & Storage Capacity

Manual audit queries for the live Supabase project. Run each block in the
Supabase dashboard SQL editor (Project → SQL Editor → New query) and compare
the results to the "What to look for" callouts.

The audit is split into:
- **Block 0 — Pre-flight checks** (run BEFORE applying the in_gallery gate
  migrations 20260502a/b — these queries surface anything that would break)
- **Part A — Table access (RLS)**: blocks 1–4
- **Part B — Storage capacity**: block 5

The expected public-read RLS pattern (after the in_gallery gate migrations
`20260502a_rls_tables_in_gallery_gate.sql` and
`20260502b_rls_storage_in_gallery_gate.sql`) is a three-clause OR:

```
user_id = (select auth.uid())                                       -- owner
OR ((select auth.role()) = 'authenticated' AND published = true)    -- logged-in collaborator
OR in_gallery = true                                                -- truly public
```

Anon role can only match the third clause, so non-gallery projects are not
publicly readable via PostgREST. Storage policies for `project-images` and
`context-media` join through the parent project to enforce the same gate.

Write policies (INSERT/UPDATE/DELETE) remain owner-only:
`auth.uid() = user_id`. Storage upload/delete uses
`(storage.foldername(name))[1] = auth.uid()::text`.

---

## Safe rollout for the in_gallery gate migrations

The two migrations have very different blast radii. Apply in order, with a
verification gap between them.

1. **Run Block 0 pre-flight first.** It surfaces anything that would break
   under the new policies (storage paths that don't fit the expected shape,
   published-but-not-in-gallery projects whose share links would change
   semantics, etc.). Fix anything flagged before going further.

2. **Apply `20260502a_rls_tables_in_gallery_gate.sql`** (table policies
   only). Lower risk: PostgREST queries still work for owners and any
   logged-in user viewing a published project; only anon access to
   non-gallery projects changes.
   - Verify: load `/gallery` (anon) — should still work.
   - Verify: load a known `in_gallery=true` project's `/view/[slug]` while
     logged out — should load.
   - Verify: load a `published=true, in_gallery=false` project's
     `/view/[slug]` while logged out — **expected to break** (this is the
     intended behavior change). It should still work for any logged-in user.
   - If something else regresses, the migration's ROLLBACK section restores
     the previous policies.

3. **Apply `20260502b_rls_storage_in_gallery_gate.sql`** (storage policies)
   only after step 2 has been validated. Higher risk: the policy parses
   project_id out of the storage object path. If any object's path doesn't
   fit the expected shape, the image becomes inaccessible (broken thumbnails
   in the gallery).
   - Verify: gallery thumbnails still render.
   - Verify: a known in-gallery project's main image and context images
     still load.
   - If broken images appear, run the ROLLBACK section in 20260502b.

4. **Re-run audit Blocks 1–4** to confirm policies look as expected post-
   migration.

User-visible behavior change: previously-shared share links to projects
that are `published=true` but **not** `in_gallery=true` will stop working
for anonymous visitors. Logged-in visitors are unaffected.

---

## Block 0 — Pre-flight (run before applying 20260502a/b)

Each query returns rows that would BREAK under the new policies. The goal
for every query is **zero rows** (or a small, expected count).

### 0a. Storage objects with non-standard paths in gated buckets

```sql
-- project-images: every object should match {userId}/main-images/{projectId}.{ext}
select bucket_id,
       name,
       split_part(split_part(name, '/', 3), '.', 1) as extracted_project_id,
       array_length(string_to_array(name, '/'), 1) as path_segments
from storage.objects
where bucket_id = 'project-images'
  and not exists (
    select 1 from public.projects p
    where p.id::text = split_part(split_part(name, '/', 3), '.', 1)
  )
limit 50;
```

```sql
-- context-media: matches main-image OR nested context-image shape
select bucket_id, name,
       split_part(split_part(name, '/', 3), '.', 1) as projectid_main_path,
       (storage.foldername(name))[3] as projectid_nested_path,
       array_length(string_to_array(name, '/'), 1) as path_segments
from storage.objects
where bucket_id = 'context-media'
  and not exists (
    select 1 from public.projects p
    where p.id::text = split_part(split_part(name, '/', 3), '.', 1)
       or p.id::text = (storage.foldername(name))[3]
  )
limit 50;
```

**What to look for**: empty result. Any row here is an object whose path
doesn't fit the expected shape — it would become inaccessible (broken
image) once `20260502b` is applied. Investigate the path, either renaming
the object, deleting it if orphaned, or extending the storage policy to
cover the legacy shape before applying.

### 0b. Share links that will change behavior for anon visitors

```sql
select id, slug, title, published, in_gallery, updated_at
from public.projects
where published = true
  and (in_gallery = false or in_gallery is null)
order by updated_at desc;
```

**What to look for**: this is the explicit list of projects whose
`/view/[slug]` will start 404'ing for anonymous visitors after `20260502a`
is applied. Logged-in visitors are unaffected. If any of these projects
have outstanding share links you want to keep working for anon, either:
- flip them to `in_gallery = true` (they'll show in the gallery), OR
- decide that's an acceptable break, OR
- add a redirect-to-login on /view/[slug] for anon (separate feature).

### 0c. Confirm in_gallery → published constraint is intact

```sql
select count(*) as rows_violating_constraint
from public.projects
where in_gallery = true and published = false;
```

**What to look for**: `0`. The constraint added in migration 005 should
make this impossible. If non-zero, the constraint is missing or disabled
and you should investigate before relying on the new policies.

---

## Part A — Table access (RLS)

### Block 1 — RLS enablement on public tables

```sql
select n.nspname as schema,
       c.relname as "table",
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
order by c.relrowsecurity, c.relname;
```

**What to look for**: every app table should be `rls_enabled = true`. The
17 RLS-enabled tables declared in migrations are:

`projects`, `context_items`, `links`, `voice_transcriptions`,
`consent_documents`, `project_ethics`, `project_locations`,
`photo_metadata`, `context_item_audio`, `user_assets`, `user_roles`,
`rate_limit_log`, `page_views`, `user_plans`, `project_backstory`,
`project_creative_commons`, `project_photographer_info`.

Any of these showing `rls_enabled = false` is a drift to fix immediately.

### Block 2 — Role grants on public tables

```sql
select grantee,
       table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
group by grantee, table_name
order by grantee, table_name;
```

**What to look for**:
- `anon` should have **no SELECT** on user-owned tables (`projects`,
  `context_items`, `voice_transcriptions`, `photo_metadata`, etc.).
  Public-facing reads happen through `published = true` filters in
  policies, not via anon-direct grants.
- `authenticated` typically gets `SELECT, INSERT, UPDATE, DELETE` and is
  then constrained by RLS policies.
- `service_role` having full access is expected (it bypasses RLS anyway).
- `public` (the catch-all) appearing on any user table is suspicious.

> **2026-10-30 Supabase default change.** Starting October 30, 2026,
> Supabase stops auto-exposing new `public`-schema tables to the Data API.
> Existing tables keep their current grants — Block 2 output should look
> identical before and after the cutoff. Any **new** `CREATE TABLE` after
> that date that does not include explicit grants will return a PostgREST
> `42501` error from supabase-js. See [Migration convention — explicit GRANTs
> for the Data API](#migration-convention--explicit-grants-for-the-data-api)
> below for the required template, and [supabase/_template.sql](supabase/_template.sql)
> for copy-paste blocks.

### Block 3 — All policies (public + storage)

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

**What to look for**, per table:
- a SELECT policy with the three-clause OR (owner / authenticated+published /
  in_gallery) — see top of file for the canonical shape
- INSERT policy with `WITH CHECK auth.uid() = user_id`
- UPDATE/DELETE policies with both USING and WITH CHECK on `auth.uid() = user_id`
- `storage.objects` SELECT policies for `project-images` and `context-media`
  join through to `public.projects` and apply the same three-clause gate

Red flags:
- a `*_select_policy` whose `qual` still contains `published = true` without
  the `auth.role() = 'authenticated'` guard → anon can read published
  non-gallery items (the bug the in_gallery migration fixes)
- `qual = 'true'` → policy permits all rows
- `roles = '{public}'` on any user table → anyone (including unauthenticated)
  matches; only acceptable when the qual itself is `in_gallery = true`
- storage policies on `project-images` / `context-media` whose `qual` is just
  `bucket_id = 'X'` with no project join → wide-open public read
- a table with INSERT but no UPDATE/DELETE policy (or vice versa) — usually
  unintentional
- a missing SELECT policy on a table with RLS on (silent lockout — see Block 4)

### Block 4 — Tables with RLS on but no policies (silent lockout)

```sql
select n.nspname as schema, c.relname as "table"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where c.relkind = 'r'
  and n.nspname in ('public', 'storage')
  and c.relrowsecurity = true
  and p.policyname is null
order by c.relname;
```

**What to look for**: empty result is good. Any row here means RLS is on
but no policy exists — under standard Supabase grants the table is
unreadable by `anon` and `authenticated`. The app may appear to work via
admin endpoints (service_role bypasses RLS) but break for normal users.

---

## Migration convention — explicit GRANTs for the Data API

Supabase is removing the implicit grant that auto-exposed `public`-schema
tables to the Data API (supabase-js / PostgREST / GraphQL):

- **2026-05-30**: new projects already enforce the change.
- **2026-10-30**: enforced on all existing projects, including this one
  (`bqavhyldbazlqpeglzzv`).
- Existing tables keep their current grants. The 17 tables listed in
  Block 1 are grandfathered — Block 2's output should be unchanged after
  the cutoff.
- The change affects **new** `CREATE TABLE public.X` from then on. Without
  explicit grants, supabase-js returns PostgREST error `42501` with a hint
  that names the missing GRANT.

The app talks to Supabase exclusively via the Data API (no direct Postgres
connection string), so every new public-schema table touched from
[lib/db/](lib/db/), [app/api/](app/api/), or anywhere using
[lib/supabase/](lib/supabase/) needs explicit grants in the same migration.

### Rule

Every new `CREATE TABLE public.X` migration **must** include explicit
GRANTs in the same SQL file. Pick one of three templates below depending
on the table's intent. Copy-paste source: [supabase/_template.sql](supabase/_template.sql).

### Template 1 — User-owned table (Data API, owner-only)

For tables backing user content where supabase-js (anon or authenticated
client) writes/reads scoped by `auth.uid()`. The vast majority of tables
in this repo follow this shape.

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

-- Data API access — required after Supabase 2026-10-30 default change.
-- Anon stays off direct table grants; public reads route through views/RPCs.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;

CREATE POLICY "<table>_select_own" ON public.<table>
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "<table>_insert_own" ON public.<table>
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<table>_update_own" ON public.<table>
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "<table>_delete_own" ON public.<table>
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

### Template 2 — Internal / service-role-only table

For tables only touched by server endpoints with the service-role client
(e.g. [rate_limit_log](supabase/migrations/020_rate_limit_log.sql),
[page_views](supabase/migrations/033_page_views.sql)). Service-role
bypasses RLS, and anon/authenticated should not be able to reach the
table even by accident.

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- No policies: RLS-on + no policy = implicit deny for anon/authenticated.

-- Explicitly revoke the Data API roles to keep intent legible after the
-- 2026-10-30 default change. service_role retains access (it always does).
REVOKE ALL ON public.<table> FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.<table> TO service_role;
```

### Template 3 — Public read via view or RPC

For tables that need anon read access (gallery feed, search, etc.), do
**not** grant anon directly on the table. Keep the base table on
Template 1, and add a view or `SECURITY INVOKER` RPC that filters to the
public-safe subset and is granted to anon. Mirrors
[023_gallery_feed_view.sql](supabase/migrations/023_gallery_feed_view.sql),
[028_search_embedding.sql](supabase/migrations/028_search_embedding.sql),
and the linter fix in [030_security_linter_fixes.sql](supabase/migrations/030_security_linter_fixes.sql).

```sql
-- Base table follows Template 1 (RLS + authenticated/service_role grants).

CREATE VIEW public.<table>_public WITH (security_invoker = true) AS
SELECT <safe columns>
FROM public.<table>
WHERE <public-visibility predicate>;

GRANT SELECT ON public.<table>_public TO anon, authenticated;
```

For RPCs replace the view block with:

```sql
CREATE OR REPLACE FUNCTION public.<rpc_name>(...) RETURNS ...
LANGUAGE sql STABLE SECURITY INVOKER AS $$ ... $$;

REVOKE ALL ON FUNCTION public.<rpc_name>(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<rpc_name>(...) TO anon, authenticated;
```

---

## Part B — Storage capacity

### Block 5a — Per-bucket totals

```sql
select bucket_id,
       count(*) as object_count,
       pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as total_size,
       coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes
from storage.objects
group by bucket_id
order by total_bytes desc;
```

**What to look for**: four buckets — `project-images`, `context-media`,
`consent-documents`, `voice-recordings`. The image buckets are the heavy
hitters; `voice-recordings` should be moderate; `consent-documents`
smallest. Any bucket not in that list is unexpected.

### Block 5b — Bucket configs

```sql
select id, name, public, file_size_limit, allowed_mime_types, created_at
from storage.buckets
order by id;
```

**What to look for** (declared in [migration 002](supabase/migrations/002_storage_setup.sql)):

| bucket              | public | expected file_size_limit |
|---------------------|--------|--------------------------|
| `project-images`    | true   | (whatever 002 set)       |
| `context-media`     | true   | (whatever 002 set)       |
| `consent-documents` | false  | (whatever 002 set)       |
| `voice-recordings`  | false  | (whatever 002 set)       |

Any bucket flipped public → private (or vice versa) is a drift.

### Block 5c — Top 10 users by usage

```sql
select (storage.foldername(name))[1] as user_id,
       count(*) as object_count,
       pg_size_pretty(sum((metadata->>'size')::bigint)) as total_size,
       sum((metadata->>'size')::bigint) as total_bytes
from storage.objects
where (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
group by 1
order by sum((metadata->>'size')::bigint) desc nulls last
limit 10;
```

**What to look for**: any user disproportionately large vs. the others
(orphans from deleted projects? abuse?). Cross-reference against
`PLAN_QUOTAS` in [lib/upload-limits.ts](lib/upload-limits.ts):
free 1 GB, pro 10 GB, team 50 GB.

### Block 5d — Grand total vs Pro pool

```sql
select pg_size_pretty(sum((metadata->>'size')::bigint)) as used,
       round(
         100.0 * sum((metadata->>'size')::bigint)
              / (100::bigint * 1024 * 1024 * 1024),
         2
       ) as percent_of_pro_pool
from storage.objects;
```

**What to look for**: well under 100% of the 100 GB Pro pool. > 50% is
worth watching; > 80% needs action (purge orphans or upgrade plan).

---

## After running

Compare the result tables against the expected pattern in this document and
flag any drift.
