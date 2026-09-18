# @fourcorners/canvas (vendored)

Konva canvas engine used by the sketchboard and explore views.

- Upstream: https://github.com/The-Tech-Margin/Open-Canvas-Metadata-Create
- Tag: `Open-4C-v1.3` (commit `80bd2de42d81d24ddeaa440023496d0789f31d13`), MIT — see `LICENSE`.
- Vendored as TypeScript source and compiled with the app (`transpilePackages` in
  `next.config.ts`), so there is no build step, no git dependency and no native
  `canvas` toolchain to install.

Excluded from the copy: the upstream build tooling (`tsup`, Storybook, Vite preview),
its tests and stories, its agent files, and its 31 MB test fixture.

To refresh it, re-copy the same paths from a newer tag rather than editing files here:

```bash
gh api repos/The-Tech-Margin/Open-Canvas-Metadata-Create/tarball/<tag> > canvas.tgz
```
