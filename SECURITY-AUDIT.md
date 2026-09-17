# Security Audit & Dependency SBOM

_Generated 2026-05-14 against `four-corners-metadata@0.1.0` on `main`._

The companion machine-readable SBOM is at [`SBOM.json`](./SBOM.json) (CycloneDX 1.5,
160 production components, generated with `npm sbom --omit=dev`).

Regenerate at any time with:

```bash
npm sbom --sbom-format=cyclonedx --omit=dev > SBOM.json
```

---

## Application-level posture

What's already in place (verified during this pass):

| Concern | Where it lives | Status |
|---|---|---|
| Auth-gated API routes | `app/api/admin/**`, `app/api/invites/accept`, etc. | All check `verifyAdminSession()` / `isCurrentUserAdmin()` (admin) or token + status (invites accept). |
| RLS on every table | `supabase/migrations/*` | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every user-facing table; service-role-only tables (`user_invites`) have no policies so they're locked unless service-role. |
| Rate limiting | `lib/rate-limit.ts`, `proxy.ts` | Supabase-backed sliding window across 4 tiers (`ai`/`write`/`read`/`admin`). Fail-open on Supabase outage. SHA-256-hashed identifiers. |
| Anti-enumeration on invite request | `app/api/invites/request/route.ts` | Same generic 200 response for new-email / duplicate-request / existing-user paths. |
| Image leakage deterrence | `components/image-protection.tsx`, `app/globals.css` | Global `contextmenu`/`dragstart` interception + CSS `-webkit-user-drag: none`. Deterrence only — DevTools still works. |
| OWASP-relevant patterns | `lib/security/sanitize.ts`, `lib/api-error.ts`, `proxy.ts` | Registry-driven sanitize for user input; consistent error shape; auth-gated proxy. |
| Secrets handling | `.env.local`, Vercel env vars | No secrets committed. Service-role key only used server-side; anon key is in `NEXT_PUBLIC_*` (correct — public by design). |
| CSP / SOP | `proxy.ts` | _Not currently set_ — see "Recommendations" below. |
| `dangerouslySetInnerHTML` | `app/layout.tsx`, error pages | One use: a hard-coded palette pre-paint script with no interpolated user input. Safe. |
| Right-click & drag protection on images | `components/image-protection.tsx` | Global, fired at root layout. |

What was checked but not changed (out of scope for this PR):

- **No CSP header** — would help against XSS but needs a careful allowlist for Supabase, Vercel Analytics, Resend domains, inline scripts, etc. Worth tackling in a dedicated pass.
- **No CSRF token** — most endpoints use Supabase JWT cookies + same-origin checks via proxy rate limiter; for admin POST routes a separate token would be belt-and-suspenders.
- **Supabase service-role key in env** — correctly server-only, but rotate periodically.

---

## Dependency vulnerabilities (`npm audit`)

```
total:    13 vulnerabilities (0 critical, 4 high, 9 moderate, 0 low)
```

### Recommended actions

| Severity | Package | Recommendation | Impact |
|---|---|---|---|
| high | `next` (direct) | `npm install next@16.2.6` (patch within current major 16) | Low — patch release, no API changes. |
| high | `flatted`, `minimatch`, `picomatch` (transitive) | `npm audit fix` | Safe — non-breaking semver bumps. |
| moderate | `ajv`, `brace-expansion`, `postcss` (transitive) | `npm audit fix` | Safe. |
| moderate | `vitest`, `@vitest/mocker`, `vite`, `vite-node`, `esbuild` (transitive via vitest) | `npm install vitest@latest @vitest/coverage-v8@latest` | **Breaking** (vitest major bump). Test suite needs re-running afterward. |
| moderate | `@vitest/coverage-v8` (direct, dev-only) | Same as above. | Dev-only — production not affected. |

### Why this PR doesn't auto-fix

The user constraint on the work that produced this audit was _"no regressions, no production breakage"_. `npm audit fix` for the non-breaking subset is safe, but the vitest-related fixes require a coordinated bump that re-runs the test suite. Left as a follow-up so it gets its own PR + CI run for clear bisect.

If you want the non-breaking subset only:

```bash
# Production: applies the patches that don't require major-version bumps
npm audit fix

# Verify nothing regressed
npm run lint && npx tsc --noEmit && npm test
```

For the vitest cluster, a separate PR is recommended.

### Production vs. dev impact

Of the 13 advisories:
- **Production-runtime impact**: `next` (high) and the `postcss`/`ajv`/`brace-expansion`/`flatted`/`minimatch`/`picomatch` chain. All have non-breaking fixes available.
- **Dev / test-only**: the entire `vitest`/`vite`/`esbuild` cluster. Production bundle never ships them.

---

## SBOM contents (top-level direct deps)

Generated from `package.json` for quick eyeballing — the authoritative graph is in [`SBOM.json`](./SBOM.json).

The 160 production components are predominantly:
- `next@16.1.1`, `react@19.2.3`, `react-dom@19.2.3`
- `@supabase/supabase-js`, `@supabase/ssr`
- `zustand`, `zod`
- `konva@9.3.22`, `react-konva`, `@fourcorners/canvas`
- `framer-motion`, `motion-dom`
- `@vercel/analytics`, `@vercel/speed-insights`
- `react-hot-toast`, `lucide-react`
- `jszip`, `pako` (export pipeline)
- `tailwindcss` (v4) via PostCSS

---

## How to refresh this audit

```bash
# Re-run vulnerability scan
npm audit

# Re-generate SBOM
npm sbom --sbom-format=cyclonedx --omit=dev > SBOM.json

# Bump this file's "Generated …" header date and re-commit.
```
