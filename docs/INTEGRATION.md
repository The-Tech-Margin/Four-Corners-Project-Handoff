# Integration guide

Everything this app needs from the outside world goes through a typed
interface in `lib/ports/`. Each one ships with two implementations:

- `lib/adapters/local/*` — runs on a laptop with no accounts and no network.
  Data lands in `.data/`. This is the default.
- `lib/adapters/stub/*` — throws `NotConfiguredError` with the name of the
  port and the environment variable that selects it. Start here when you
  write your own.

`lib/adapters/index.ts` picks one per port and hands them to route handlers.
Nothing in the browser imports an adapter: the browser talks to this app's
own API routes, and only the server talks to an integration.

Select an adapter per port, or set them all at once:

```bash
FC_ADAPTER_DEFAULT=local   # local | stub
FC_AUTH_ADAPTER=local
FC_DATA_ADAPTER=local
FC_BLOB_ADAPTER=local
FC_SEARCH_ADAPTER=local
FC_AI_ADAPTER=local
FC_EMAIL_ADAPTER=local
FC_RATE_LIMIT_ADAPTER=local
FC_GEOCODER_ADAPTER=local
```

Author: @thetechmargin · MIT

---

## AuthPort — `lib/ports/auth.ts`

Accounts, sessions and password resets.

- **Local**: accounts in `.data/db/users.json`, scrypt password hashes, a
  session cookie signed with `FC_SESSION_SECRET` (generated into `.data/`
  when unset outside production). Reset tokens are single-use and last an
  hour.
- **A production adapter must**: never store a password in the clear; issue
  a credential `peekSession` can check without a data lookup, because the
  proxy gates every page with it; invalidate existing sessions when a
  password changes; and answer `requestPasswordReset` identically whether or
  not the address has an account, so the endpoint cannot be used to discover
  who does.

## ProjectRepository — `lib/ports/projects.ts`

Storage for the project document described in `docs/OBJECT-MODEL.md`.

- **Local**: one JSON collection, rewritten atomically under a lock.
- **A production adapter must**: keep `update` atomic — it is a
  read-modify-write and the visibility rules decide from the document they
  are handed; keep slugs unique; preserve array order; and scope reads and
  writes to the owner. Publishing rules live in `lib/projects/rules.ts`, not
  in the adapter, so every backend behaves the same.

## UserAssetRepository — `lib/ports/assets.ts`

One row per uploaded file. `totalBytes` runs on every upload to enforce the
quota, so make it cheap. Key rows by (owner, bucket, key) so re-uploading a
file updates one row instead of adding another.

## BlobStoragePort — `lib/ports/blob-storage.ts`

Bytes, addressed by key. Keys are opaque and must be preserved exactly: the
first segment is the owner id, which is how access is checked.

Three buckets, by visibility: `context-media` (public), `voice-recordings`
and `consent-documents` (private). Public here means "anyone with the key",
which is how draft images behave — if that is too loose for your
deployment, serve `context-media` through the same grant check as the
private buckets.

Objects are served by this app at `/api/blobs/<bucket>/<key>`, so an adapter
never mints vendor URLs. Support byte ranges, or audio and video scrubbing
breaks in Safari. Return the stored content type; the route serves it
verbatim with sniffing disabled.

## SearchPort — `lib/ports/search.ts`

Ranks published gallery projects for a query.

- **Local**: keyword ranking over the documents, weighted like the original
  full-text index (title, author and tags first).
- **Semantic search**: implement `searchGallery` against your vector store
  and set `capabilities.semantic`, which the UI reads.

## AIPort — `lib/ports/ai.ts`

Speech-to-text for voice notes, and embeddings if you want semantic search.

- **Local**: unavailable. The UI hides the transcribe controls rather than
  offering a button that fails.
- **A production adapter must** report both capabilities honestly. The
  original deployment used Whisper for transcription and 1536-dimension
  OpenAI embeddings; any provider with those two operations fits.

## EmailPort — `lib/ports/email.ts`

Transactional mail. Today that is password resets, so a failure locks
people out.

- **Local**: prints the message, including the reset link, to the server
  console.

## RateLimitStore — `lib/ports/rate-limit.ts`

One counter, consulted by the proxy on every API request.

- **Local**: in-memory sliding window, per process.
- **A production adapter must** share state across instances and fail open:
  the app allows the request and logs when the counter is unreachable.

Tiers live in `lib/rate-limit.ts`: ai 10/min per user, write 30/min per
user, read 100/min per IP, auth 10/min per IP, external 30/min per IP, and
the public API at 100/min per IP or 1000/min per key.

## GeocoderPort — `lib/ports/geocoder.ts`

Turns coordinates into a place name, server-side so no third party sees a
visitor's address.

- **Local**: unavailable; coordinates still save and the place name is
  typed by hand.
- Respect your provider's usage policy and attribution terms.

---

## Writing an adapter

1. Copy the matching file from `lib/adapters/stub/` into a new directory,
   e.g. `lib/adapters/postgres/projects.ts`.
2. Implement the interface. Throw the errors in `lib/ports/errors.ts` —
   `NotFoundError`, `ForbiddenError`, `ConflictError`,
   `QuotaExceededError` — and the route handlers turn them into the right
   status codes.
3. Register it in `lib/adapters/index.ts` next to the local and stub cases.
4. Run `npm test`. The adapter tests in `__tests__/local-adapters.test.ts`
   are a template for what a new adapter should satisfy.

## Other configuration

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical origin for metadata, sitemap, robots, exports and outbound user agents |
| `FC_DATA_DIR` | `.data` | Where the local adapters keep data |
| `FC_SESSION_SECRET` | generated locally | Signs session cookies and blob links; **required in production** |
| `FC_SIGNUPS_ENABLED` | `true` | Whether anyone may create an account |
| `FC_GALLERY_LIMIT_PER_USER` | unset | Cap on gallery projects per account |
| `FC_DEFAULT_PLAN` | `free` | Storage plan every account gets |
| `FC_STORAGE_LIMIT_BYTES` | unset | Overrides the plan's byte limit |
| `FC_PRIVATE_URL_TTL_SECONDS` | `600` | Lifetime of a signed blob link |
| `PUBLIC_API_KEYS` | unset | Comma-separated keys that unlock the higher public-API rate limit |
| `NEXT_PUBLIC_EXPLORE_ENABLED` | `true` | Shows the Explore tab to viewers |
| `NEXT_PUBLIC_FC_VIEWER_CDN_BASE` | pinned jsDelivr URL | Where exported HTML loads the Four Corners viewer from |
