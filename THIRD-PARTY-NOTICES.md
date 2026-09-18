# Third-party notices

Four Corners — system design & build: TheTechMargin. This project is MIT
licensed; the components below carry their own terms.

## Bundled and vendored

**@fourcorners/canvas** — MIT. Vendored as source in `packages/canvas/` from
[The-Tech-Margin/Open-Canvas-Metadata-Create](https://github.com/The-Tech-Margin/Open-Canvas-Metadata-Create)
at tag `Open-4C-v1.3` (commit `80bd2de`). Its licence is kept in
`packages/canvas/LICENSE`.

**heic2any** — MIT, and its browser bundle embeds a compiled **libheif**
(LGPL-3.0). It is used to convert HEIC photos in the browser. If you
redistribute a build of this app, the LGPL terms apply to that embedded
library: keep this notice, and make the libheif source available from
https://github.com/strukturag/libheif.

**JSZip** — dual licensed MIT or GPL-3.0-or-later. **This project uses it
under the MIT licence.** It bundles pako (MIT AND Zlib).

**Geist** and **Geist Mono** — SIL Open Font License 1.1, fetched at build
time by `next/font/google` and served from this app.

## Referenced, not bundled

**fourcorners.js** — MIT, Copyright (c) 2019 Four Corners Project.
https://github.com/four-corners/fourcorners.js — exported HTML loads the
viewer from a pinned CDN URL, which you can point at your own copy with
`NEXT_PUBLIC_FC_VIEWER_CDN_BASE`. Four Corners as a framework for
photographic context originates with the Four Corners Project
(https://fourcornersproject.org); this app is an independent implementation
of that idea and is not affiliated with or endorsed by it.

**IIIF** — exports follow the IIIF Presentation API 3.0 specification.

## Runtime dependencies

MIT unless noted: next, react, react-dom, zustand, zod, framer-motion,
react-hot-toast, react-masonry-css, react-virtuoso, exifr, konva,
react-konva, react-konva-utils, @visx/responsive.

ISC: lucide-react, d3-hierarchy, idb.

Apache-2.0: typescript (development only).

Run `npm run lint` and `npx license-checker` (or your preferred tool)
against `package-lock.json` for the full transitive list before shipping a
build.
