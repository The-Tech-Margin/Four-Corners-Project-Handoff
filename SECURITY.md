# Security

## Reporting a vulnerability

Report privately, not in a public issue: open a GitHub Security Advisory on
this repository, or contact whoever operates the deployment you found it on.
Include what you did, what happened, and anything needed to reproduce it.
Please allow a reasonable period to fix before disclosing. There is no bug
bounty.

## The default configuration is not production

Out of the box this app runs on local adapters: accounts, projects and
uploads live in files under `.data/`, and the session secret is generated on
first run. That is right for a laptop and wrong for anything reachable from
the internet. Before deploying:

- Set `FC_SESSION_SECRET` to a long random value. It signs session cookies
  and blob links. The app refuses to start in production without it.
- Set `NEXT_PUBLIC_SITE_URL` to the real origin.
- Replace the local adapters with implementations backed by real storage —
  see [`docs/INTEGRATION.md`](docs/INTEGRATION.md).
- Serve over HTTPS; session cookies are marked `secure` in production.

## What a production adapter must enforce

The original deployment enforced these in the database. Whatever you build,
they still have to hold — the app assumes them:

- Reads and writes are scoped to the owner. A project becomes readable by
  others only when `published`, and reaches the public API only when it is
  also `inGallery`.
- Private blobs (voice recordings, consent documents) are readable by their
  owner, by a grant tied to a published project that references them, or
  through a short-lived signed link — and by nobody else.
- Uploads respect the per-file caps and the account's storage quota.
- The rate-limit counter is shared across instances, and fails open.

## What ships in the app

- **Security headers** (`next.config.ts`): `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a referrer policy, and a permissions
  policy. There is no Content-Security-Policy yet; adding one is a good
  first hardening step.
- **Session gating**: the proxy (`proxy.ts`) checks a signed session before
  serving the editor or dashboard, and every API route re-checks it.
- **Rate limiting** by tier, including the public API's optional keys.
- **Input sanitisation** driven by the field registry
  (`lib/security/sanitize.ts`), applied on write.
- **Uploads** are validated by type and size, stored under keys prefixed
  with the owner's id, and served with sniffing disabled, a sandbox policy,
  and `Content-Disposition: attachment` for anything that is not an image,
  audio or video.
- **Outbound fetches** on a visitor's behalf (link previews) resolve DNS
  first and refuse private, loopback, link-local and metadata addresses,
  re-checking on every redirect (`lib/server/safe-fetch.ts`).
- **Redirects** after authentication are restricted to same-origin paths.
- **ZIP imports** are capped at 200 MB, 500 entries and 500 MB inflated.

## Dependencies

The baseline is Node 22 LTS (`.nvmrc`), and `npm audit` reports no known
advisories against the tree that ships here. Nothing pins a transitive
version, so re-run `npm audit` after any install — an advisory published
tomorrow is still yours to deal with.

## Secrets

Configuration comes from the environment; `.env.example` lists every
variable. Never commit `.env.local`. If a secret is ever committed, rotate
it — removing the file in a later commit does not remove it from history.
