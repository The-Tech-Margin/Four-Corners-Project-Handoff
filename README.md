# Four Corners

Document a photograph with the context that makes it readable: related
imagery, links, the backstory behind the frame, and authorship and ethics.
Publish it, share it, export it, or read it back through an API.

Built on the four-corners model — Context (upper-left), Links (upper-right),
Backstory (lower-left), Authorship & Ethics (lower-right) — plus location,
camera metadata and voice notes that cut across all four.

## Quick start

```bash
nvm use            # Node 22+
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000, create an account, and start a project. No
database, object store or API key is needed: the app runs on local adapters
that keep everything under `.data/`.

To start over: `rm -rf .data`. Password reset links are printed to the
server console, since nothing is set up to send mail.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Test suite (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run generate:schema` | Regenerate `schema/*.json` from the model |
| `npm run generate:docs` | Regenerate the in-app documentation data |

## Layout

```
app/                  routes: pages and API handlers
components/           UI
hooks/                editor state and behaviour
lib/ports/            one interface per integration
lib/adapters/local/   runs offline, data in .data/
lib/adapters/stub/    throws "not configured", with a note on what to build
lib/adapters/index.ts picks an adapter per port from the environment
lib/server/           request-side helpers: session, access, quota, services
lib/projects/         the domain model, its rules and its projections
lib/api-client/       how the browser talks to this app's own API
packages/canvas/      vendored canvas engine (MIT), compiled with the app
docs/                 object model and integration guide
schema/               generated JSON Schema
```

## Connecting real services

Everything outside the app sits behind a port, so swapping a provider means
writing one file. See [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

| Port | Selected by | Stub to start from |
|---|---|---|
| Auth | `FC_AUTH_ADAPTER` | `lib/adapters/stub/auth.ts` |
| Projects and assets | `FC_DATA_ADAPTER` | `lib/adapters/stub/projects.ts`, `stub/assets.ts` |
| Blob storage | `FC_BLOB_ADAPTER` | `lib/adapters/stub/blob-storage.ts` |
| Search | `FC_SEARCH_ADAPTER` | `lib/adapters/stub/search.ts` |
| AI (transcription, embeddings) | `FC_AI_ADAPTER` | `lib/adapters/stub/ai.ts` |
| Email | `FC_EMAIL_ADAPTER` | `lib/adapters/stub/email.ts` |
| Rate limiting | `FC_RATE_LIMIT_ADAPTER` | `lib/adapters/stub/rate-limit.ts` |
| Geocoding | `FC_GEOCODER_ADAPTER` | `lib/adapters/stub/geocoder.ts` |

Set `FC_ADAPTER_DEFAULT=stub` to see exactly which integrations a feature
needs: the app still renders, and every data route answers with the port
and variable to configure.

## Data model

[`docs/OBJECT-MODEL.md`](docs/OBJECT-MODEL.md) describes the model in
stack-neutral terms — entities, relationships, visibility rules, the
interchange format, and notes for mapping it onto a relational database.

`schema/project.schema.json` and `schema/export-bundle.schema.json` are
generated from the same Zod definitions the app validates against, so they
cannot drift. Regenerate with `npm run generate:schema`.

## Public API

A read-only API exposes gallery projects — those that are both published and
listed — under `/api/public/v1`:

```bash
curl "$SITE/api/public/v1/gallery?limit=12"
curl "$SITE/api/public/v1/projects/<slug>"
curl "$SITE/api/public/v1/projects/<slug>/backstory"   # and /context, /links, /ethics
curl "$SITE/api/public/v1/projects/<slug>/iiif"        # IIIF Presentation 3.0
```

The full description is served at `/api/public/v1/openapi.json`; import it
into any OpenAPI 3.1 client. Authentication is optional — a key from
`PUBLIC_API_KEYS`, sent as `Authorization: Bearer <key>`, raises the rate
limit from 100 to 1000 requests a minute. Every response carries
`X-RateLimit-*`.

## URL parameters

- `?layout=scroll|sketchboard` — open the editor in a given mode
- `?persona=<preset id>` — apply a colour preset from `lib/palette-presets.ts`

## Tests

```bash
npm test
```

Pure logic — visibility rules, normalisation, blob keys and URLs, session
tokens, password hashing, the SSRF guard, keyword ranking — is tested
without a browser or a server. `__tests__/local-adapters.test.ts` is the
contract a new adapter should satisfy.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in
[`SECURITY.md`](SECURITY.md), not in issues.

## License

MIT © 2026 TheTechMargin. See [`LICENSE`](LICENSE) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Author: @thetechmargin
