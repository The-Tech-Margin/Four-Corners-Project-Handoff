# Four Corners — Demo Instructions

## Editor Modes

Two editor modes, each designed for a different workflow. Both modes write to the same underlying data — switching modes mid-session preserves all work.

### Accessing Modes

**URL parameter** (best for demos):
```
/?layout=scroll        # Classic vertical editor (default)
/?layout=sketchboard   # Visual canvas editor
```

**Menu selector** (for logged-in users):
Open the hamburger menu → scroll to bottom → **Layout** section shows available modes as buttons.

**Combined with persona palette**:
```
/?layout=sketchboard&persona=reuters
/?layout=scroll&persona=documentary
```

### Mode Descriptions

| Mode | Icon | Key Feature |
|------|------|-------------|
| **Scroll** | List | Full vertical editor, all four corner sections visible, classic form-based entry |
| **Sketchboard** | PenTool | Spatial canvas editor (Konva.js), zone-based editing mapped to four corners, drawing tools |

### Scroll Mode

The default editor. All four corners are presented as vertically stacked sections:
- Caption, credit, and ethics (Authorship)
- Backstory editor with voice recording
- Context images with upload and AI analysis
- Links manager with preview scraping

Supports three data modes: minimal, standard, and complete.

### Sketchboard Mode

A spatial canvas editor built on Konva.js. Features:
- **Zone panels** — corner/zone management mapped to the Four Corners framework
- **Drawing tools** — toolbar for sketch-based annotation
- **Inline editing** — text editing directly on the canvas
- **Mini-panels** — floating action panels for context upload, ethics controls, license selection, and link adding
- **Shape system** — context items with hit-testing and overlays
- **Zoom controls** — scroll wheel, pinch-to-zoom, +/- buttons with percentage indicator, double-click zoom (all use shared `lib/canvas-zoom.ts` focal-point math)
- **Image drag-and-drop** — drop image files directly onto the canvas to set the main photo
- **Zone hover effects** — accent-color border glow when hovering over empty zones
- **Keyboard shortcuts** — +/- zoom, 0 fit, Escape close panels
- **Animated transitions** — smooth camera animation on preset switch, panel slide-in/out
- **Swipe-to-dismiss** — mobile bottom sheet panels can be swiped down to close

### Mode Behavior

- **Data persists across mode switches** — enter caption in Scroll, switch to Sketchboard, caption is there
- **Autosave works in both modes** — logged-in users get automatic cloud saves
- **Export works from either mode** — both modes have Publish and Export buttons
- **URL params are shareable** — send `/?layout=sketchboard` to open directly in canvas mode

---

## Persona Palettes

Palettes override the app's CSS variables to change colors per-organization or per-use-case. They are managed through the admin panel and applied via URL parameter.

### Applying a Palette

```
/?persona=your-palette-slug
```

The palette slug is set in the admin panel when creating/editing a palette.

### Creating Palettes (Admin)

1. Navigate to `/admin`
2. Log in with admin credentials
3. Use the palette editor to create a new palette:
   - **Slug**: URL-friendly identifier (e.g., `reuters`, `witness-org`, `documentary`)
   - **Dark overrides**: CSS variable values for dark mode
   - **Light overrides**: CSS variable values for light mode
   - **default_layout_mode** (optional): Auto-sets the editor mode when this palette loads

### Available CSS Variables

Palettes can override any semantic variable:

```css
/* Surfaces */
--fc-bg            /* Main background */
--fc-surface       /* Card/section background */
--fc-surface-alt   /* Alternate surface */
--fc-text          /* Primary text */
--fc-border        /* Border color */

/* Accent */
--fc-accent        /* Primary accent (links, focus rings) */

/* Four Corners */
--fc-corner-backstory   /* Backstory corner color (default: cyan) */
--fc-corner-context     /* Related imagery corner (default: purple) */
--fc-corner-links       /* Links corner (default: lime) */
--fc-corner-cc          /* Authorship corner (default: orange) */
```

### Palette + Mode Combination

When a palette includes `default_layout_mode`, visiting `/?persona=slug` automatically sets both the palette colors AND the editor mode. This is useful for demos where a single URL sets the entire experience:

```
/?persona=reuters       → Reuters colors + associated default mode
/?persona=witness-org   → Witness.org colors + associated default mode
```

---

## Project Visibility

Projects have a two-tier visibility system:

| published | in_gallery | Share Link Access | Gallery Visibility | Use Case |
|-----------|------------|-------------------|-------------------|----------|
| `false` | `false` | Private | Hidden | Draft/Private work |
| `true` | `false` | Anyone with link | Hidden | Shareable but not promoted |
| `true` | `true` | Anyone with link | Public gallery | Fully public work |

- **Make Shareable** → sets `published=true`, enables share link access
- **Add to Gallery** → sets `in_gallery=true` (requires published), appears in `/gallery`

---

## Explore Mode

Each project has an explore view at `/explore/[slug]/` that renders the project's metadata as a spatial graph. Two rendering paths:

- **3D** (default): React Three Fiber scene with orbitable camera, draggable cards, focus/dim interaction, and 3D bezier connection arcs. Cards are HTML elements in 3D space via `@react-three/drei Html`.
- **2D fallback**: Konva canvas with draggable shapes, grid snapping, and imperative bezier connections. Used when WebGL is unavailable.

Both paths share the same `CanvasDocument` data model and `getLayout()` grid system as the editor. The transform pipeline (`transform.ts`) converts a `ProjectRecord` into the document, generating zone shapes, photo cards, text blocks, context items, link cards, voice notes, and parent-child connections.

Interactions: orbit/pan/zoom (3D), drag cards to rearrange, click to focus a card (scales up, dims neighbors), reset view button.

---

## Demo Walkthrough

### Quick Demo (2 minutes)

1. Open `/?layout=scroll` — show the classic vertical editor
2. Upload an image — EXIF auto-populates provenance metadata
3. Type a caption — note the voice recording button
4. Add a backstory using voice-to-text
5. Switch to `/?layout=sketchboard` — same data, spatial canvas interface
6. Scroll wheel to zoom, double-click to zoom in, drag to pan
7. Hover over empty zones — note the accent-color glow
8. Drag an image file onto the canvas to set the main photo
9. Open menu → show Layout selector for runtime switching

### Full Demo (5 minutes)

1. Start with `/?layout=scroll` — show the full form-based editor
2. Upload image, note auto-populated device metadata
3. Use voice-to-text for backstory
4. Add context images and links
5. Switch to Sketchboard mode — show the spatial canvas
6. Demo interactions: scroll-wheel zoom, drag to pan, double-click zoom, drop an image
7. Demonstrate zone-based editing, inline text, zone hover effects
7. Export from either mode — same output regardless of mode
8. Show `/?persona=your-palette` — demonstrate branded experience
9. Publish project → share link → add to gallery
10. Show `/explore/[slug]` — metadata graph visualization

### Key Points

- **Same data model, different experiences** — no data fragmentation
- **URL-addressable modes** — shareable demo links, bookmarkable
- **Code-split** — each mode loads independently, no bundle bloat
- **Palette system** — white-label ready, per-organization branding
- **Two-tier visibility** — share privately or promote to gallery
- **Spatial editing** — canvas-based annotation for visual thinkers
- **Non-destructive** — switching modes preserves all work

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`TYPES.md`](TYPES.md) | Data model reference — all fields, types, DB columns, organized by 4C corner. **Generated** from Zod schemas; regenerate with `npm run generate:types` |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Visual tokens, CSS variables, persona palette overrides |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | WCAG AA guidelines, keyboard shortcuts |
| [`SECURITY.md`](SECURITY.md) | Auth, RLS, rate limiting, API inventory |
| [`VISIBILITY-STATES.md`](VISIBILITY-STATES.md) | Published/gallery two-tier visibility model |

### Data Model as Source of Truth

The data model flows from a single source through three connected artifacts:

```
lib/field-registry.ts (Zod schemas)
  |
  ├─> TYPES.md              (generated docs)
  |     npm run generate:types
  |
  ├─> lib/test-factory.ts   (schema-validated test data)
  |     createTestMetadata(), createTestContextItem(), etc.
  |
  └─> __tests__/schema-drift.test.ts  (drift detection)
        Verifies schemas ↔ registry ↔ DB mappings stay in sync
```

- **Extending the data model**: Add fields to Zod schemas in `lib/field-registry.ts`, add DB column mappings in `lib/db/projects-transforms.ts` and `lib/db/context-items.ts`, then run `npm run generate:types` to update docs
- **Creating test data**: Use `lib/test-factory.ts` — all factories validate against the Zod schemas, so tests break immediately if the schema changes
- **Checking for drift**: Run `npm test` — the `schema-drift.test.ts` suite catches mismatches between schema fields, registry paths, and DB column mappings
