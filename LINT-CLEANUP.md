# Lint Cleanup

The CI `lint-and-typecheck` job is chronically red on a baseline of pre-existing
ESLint **errors** (warnings don't fail CI). This is unrelated to any one feature
PR — branches inherit the red baseline. This doc tracks the findings so the
cleanup can be done as a standalone task.

> Typecheck (`tsc`) is **clean** — the failure is ESLint errors only.

## Current snapshot — 2026-06-12

Run: `npx eslint .` (script: `npm run lint`)

**78 errors / 102 warnings across 19 files.**

### Errors by rule

| Count | Rule | Notes |
|------:|------|-------|
| 54 | `@typescript-eslint/no-explicit-any` | Bulk of the debt; mostly test files + `scripts/generate-types-doc.ts`. Replace `any` with real types or `unknown`. |
| 8 | `react-hooks/set-state-in-effect` | `setState` called directly in an effect body; refactor to avoid the render loop. |
| 6 | `@next/next/no-html-link-for-pages` | Internal navigation using `<a>` instead of `next/link` — in the error/not-found pages. |
| 5 | `react/no-unescaped-entities` | Literal `'`/`"`/`&` in JSX text; escape or move to expressions. |
| 3 | `react-hooks/preserve-manual-memoization` | Manual memo deps the compiler can't preserve. |
| 1 | `react-hooks/immutability` | Mutating a value that should be treated as immutable. |
| 1 | `prefer-const` | `let` never reassigned. |

### Files with errors

| Errors | File |
|-------:|------|
| 13 | `__tests__/canvas-editor.test.ts` |
| 12 | `__tests__/dev-auth.test.ts` |
| 9 | `__tests__/canvas-bridge.test.ts` |
| 9 | `scripts/generate-types-doc.ts` |
| 6 | `app/error.tsx` |
| 5 | `app/explore/[slug]/components/FlowCanvas3D.tsx` |
| 4 | `__tests__/canvas-transform.test.ts` |
| 4 | `__tests__/search-projects.test.ts` |
| 4 | `app/global-error.tsx` |
| 2 | `__tests__/projects-transforms.test.ts` |
| 2 | `components/viewer/fc-link-overlay.tsx` |
| 1 | `app/not-found.tsx` |
| 1 | `components/four-corners-error-animation.tsx` |
| 1 | `components/location-capture.tsx` |
| 1 | `components/theme-toggle.tsx` |
| 1 | `components/viewer/fc-fullscreen-viewer.tsx` |
| 1 | `hooks/use-canvas-hover.ts` |
| 1 | `hooks/use-voice-recorder.ts` |
| 1 | `lib/dev-auth.ts` |

### Observations

- **~60% of errors are in `__tests__/*`** (40 of 78). Tests lean on `any` for
  mocks/fixtures. A targeted pass on the 5 test files clears the largest chunk.
- **`scripts/generate-types-doc.ts` (9)** is a build/codegen script — lower risk
  to type loosely; could alternatively be scoped out via an eslint override.
- **Error pages** (`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`)
  account for the `no-html-link-for-pages` and `no-unescaped-entities` errors —
  small, self-contained cluster.
- `FlowCanvas3D.tsx` (5) is the legacy 3D explore component; the inline explore
  view uses `ExploreCanvasVisx.tsx` instead.

## Suggested approach

1. Land the cleanup on its own branch/PR (don't bundle into feature PRs).
2. Order by ROI: test files → error pages → codegen script → remaining singletons.
3. Prefer real types over `any`; use `unknown` + narrowing where the shape is
   genuinely dynamic. Avoid blanket `// eslint-disable` unless justified inline.
4. Keep warnings (102) out of scope for the CI-unblock; they don't fail the gate.
