# Four Corners

A platform for documenting photographs and places using a structured four-part metadata model: **Imagery**, **Links**, **Backstory**, and **Authorship & Ethics**. Four Corners gives photographers, archivists, and researchers a way to attach rich, standards-based context to visual media — then publish, share, and query it through a full API.

## Features

### Structured Metadata Editor

A scroll-based editor driven by a central field registry — every field has a Zod schema, database mapping, sanitization rule, and export shape defined in one place. Upload photos with automatic EXIF extraction, attach context items (notes, documents, references), and record voice notes transcribed in real time.

### AI-Powered

- **Voice transcription** — record directly in the browser, transcribed via Whisper and stored alongside your project.
- **Semantic search embeddings** — each project gets a vector embedding on save, enabling meaning-based discovery.
- **Hybrid search** — combines full-text keyword ranking with cosine similarity for results that understand intent, not just words.

### Full Public API

A read-only HTTP API exposes the public gallery with 13 endpoints organized around the four corners model. Ships with an OpenAPI 3.1 spec, Postman collection, and optional Bearer-token authentication for higher rate limits. See the [full API reference](#public-api) below.

### Admin Dashboard

A complete back-office at `/admin/` with role-based access:

- **Users** — manage accounts, view per-user storage usage, assign roles
- **Analytics** — usage trends and activity charts
- **Performance** — server and client performance metrics
- **Rate Limits** — real-time visualization and management
- **Palettes** — create and edit persona color themes
- **Content** — moderation tools
- **Invites** — track and manage user onboarding
- **Settings** — global configuration
- **Storage** — system-wide storage analytics and monitoring

### Theming & Personas

A CSS-variable design system (`--fc-*` tokens) with dark and light modes. Per-persona palette overrides are stored in the database and applied at runtime — switch the entire look of the app without a redeploy. Each of the four corners carries its own accent color (cyan, purple, lime, orange) that flows through borders, indicators, and UI accents.

### Publishing & Export

- **Share links** — publish a project to generate a public URL at `/p/[slug]`
- **Gallery** — opt in to public discovery at `/gallery`
- **IIIF 3.0** — standards-based Presentation manifest with geographic navPlace extension
- **HTML export** — standalone single-file or multi-file bundle
- **ZIP export** — downloadable archive with all assets
- **Self-contained export** — one HTML file with embedded assets, zero dependencies

### Invite-Gated Access

New users request access via email, an admin approves, and a token link grants entry. Email delivery via Resend with console fallback for local development.

### Storage Quotas

Per-file size caps (images 25 MB, video 100 MB, audio 60 MB, documents 20 MB) and per-user plan tiers (Free 1 GB, Pro 10 GB, Team 50 GB, Unlimited). Usage is tracked per-asset and surfaced in the user menu, library modal, and admin user list.

### Location-Aware

PostGIS-backed geographic metadata with proximity search. Attach coordinates and addresses to any project, then query by distance.

### Security

- **Rate limiting** — Supabase-backed sliding-window counting with four tiers (AI, write, read, admin) plus public API tiers
- **Row Level Security** — every table enforces ownership at the database level
- **Input sanitization** — field-registry-driven rules applied on every write
- **Proxy-level gating** — Next.js proxy blocks dev-only routes in production

## Architecture

### Stack

- Next.js 16.1.1 (App Router), React 19.2.3, TypeScript
- Tailwind v4
- Zustand for global state, Zod for validation
- Supabase — Postgres + PostGIS + Row Level Security + Auth + Storage
- OpenAI via Vercel AI Gateway
- Vitest for tests

### Data Model

Projects are stored across normalized tables with RLS and `ON DELETE CASCADE`:

- `project_ethics`, `project_locations` (PostGIS), `photo_metadata` — all 1:1
- `context_items` (1:many), `context_item_audio` (junction), `voice_transcriptions`
- `persona_palettes`, `rate_limit_log`, `user_plans`, `user_assets`

Reads assemble project objects from normalized columns via `buildMetadataFromNormalized`. Field definitions are centralized in `lib/field-registry.ts`.

### Key Paths

| Area | Path |
|---|---|
| Field registry | `lib/field-registry.ts` |
| Project CRUD | `lib/db/projects.ts` (barrel), `projects-crud.ts`, `projects-queries.ts`, `projects-transforms.ts` |
| Zustand store | `lib/store.ts` |
| Layout modes | `lib/layout-modes.ts` |
| AI gateway | `lib/ai-gateway.ts` |
| Rate limiting | `lib/rate-limit.ts`, `proxy.ts` |
| Sanitization | `lib/security/sanitize.ts` |
| IIIF export | `lib/exportIIIF.ts` |
| Theming | `lib/palette.ts`, `lib/persona.ts`, `app/globals.css` |
| Admin auth | `lib/admin-auth.ts`, `lib/admin-roles.ts` |

### Further Reading

- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — tokens, surfaces, personas
- [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) — WCAG targets, keyboard shortcuts
- [`SECURITY.md`](./SECURITY.md) — rate limiting, API inventory
- [`TYPES.md`](./TYPES.md) — canonical data model
- [`VISIBILITY-STATES.md`](./VISIBILITY-STATES.md) — published vs in_gallery
- [`STORAGE-QUOTA.md`](./STORAGE-QUOTA.md) — per-file caps, plan quotas, admin monitoring

## Public API

A read-only HTTP API exposes the public 4C gallery. Projects are returned **only** when `published = true AND in_gallery = true`. Routes are organised around the four corners of a project — Context (UL), Links (UR), Backstory (BL), Ethics & Rights (BR) — plus cross-cutting metadata (location, EXIF, voice transcriptions) and an IIIF Presentation 3.0 manifest.

### Base URL

All endpoints live under the `/api/public/v1` prefix:

```
https://<your-host>/api/public/v1
```

**Production (stable — use this for Postman and clients):**

```
https://fourcorners.thetechmargin.com/api/public/v1
```

Other valid hosts: `https://fourcorners.vercel.app/api/public/v1` (Vercel-managed production alias) and `https://fourcorners-git-main-thetechmargin.vercel.app/api/public/v1` (tracks `main`). Per-branch preview URLs (`fourcorners-git-<branch>-...`) work too but are **ephemeral** — never hard-code one into a client; it dies when the branch is deleted.

### Endpoints

| Method | Path | Description |
| :----- | :--- | :---------- |
| GET | `/` | API index — lists every endpoint |
| GET | `/openapi.json` | OpenAPI 3.1 spec (Postman-importable) |
| GET | `/gallery` | Paginated gallery feed (`limit`, `offset`, `sort=newest\|oldest\|random`, `tag`) |
| GET | `/projects/{slug}` | Full project (all four corners + cross-cutting) |
| GET | `/projects/{slug}/children` | Daisy-chained child projects |
| GET | `/projects/{slug}/context` | UL — Context (related imagery) |
| GET | `/projects/{slug}/links` | UR — Links (external references) |
| GET | `/projects/{slug}/backstory` | BL — Backstory (photographer narrative) |
| GET | `/projects/{slug}/ethics` | BR — Ethics & Rights (CC + ethics + photographer) |
| GET | `/projects/{slug}/location` | Geographic location (lat/lon + address) |
| GET | `/projects/{slug}/photo-metadata` | EXIF / camera metadata |
| GET | `/projects/{slug}/voice-transcriptions` | Voice recordings + transcriptions |
| GET | `/projects/{slug}/iiif` | IIIF Presentation 3.0 manifest |

### Authentication (optional Bearer token)

**Every endpoint works without authentication.** Supplying a valid API key as a Bearer token is optional and only raises your rate limit:

```
Authorization: Bearer YOUR_API_KEY
```

| | No key | With a valid key |
| :--- | :--- | :--- |
| Tier | `public` | `public_keyed` |
| Limit | 100 requests / min **per IP** | 1000 requests / min **per key** |

Keys are configured server-side via the `PUBLIC_API_KEYS` environment variable (comma-separated). When it is unset, no key is valid and every request is treated at the lower tier (still served). The proxy resolves the tier per request in `proxy.ts` → `resolvePublicApiRateLimit()`.

Every response carries quota headers; a `429` additionally includes `Retry-After`:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 998
X-RateLimit-Reset: 2026-05-16T17:31:00.000Z
```

### Examples

```bash
# No key — works, limited to 100/min per IP
curl https://<host>/api/public/v1/gallery?limit=12

# With key — 1000/min per key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://<host>/api/public/v1/projects/my-project-slug

# Just the Ethics & Rights corner
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://<host>/api/public/v1/projects/my-project-slug/ethics
```

### Postman

**Published API documentation:** [documenter.getpostman.com/view/54883007/2sBXqRiwAo](https://documenter.getpostman.com/view/54883007/2sBXqRiwAo) — browsable reference with request examples. This link is also surfaced in-app under the **Menu** for signed-in users.

Two ways to get a working collection:

1. **Import the live spec** — in Postman, **Import → Link** and paste `https://<host>/api/public/v1/openapi.json`.
2. **Use the bundled files** — import [`postman/four-corners-public-api.postman_collection.json`](./postman/four-corners-public-api.postman_collection.json) and [`postman/four-corners-public-api.postman_environment.json`](./postman/four-corners-public-api.postman_environment.json), select the environment, then set:
   - `baseUrl` — pre-filled with the stable production URL `https://fourcorners.thetechmargin.com/api/public/v1`. Change it only to test a specific preview deployment.
   - `apiKey` — your key (optional; leave blank for unauthenticated access). It is wired as the collection-level Bearer token, so it applies to every request automatically.
   - `slug` — a project slug, used by the `/projects/{{slug}}/*` requests.

### Operators: setting up API keys

Keys are not generated by the app — they are arbitrary secret strings you choose and list in the `PUBLIC_API_KEYS` env var. Validation is an exact string match. One-time setup:

1. **Generate one key per consumer** (so they can be revoked independently) on a trusted machine:

   ```bash
   openssl rand -hex 32
   ```

   Prefix for readability, e.g. `postman_<hex>`, `partner_acme_<hex>`.

2. **Add them to Vercel** (project `four_corners`): **Settings → Environment Variables** → add `PUBLIC_API_KEYS` with the comma-separated list, scoped to **Production** (and **Preview** if you test preview deploys):

   ```
   PUBLIC_API_KEYS=postman_9f2c…,partner_acme_4b81…
   ```

3. **Redeploy.** Env vars only take effect on deployments created *after* they're set — trigger a new production deployment (or redeploy the latest).

4. **Distribute** one key per consumer over a secure channel. Each client sends `Authorization: Bearer <their-key>` to reach the `public_keyed` tier (1000/min per key); unauthenticated callers still work at 100/min per IP.

5. **Verify** with any endpoint — check the response header: `X-RateLimit-Limit: 1000` means the key was accepted, `100` means it fell back to unauthenticated (missing/typo'd key or env not redeployed).

**Rotation / revocation:** edit the comma list and redeploy. Removed keys immediately drop to the lower tier; no other state to clean up. Never commit a real key — the bundled Postman environment ships with `apiKey` empty by design; keep it that way in version control.

## Development

```bash
npm install
npm run dev
npm run test
npm run build
```

Required env vars: Supabase URL + anon key, Vercel AI Gateway key. See `lib/ai-gateway.ts` and `lib/supabase/` for the exact names. Optional: `PUBLIC_API_KEYS` (see [Public API](#public-api)), `NEXT_PUBLIC_API_DOCS_URL` — overrides the "API Docs" link in the app menu (defaults to the published Postman API docs; set per environment in Vercel).

### Invite flow (email-gated access)

New users go through a request → admin-approval → token-link flow. Email delivery uses Resend; the following env vars enable real sends — when any are missing the transport logs to console and the flow still works locally.

- `RESEND_API_KEY` — Resend API key
- `RESEND_FROM_EMAIL` — verified sending address, e.g. `Four Corners <hi@yourdomain>`
- `ADMIN_NOTIFY_EMAIL` — inbox that receives new-request notifications
- `NEXT_PUBLIC_SITE_URL` — origin used in invite links (falls back to the request origin)

## License

See [`LICENSE`](./LICENSE).
