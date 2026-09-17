# Build Instructions — In-App Issue Intake

> Hand this file to Claude Code. It specifies how to build a "Report an issue"
> feature for the Four Corners app: a small form plus rich auto-captured context
> (screenshot, URL, device, app state, diagnostics) stored in one Supabase table.
> Triage automation (notifications/routing/admin list) is explicitly **out of
> scope** for this pass — but the schema leaves room for it.

## Objective

When a signed-in creator hits a problem, let them file an issue in two clicks. The
form collects only `type`, `severity`, and a description (plus optional steps/email);
**everything else is captured automatically** at the moment of the issue and stored
in `issue_reports`, with the screenshot in a private Storage bucket.

## Decisions (locked — do not re-litigate)

- **Audience:** authenticated creators only. The reporter UI renders only when a
  Supabase session exists. No anonymous reporting.
- **Screenshot:** one-click DOM snapshot via `modern-screenshot` (one new dep).
  Auto-fallback to manual file attach if capture fails/taints.
- **Surfacing:** floating button (bottom-right) **and** an `AppHeader` menu item,
  plus a keyboard shortcut `Shift+I` (ignore when focus is in an input/textarea;
  never use `Cmd/Ctrl+Shift+I` — devtools).
- **Diagnostics:** full — snapshot state + console-error ring buffer + action
  breadcrumbs + failed-request log + Web Vitals/memory.
- **Taxonomy:** `type` ∈ Bug · Visual · Data · Performance · Feature · Other;
  `severity` ∈ Blocker · Major · Minor · Cosmetic.
- **Retention/privacy:** screenshots in a **private** bucket; signed URLs only;
  **auto-delete the screenshot when `status` becomes `resolved`/`wont_fix`/
  `duplicate`**. Honor a `.fc-redact` / `data-fc-private` class — mask those nodes
  before rasterizing (consent docs, sensitive in-progress work). Never capture
  tokens, cookies, or `localStorage`; strip secrets from the stored URL.

## Hard constraints

1. **Additive. No breaking changes.** New files only, plus: one `package.json`
   dependency, one `<IssueReporterProvider />` line in `app/layout.tsx`, and
   (optionally) one menu item in `components/app-header.tsx`. Do not refactor
   existing modules.
2. Colors via `--fc-*` tokens only (inherits dark/light + persona, like `/docs`).
3. Must pass `npx tsc --noEmit`, `npm run lint`, `npm run build`.
4. Identity & build fields are **server-derived** in the API route — never trusted
   from the client.

## Conventions to mirror (verified against this repo)

- **Migration style:** copy `supabase/migrations/042_user_invites.sql` — UUID PK,
  `CHECK` constraints, `ENABLE ROW LEVEL SECURITY`, `SELECT own` policy, no client
  write policies (service-role only), and the shared `update_updated_at_column()`
  trigger. Next migration number is **049**.
- **Service-role client:** follow `lib/admin-roles.ts` (`createClient` from
  `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`). Server session client:
  `createClient` from `@/lib/supabase/server`.
- **API route pattern:** copy `app/api/invites/request/route.ts` (POST, validate,
  service-role insert, JSON response).
- **Auth check (+ dev bypass):** `supabase.auth.getUser()`; honor
  `isDevAuthEnabled()` + `DEV_AUTH_COOKIE` from `@/lib/dev-auth`.
- **Rate limiting:** use `lib/rate-limit.ts` on the POST route.
- **Provider mount:** add `<IssueReporterProvider />` inside the existing
  `<Suspense>` next to `<PersonaProvider />` in `app/layout.tsx`.
- **Voice input:** reuse `components/voice-textarea.tsx` for the description field.
- **Uploads/quota:** reuse `lib/upload-limits.ts` (`MAX_UPLOAD_BYTES`,
  `checkQuotaForUpload`) and the Storage upload approach in
  `lib/supabase-context-storage.ts` / `lib/supabase-audio-storage.ts`.
- **App state source:** read the Zustand store `lib/store.ts`
  (`layoutMode`, `projectId`/`projectSlug`, `pendingSlug`, unsaved flag).
- **Build identity env:** `VERCEL_ENV`, `VERCEL_DEPLOYMENT_ID`, `NODE_ENV`
  (server-side). Optionally add `NEXT_PUBLIC_COMMIT_SHA` at build for exact commit
  links.
- **Theme tokens:** `--fc-bg/-surface/-text/-text-secondary/-text-muted/-border/
  -accent` and corner colors `--fc-corner-{context,links,backstory,cc}`.

## The form (user-entered)

`type` (select) · `severity` (segmented) · `description` (required, VoiceTextarea) ·
`steps` (optional, collapsed) · `email` (prefilled from session) · toggles for
**include screenshot** (with thumbnail) and **include diagnostics** (with a
"see exactly what's included" expander). Title optional — derive from first line if
blank.

## Auto-capture inventory (fill as much as possible)

Collect in `lib/issue-capture.ts`, show back to the user before submit, store in the
JSONB columns:

- **app_state** — `projectId, projectSlug, pendingSlug, isUnsaved, layoutMode,
  focusedCorner, focusedSection, theme, persona, autosaveStatus`
- **device** — parsed UA (browser+version, os, deviceType) + raw UA, `viewport`,
  `screen`, `devicePixelRatio`, orientation, `language`, `timeZone`, `online`,
  `navigator.connection` (effectiveType, downlink), `deviceMemory`,
  `hardwareConcurrency`, touch, `prefers-color-scheme`, `prefers-reduced-motion`
- **build** — `VERCEL_ENV`, `VERCEL_DEPLOYMENT_ID`, `NODE_ENV`, optional commit SHA
  (set server-side in the route)
- **diagnostics** — `consoleErrors[]` (ring buffer via console + `window.onerror` +
  `unhandledrejection`), `breadcrumbs[]` (route changes + clicks), `vitals` (reuse
  the CWV you already collect), `perf` (`performance.memory`, navigation timing),
  `failedRequests[]` (status + path only — no bodies, no secrets)
- **location** — sanitized `href`, matched `route`, `referrer`
- **screenshot** — `modern-screenshot` of `document.body`, downscaled WebP (~1600px
  long edge, q≈0.8), `.fc-redact` masked

> **WebGL caveat:** the three.js canvas only reads back if the renderer keeps its
> drawing buffer. Set `preserveDrawingBuffer: true` where the renderer is created,
> or add a capture hook that re-renders to an offscreen canvas. If a cross-origin
> asset taints the canvas, fall back to manual attach automatically.

## Database — create `supabase/migrations/049_issue_reports.sql`

```sql
-- Last updated: <today>
-- 049: issue_reports — in-app issue intake. Form collects type/severity/description;
-- everything else auto-captured client-side and enriched server-side. Mirrors
-- 042_user_invites.sql conventions (RLS on, service-role writes, SELECT own).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS issue_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status               TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix','duplicate')),
  type                 TEXT NOT NULL DEFAULT 'bug'
                       CHECK (type IN ('bug','visual','data','performance','feature','other')),
  severity             TEXT NOT NULL DEFAULT 'minor'
                       CHECK (severity IN ('blocker','major','minor','cosmetic')),
  title                TEXT,
  description          TEXT NOT NULL,
  steps                TEXT,
  reporter_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email       CITEXT,
  url                  TEXT,
  route                TEXT,
  referrer             TEXT,
  app_state            JSONB NOT NULL DEFAULT '{}'::jsonb,
  device               JSONB NOT NULL DEFAULT '{}'::jsonb,
  build                JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostics          JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent           TEXT,
  screenshot_path      TEXT,
  consent_screenshot   BOOLEAN NOT NULL DEFAULT TRUE,
  consent_diagnostics  BOOLEAN NOT NULL DEFAULT TRUE,
  assignee             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority             SMALLINT,
  resolution           TEXT,
  resolved_at          TIMESTAMPTZ,
  reviewed_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_status_idx      ON issue_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_reports_reporter_idx    ON issue_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS issue_reports_type_sev_idx    ON issue_reports (type, severity);
CREATE INDEX IF NOT EXISTS issue_reports_app_state_gin   ON issue_reports USING gin (app_state);
CREATE INDEX IF NOT EXISTS issue_reports_diagnostics_gin ON issue_reports USING gin (diagnostics);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY issue_reports_select_own ON issue_reports FOR SELECT
  USING (reporter_user_id = (SELECT auth.uid()));
-- No client INSERT/UPDATE/DELETE — service-role only.

CREATE TRIGGER update_issue_reports_updated_at
  BEFORE UPDATE ON issue_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-screenshots', 'issue-screenshots', false)
ON CONFLICT (id) DO NOTHING;
```

## API — `app/api/issues/route.ts` (POST)

1. Require a session (`401` otherwise). Honor dev-auth bypass.
2. `lib/rate-limit.ts` — e.g. 5/min per user.
3. Validate body with `lib/issue-schema.ts` (`IssueReportSchema`, Zod).
4. Enrich server-side: `created_at`, `build` (Vercel env), `reporter_user_id` +
   `reporter_email` from session.
5. If a screenshot data-URL is present and consented: decode → upload to
   `issue-screenshots/{user_id}/{id}.webp` → set `screenshot_path`.
6. Service-role insert into `issue_reports`.
7. Return `{ id }`; client toasts "Thanks — issue logged".

## Files to create

```
supabase/migrations/049_issue_reports.sql
lib/issue-capture.ts            # collect app_state/device/build/diagnostics/location
lib/console-buffer.ts           # ring buffer: console + window.onerror + unhandledrejection
lib/screenshot.ts               # modern-screenshot wrapper + .fc-redact masking + fallback
lib/issue-schema.ts             # Zod IssueReportSchema (shared client + API)
app/api/issues/route.ts         # POST handler (above)
components/issue-reporter/IssueReporterProvider.tsx   # mounts button + shortcut + modal
components/issue-reporter/FloatingReportButton.tsx
components/issue-reporter/IssueReportModal.tsx
components/issue-reporter/DiagnosticsPanel.tsx
```

Edits to existing files (the only ones permitted):
- `package.json` — add `modern-screenshot`.
- `app/layout.tsx` — add `<IssueReporterProvider />` next to `<PersonaProvider />`.
- `components/app-header.tsx` — add a "Report an issue" menu item (optional).
- The three.js renderer setup — `preserveDrawingBuffer: true` (only if needed for capture).

## Out of scope (next pass)

Admin triage list (`app/admin/issues/page.tsx`), notifications/routing, and the
status-change hook that deletes the screenshot on resolve. **`status` is live from
day one** — every report is created with `status = 'open'` and the column is part of
the data model now; only the admin UI that *transitions* status (and the triage
fields `assignee`, `priority`, `resolution`, `resolved_at`, `reviewed_by`) are
deferred.

## Acceptance criteria

- [ ] Logged-out users never see the reporter; logged-in users see the floating
      button, the header item, and `Shift+I` opens it.
- [ ] Opening the reporter captures a screenshot of the underlying page (not the
      modal) with `.fc-redact` nodes masked; fallback to manual attach works.
- [ ] Submitting inserts a row with `app_state`, `device`, `build`, `diagnostics`
      richly populated and (if consented) a `screenshot_path`; identity/build come
      from the server, not the client.
- [ ] The reporter UI inherits dark/light + persona via `--fc-*` tokens only.
- [ ] Rate limiting + Zod validation enforced on `POST /api/issues`.
- [ ] No tokens/cookies/localStorage captured; URL secrets stripped.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; migration applies
      cleanly to a local Supabase.

## Verification commands

```bash
npm install                  # picks up modern-screenshot
supabase db reset            # or apply 049 to a local db; confirm table + bucket
npx tsc --noEmit
npm run lint
npm run build
npm run dev                  # sign in → Shift+I → submit → confirm row + screenshot in Storage
```

> Full rationale, auto-capture details, and privacy notes: see the design doc
> (`Issue-Intake-Design.md`) produced alongside this brief.
