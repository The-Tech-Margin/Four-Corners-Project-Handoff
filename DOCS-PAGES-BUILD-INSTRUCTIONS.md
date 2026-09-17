# Build Instructions — In-App Documentation Pages (`/docs`)

> Hand this file to Claude Code. It specifies how to build theme-aware, in-app
> documentation pages for the Four Corners app. A verified reference
> implementation already exists in the working tree (see **Current state**);
> your job is to finalize it, confirm it builds, or rebuild it to spec.

## Objective

Add in-app documentation under `/docs` that **inherits the app's runtime theme**
(dark/light + persona palettes) automatically, with a **public** surface and an
**auth-gated** comprehensive surface. The field content must be **generated from
the existing source of truth**, not hand-maintained.

- **Public** (`/docs`): getting started (account → sign-in → editor → publish),
  a high-level tour of the four corners, and how to browse the public gallery.
  **No API content of any kind on the public page.**
- **Auth-gated** (`/docs/creator`): comprehensive field-by-field reference for
  every corner, cross-cutting data (location, EXIF, voice), publishing/visibility
  states, and the **public API reference (gated only)**.

## Hard constraints

1. **Additive only. No breaking changes.** Create new files. The only permitted
   edit to an existing file is adding one `package.json` script key. Do not edit
   `globals.css`, `layout.tsx`, `ci.yml`, or any component.
2. **No new dependencies.**
3. **Theme via tokens only.** Never hardcode colors. Every color must resolve
   from the app's `--fc-*` CSS variables so pages inherit dark/light + persona.
4. Must pass `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

## Conventions to follow (verified against this repo)

- **Path alias:** `@/*` → repo root (`tsconfig.json`).
- **Page layout pattern** (copy from `app/about/page.tsx`):
  ```tsx
  <div className="min-h-screen bg-surface flex flex-col">
    <AppHeader />            {/* from @/components/app-header */}
    <div className="h-14 sm:h-16" />   {/* header spacer */}
    <main className="flex-1"> … </main>
  </div>
  ```
  Use the existing themed utility classes `fc-view-heading` / `fc-view-text`
  for headings/body where convenient.
- **Theme model:** dark is the default; `html.light` toggles light mode; persona
  palettes are applied as `--fc-*` overrides on `document.documentElement`.
  Because the theme lives on `<html>`, any page under `app/` inherits it.
  Relevant tokens: `--fc-bg`, `--fc-surface`, `--fc-text`, `--fc-text-secondary`,
  `--fc-text-muted`, `--fc-border`, `--fc-accent`, and the four corner colors
  `--fc-corner-context`, `--fc-corner-links`, `--fc-corner-backstory`,
  `--fc-corner-cc`. Pass per-corner color into components as a CSS custom property
  (e.g. `style={{ "--accent": "var(--fc-corner-context)" }}`).
- **Auth gate** (copy exactly from `app/dashboard/page.tsx`):
  ```tsx
  export const dynamic = "force-dynamic";
  // inside the async page component:
  const cookieStore = await cookies();
  const isDevAuth = isDevAuthEnabled() && cookieStore.get(DEV_AUTH_COOKIE)?.value === "true";
  if (!isDevAuth) {
    const supabase = await createClient();            // @/lib/supabase/server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/?auth=required");
  }
  ```
  Imports: `cookies` from `next/headers`, `redirect` from `next/navigation`,
  `createClient` from `@/lib/supabase/server`,
  `{ DEV_AUTH_COOKIE, isDevAuthEnabled }` from `@/lib/dev-auth`.
- **Generator precedent:** `scripts/generate-types-doc.ts`, run via `npx tsx`,
  with a CI "freshness check" (`git diff --exit-code`) in `.github/workflows/ci.yml`.
  Follow this pattern.
- **Scoped styles:** use a CSS module (`*.module.css`) co-located with the pages.
  It is the only place global rules may appear, and only via `:global()` inside a
  `@media print` block (to hide the global header/footer when printing a doc).

## Source of truth for generated content

Read these (do not modify):

- `lib/field-registry.ts`
  - `FIELD_REGISTRY: Record<string, FieldDefinition>` — each entry has
    `path`, `label`, `uiSection`, `canvasCorner`, `required`, `canvasPlaceholder`,
    and an optional `iiif` mapping. Group fields by `uiSection`:
    - `backstory` → **Backstory** corner
    - `caption-credit-ethics` → **Authorship** corner (a.k.a. Ethics & Rights)
    - `location` → cross-cutting **Geographic location**
    - `camera-metadata` → cross-cutting **Camera / EXIF**
  - Zod schemas for the collection corners (not in `FIELD_REGISTRY`):
    `ContextItemSchema` → **Context** corner (caption, description, credit, date,
    type), `LinkSchema` → **Links** corner (title, url, source),
    `VoiceTranscriptionSchema` → cross-cutting **Voice**.
- `lib/openapi-spec.ts` — `buildOpenAPISpec(baseUrl)` returns the OpenAPI object;
  read `.info` and `.paths` for the API reference table.

The four corners, in canvas order (UL, UR, LL, LR) and their tokens:

| Corner | Position | Token (`--fc-corner-…`) | Source |
|---|---|---|---|
| Context (Related Imagery) | Upper-Left | `context` | `ContextItemSchema` |
| Links (External References) | Upper-Right | `links` | `LinkSchema` |
| Backstory (Photographer's Voice) | Lower-Left | `backstory` | `FIELD_REGISTRY` `uiSection=backstory` |
| Authorship (Ethics & Rights) | Lower-Right | `cc` | `FIELD_REGISTRY` `uiSection=caption-credit-ethics` |

**Visibility states** to document (from `VISIBILITY-STATES.md`): a project is
public only when `published === true && in_gallery === true`; `published` alone =
shareable-by-link but unlisted; both false = private draft.

## Files to create

```
scripts/generate-docs.ts            # generator: source → app/docs/_data/docsData.{ts,json}
app/docs/_data/docsData.ts          # GENERATED typed module (consumed by pages)
app/docs/_data/docsData.json        # GENERATED data (for tooling / PDF renderer)
app/docs/docs.module.css            # scoped styles + @media print
app/docs/_components/DocsUI.tsx      # server components: CornerDiagram, CornerCard,
                                     #   CornerSummary, CrossCard, Steps,
                                     #   VisibilityTable, ApiTable, Callout, Badge
app/docs/page.tsx                    # PUBLIC: getting started + corners + gallery (no API)
app/docs/creator/page.tsx            # AUTH-GATED: full field reference + cross-cutting
                                     #   + visibility states + API reference
```

### Generator (`scripts/generate-docs.ts`)

- Import `FIELD_REGISTRY`, `ContextItemSchema`, `LinkSchema`,
  `VoiceTranscriptionSchema` from `../lib/field-registry.ts` and
  `buildOpenAPISpec` from `../lib/openapi-spec.ts`.
- Introspect Zod schemas via `schema.shape` (unwrap `ZodOptional`/`ZodDefault` to
  detect `required`; read `ZodEnum.values` for option lists).
- Keep all hand-written prose in a single `EDITORIAL` object (onboarding steps,
  each corner's "what it holds" / "why it matters", cross-cutting notes). This is
  the only content a human edits; field data is always extracted.
- Emit a typed module: `export const docsData: DocsData` plus exported types
  (`DocsData`, `DocCorner`, `DocField`, `DocApi`, `DocStep`, `DocVisibility`,
  `DocCross`). Also emit the same object as `docsData.json`.
- Add a banner comment marking the data files as generated.

### Components (`app/docs/_components/DocsUI.tsx`)

- Server components (no `"use client"`). Import types from `../_data/docsData`.
- Resolve corner colors as `var(--fc-corner-<token>)` and pass via inline CSS
  custom properties. For inline custom props in TS, cast:
  `style={{ "--accent": color } as React.CSSProperties}` (import `CSSProperties`
  and `ReactNode` as types from `react`; do **not** rely on a global `React`).

### Pages

- `app/docs/page.tsx` — **public**, no auth gate. Sections: getting-started steps,
  four-corner diagram + brief per-corner summaries (no field tables), gallery
  browsing prose, and a callout linking to `/docs/creator`. **No mention of the
  API.**
- `app/docs/creator/page.tsx` — **auth-gated** (pattern above) + `dynamic`. Full
  `CornerCard` field tables for all four corners, cross-cutting cards, the
  visibility-states table, and the API reference table. Add a one-line tip that
  browser Print → Save as PDF exports the guide.

## Wiring

- `package.json`: add `"generate:docs": "npx tsx scripts/generate-docs.ts"` next
  to the existing `generate:types`.
- `.github/workflows/docs.yml` (new, standalone — do not edit `ci.yml`): on
  changes to `lib/field-registry.ts`, `lib/openapi-spec.ts`,
  `scripts/generate-docs.ts`, or `app/docs/_data/**`, run `npm run generate:docs`
  then `git diff --exit-code app/docs/_data` to fail if the committed data is
  stale. Use `node-version: 20` and `npm ci --legacy-peer-deps` to match `ci.yml`.

## Acceptance criteria

- [ ] Visiting `/docs` while logged out renders fully and shows **no API content**.
- [ ] Visiting `/docs/creator` while logged out redirects to `/?auth=required`;
      while logged in it renders the full reference incl. the API table.
- [ ] Toggling the app between dark/light and switching persona palettes
      restyles the docs with **no page-specific overrides** (tokens only).
- [ ] Corner accents match the editor (`--fc-corner-*`).
- [ ] `npm run generate:docs` reproduces `app/docs/_data/*` with no diff.
- [ ] `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass.

## Verification commands

```bash
npm run generate:docs
git diff --exit-code app/docs/_data        # must be clean after generation
npx tsc --noEmit
npm run lint
npm run build
npm run dev                                 # then load /docs and /docs/creator, toggle theme
```

## Current state (reference implementation already in the tree)

These files were created and verified in a Cowork session (tsc + eslint clean;
`next build` not run there because Google Fonts fetch is blocked in that sandbox):

```
scripts/generate-docs.ts
app/docs/_data/docsData.ts, docsData.json
app/docs/docs.module.css
app/docs/_components/DocsUI.tsx
app/docs/page.tsx
app/docs/creator/page.tsx
package.json  (added "generate:docs")
.github/workflows/docs.yml
```

**Your task:** verify these against the acceptance criteria, run the verification
commands (especially `npm run build`), and fix anything the sandbox could not
check. If you prefer a clean-room build, delete the files above and rebuild from
this spec.
