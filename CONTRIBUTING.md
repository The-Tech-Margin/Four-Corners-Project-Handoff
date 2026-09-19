# Contributing

Issues and pull requests are welcome. For anything larger than a bug fix,
open an issue first so the approach can be agreed before you write it.

Security problems do not belong in issues — see [`SECURITY.md`](SECURITY.md).

## Setup

```bash
nvm use            # Node 22+
npm install
cp .env.example .env.local
npm run dev
```

The app runs on local adapters with no external services; data lives in
`.data/`.

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same four, plus a check that the generated files are current.
If you change the model (`lib/field-registry.ts`, `lib/schema.ts`,
`lib/export-contract.ts`) or the OpenAPI spec, regenerate and commit:

```bash
npm run generate:schema
npm run generate:docs
```

The pre-commit hook does this for you when it sees those files staged.

## Conventions

- Branch from `main`; one topic per pull request.
- Commit messages: `Action: what changed` — `Fix: quota check on replace`,
  `Add: S3 blob adapter`.
- TypeScript: no `any` without a reason on the same line, explicit return
  types on exports, types inferred from the Zod schemas rather than
  duplicated.
- Components use named exports. Pure logic lives in standalone functions
  with unit tests; tests build their data with a local `fixture()` and
  assert explicitly — no snapshots.
- Colours come from the CSS variables in `app/globals.css`; see
  [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) and
  [`ACCESSIBILITY.md`](ACCESSIBILITY.md).
- New integrations go behind a port: an interface in `lib/ports/`, an
  adapter in `lib/adapters/`, and the contract in
  `__tests__/local-adapters.test.ts`. See
  [`docs/INTEGRATION.md`](docs/INTEGRATION.md).
- Never commit secrets, `.env.local`, or anything under `.data/`.

## Licence

By contributing you agree that your contribution is licensed under the
project's [MIT licence](LICENSE).
