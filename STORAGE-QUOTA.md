# Storage Quota

Single source-of-truth reference for how uploads are capped and how per-user total storage is tracked. If you're adding a new upload entry point or tuning the limits, start here.

---

## TL;DR

| Control | Lives in | Changes require |
|---|---|---|
| Per-file byte caps | `lib/upload-limits.ts` → `MAX_UPLOAD_BYTES` | Code edit + redeploy |
| Plan → total-bytes mapping | `lib/upload-limits.ts` → `PLAN_QUOTAS` | Code edit + redeploy (no DB migration) |
| Which plan a user is on | `user_plans.plan` (migration `039_user_plans.sql`) | Service-role `UPDATE` (no client-side writes) |
| Per-user override | `user_plans.custom_limit_bytes` | Service-role `UPDATE` |

Every cap is enforced in **two places**: client pre-flight (before any blob read) and server-side in `/api/storage/upload` (defence in depth for direct POSTs that bypass the UI).

---

## Per-file caps

Defined in [`lib/upload-limits.ts`](./lib/upload-limits.ts):

```ts
MAX_UPLOAD_BYTES = {
  image:    25 MB,   // 48 MP phone photos + HEIC headroom
  video:   100 MB,   // ~60 s phone clip; bigger → use a URL link instead
  audio:    60 MB,   // one hour of M4A voice note ≈ 30 MB
  document: 20 MB,   // consent PDFs / scanned forms
}
```

Why these numbers:

- **Image 25 MB** — covers every phone camera we've seen including 48 MP HEIC captures; below Supabase's default per-request headroom.
- **Video 100 MB** — roughly a one-minute phone clip at high bitrate. Beyond this, browser memory pressure spikes and uploads time out. For longer clips, users are nudged to "add as a URL link instead" — `context-images` supports URL-only context items.
- **Audio 60 MB** — matches the cap the app already enforced. One hour of voice memo is ~30 MB in M4A, so 60 MB lets users keep raw exports without transcoding.
- **Document 20 MB** — consent PDFs are typically small; 20 MB covers scan-heavy forms without becoming a dumping ground for arbitrary files.

### Validator

`validateUpload(file, kind)` is the only helper callers should use. It's **pure** — no side effects — so tests don't need to mock toasts:

```ts
const r = validateUpload(file, "image");
if (!r.ok) {
  notifyFile.tooLarge(r.fileName, r.actualBytes, r.limitBytes, r.kind);
  return;
}
```

The returned object includes the filename, actual size, limit, and kind, so the toast can be rendered from `messages.file.tooLarge` in `lib/notify.ts` with full context (e.g. *"interview-raw.mov is 147 MB — videos must be under 100 MB."*).

### Where it's wired

| Entry point | File | Notes |
|---|---|---|
| Main image upload | `components/image-drop-zone.tsx::handleFile` | Was silently failing on size; now pre-flight checks + toast |
| Related imagery (image + video) | `components/context-images.tsx::handleFileSelect` | Kind detected per-file from MIME; skip-and-continue on fail so a 200 MB file doesn't abort a whole batch |
| Audio / voice notes | `components/audio-file-upload.tsx::handleFileSelect` | Type check separate from size check; size check replaces the old local 60 MB constant |
| Consent documents | `components/caption-credit-ethics.tsx::handleConsentUpload` | Was 5 MB hardcoded; now 20 MB via shared limits |
| Server catch-all | `app/api/storage/upload/route.ts` | Infers kind from MIME via `kindFromMime`; returns HTTP 413 with the same human message |

---

## Per-user storage quota

### Storage of record

- `user_assets.file_size` (column on the library table from [migration 036](./supabase/migrations/036_user_assets.sql)) is the source of truth for total bytes used.
- Every upload records a row via `recordAsset` (fire-and-forget) — see `lib/supabase-context-storage.ts`, `lib/supabase-voice-storage.ts`, and `app/api/storage/upload/route.ts`.
- RLS scopes `SELECT` on `user_assets` to the signed-in user, so a client-side `SUM(file_size)` automatically returns only that user's usage.

### Plan table

[`supabase/migrations/039_user_plans.sql`](./supabase/migrations/039_user_plans.sql) introduces a minimal table:

```sql
CREATE TABLE user_plans (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan IN ('free', 'pro', 'team', 'unlimited')),
  custom_limit_bytes  BIGINT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

- RLS: users `SELECT` their own row only. No `INSERT/UPDATE/DELETE` policies — plan changes require the service role (so they can only happen from a future payment webhook, not from the client).
- Users with no row are treated as `free` — the table is populated lazily when an upgrade ships.

### Plan → bytes mapping

In [`lib/upload-limits.ts`](./lib/upload-limits.ts):

```ts
PLAN_QUOTAS = {
  free:      1 GB,
  pro:        10 GB,
  team:       50 GB,
  unlimited:  Number.MAX_SAFE_INTEGER,
}
```

Resolution precedence for a user's effective limit:

1. `custom_limit_bytes` if set and `> 0` (one-off override, e.g. early-access accounts).
2. `PLAN_QUOTAS[plan]` if the plan name is recognised.
3. Fallback to `PLAN_QUOTAS.free` for any unrecognised plan string.

See `resolvePlanLimit(plan, customLimit)` in `lib/upload-limits.ts`.

### DB helpers

[`lib/db/user-storage.ts`](./lib/db/user-storage.ts) exposes:

```ts
getUserStorageUsage(userId)  // SUM(file_size)
getUserPlan(userId)          // { plan, customLimit }
getUserQuota(userId)         // { used, limit, plan, ratio }
checkQuotaForUpload(userId, incomingBytes)
  //   { ok: true }
  //   { ok: false; used, limit, plan }
```

All of these are plain Supabase queries. No RPC. The aggregate is cheap because the query is always hitting an indexed `user_id` filter on `user_assets`.

**Race consideration:** two parallel uploads could both pass the pre-flight check when they'd each fit individually but not together. Acceptable for v1 — server-side enforcement at `/api/storage/upload` catches the second write. A future optimisation could use an atomic Postgres RPC if this becomes a real problem.

---

## Notifications

All quota-related user messaging flows through [`lib/notify.ts`](./lib/notify.ts) → the existing `notifyFile` namespace. Two helpers:

```ts
notifyFile.tooLarge(fileName, actualBytes, limitBytes, kind)
// "interview-raw.mov is 147 MB — videos must be under 100 MB."

notifyFile.quotaExceeded(usedBytes, limitBytes, plan)
// "You've used 480 MB of your 1 GB storage (free plan).
//  Remove some assets or upgrade to add more."
```

Both share the app-wide `<Toaster />` mount and the 2 s dedup window. There's no new notification infrastructure — just extensions to existing copy.

---

## UI surfaces

The [`StorageUsageBadge`](./components/storage-usage-badge.tsx) component has three variants and two data sources.

### Variants

- `default` — pill with text + bar. Used inside the user menu (the dropdown triggered by the header "Menu" button) when signed in.
- `compact` — thin bar + `%` only. Used in the library modal footer when nothing is selected.
- `inline` — thin bar + bytes + `%` on one line. Used per-row in the admin users list.

### Data sources

- **Self-fetch** (default): component calls `getUserQuota(currentUserId)` once on mount. Used by the signed-in-user surfaces (user menu, library modal).
- **Pre-supplied `data` prop**: admin views already have per-user usage from `/api/admin/storage`, so they pass `{ used, limit, plan }` and the badge skips the fetch.

### Colour ramp

Driven by `USAGE_WARN_RATIO` (80 %) and `USAGE_CRITICAL_RATIO` (95 %) in `lib/upload-limits.ts`:

- < 80 % → `var(--fc-accent)` (persona accent)
- ≥ 80 % → amber `#f59e0b`
- ≥ 95 % → `var(--fc-danger)`

---

## Admin monitoring

### `/api/admin/storage`

Returns per-user aggregates. Gated by the same dual admin auth as `/api/admin/stats` (password-cookie OR Supabase admin role):

```json
{
  "users": [
    {
      "userId": "…",
      "plan": "free",
      "used": 412345678,
      "limit": 524288000,
      "ratio": 0.786,
      "assetCount": 42
    }
  ],
  "totalUsers": 17,
  "totalUsedBytes": 8123456789,
  "refreshedAt": "2026-04-16T12:00:00.000Z"
}
```

Accepts `?limit=N` (default 20, max 200).

### Admin users list

`/admin/users` joins `/api/admin/users` with `/api/admin/storage` client-side and renders a `<StorageUsageBadge variant="inline" data={…} />` per row. Storage fetch failure is non-critical — the list still renders without bars rather than blocking the page.

---

## Operational runbook

### Upgrading a user to pro

Service-role only (SQL against the Supabase database):

```sql
INSERT INTO user_plans (user_id, plan) VALUES ('<uuid>', 'pro')
ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', updated_at = now();
```

### Giving a user a one-off bump

```sql
INSERT INTO user_plans (user_id, plan, custom_limit_bytes)
VALUES ('<uuid>', 'free', 2147483648)  -- 2 GiB custom cap
ON CONFLICT (user_id) DO UPDATE
  SET custom_limit_bytes = EXCLUDED.custom_limit_bytes,
      updated_at = now();
```

### Retuning the free tier

Edit `PLAN_QUOTAS.free` in `lib/upload-limits.ts`, ship. No DB migration — every existing `free` user sees the new limit on their next page load.

### Retuning a per-file cap

Edit `MAX_UPLOAD_BYTES` in `lib/upload-limits.ts`. The inline helper text in every drop area pulls from the same constant, so copy updates for free. Server + client enforce the same number immediately.

---

## Testing

- [`__tests__/upload-limits.test.ts`](./__tests__/upload-limits.test.ts) — 27 cases covering `formatBytes`, `validateUpload` branching (under / exactly at / over limit, per-kind cap application), `kindFromMime` / `kindLabel`, `resolvePlanLimit` (default / custom / unknown plan), and threshold ordering.
- CI runs the suite in `.github/workflows/ci.yml` via `npm run test:upload-limits` as a fast-feedback step before the full coverage run.

---

## Out of scope (follow-ups)

- Payment flow / Stripe integration. This doc lays the rail; upgrades become a service-role `UPDATE user_plans` when the payment layer lands.
- Client-side video transcoding to squeeze under the 100 MB cap automatically.
- Atomic parallel-upload reservation (currently a small race window between pre-flight and write).
- Per-project quotas (the UI model is per-user).
- Soft-delete accounting — deletions drop usage immediately.
