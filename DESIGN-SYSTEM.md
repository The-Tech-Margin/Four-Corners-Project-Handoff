# Four Corners Design System

Single source of truth for the visual language of the Writing with Light app
and the `@fourcorners/canvas` library. All values trace back to
`app/globals.css`. Persona palettes override the same `--fc-*` variables at
runtime via `html[data-persona="…"]`.

---

## Tokens

### Surfaces

| Token              | Dark      | Light     | Use                             |
| ------------------ | --------- | --------- | ------------------------------- |
| `--fc-bg`          | `#1a1a1a` | `#f8f7f5` | Page background                 |
| `--fc-bg-alt`      | `#0a0a0a` | `#f8f7f5` | Recessed areas, image beds      |
| `--fc-surface`     | `#242424` | `#ffffff` | Cards, panels, modals           |
| `--fc-surface-alt` | `#2d2d2d` | `#fafaf9` | Hover states, nested containers |

### Text

| Token                 | Dark      | Light     | Use                            |
| --------------------- | --------- | --------- | ------------------------------ |
| `--fc-text`           | `#f5f5f5` | `#111111` | Primary headings, body         |
| `--fc-text-secondary` | `#d0d0d0` | `#3a3a3a` | Descriptions, panel text       |
| `--fc-text-muted`     | `#9a9a9a` | `#707070` | Labels, placeholders           |
| `--fc-text-faint`     | `#707070` | `#888888` | Timestamps, metadata, disabled |

### Borders

| Token                | Dark      | Light                   |
| -------------------- | --------- | ----------------------- |
| `--fc-border`        | `#2d2d2d` | `#e5e5e3`               |
| `--fc-border-subtle` | `#3a3a3a` | `rgba(229,229,227,0.5)` |

### Accent

| Token               | Dark             | Light               |
| ------------------- | ---------------- | ------------------- |
| `--fc-accent`       | `#09fff0` (cyan) | `#c026d3` (fuchsia) |
| `--fc-accent-hover` | `#07ccc0`        | `#a21caf`           |
| `--fc-accent-on`    | `#0a0a0a`        | `#111111`           |

`--fc-accent-on` is the text color on accent backgrounds.

### Corner Colors

Each corner has a fixed semantic color, overridable by persona palettes.

| Corner     | Token                   | Dark      | Light     | Position     |
| ---------- | ----------------------- | --------- | --------- | ------------ |
| Backstory  | `--fc-corner-backstory` | `#09fff0` | `#0891b2` | Bottom-left  |
| Imagery    | `--fc-corner-context`   | `#a855f7` | `#7c3aed` | Top-left     |
| Links      | `--fc-corner-links`     | `#84cc16` | `#65a30d` | Top-right    |
| Authorship | `--fc-corner-cc`        | `#f97316` | `#ea580c` | Bottom-right |

### Status & Utility

| Token              | Dark      | Light     |
| ------------------ | --------- | --------- |
| `--fc-danger`      | `#ef4444` | `#dc2626` |
| `--fc-danger-soft` | `#f87171` | `#dc2626` |
| `--fc-success`     | `#22c55e` | `#16a34a` |
| `--fc-ai`          | `#c084fc` | `#9333ea` |
| `--fc-icon`        | `#6b7280` | `#9ca3af` |
| `--fc-icon-hover`  | `#e5e7eb` | `#374151` |

### Overlays

| Token             | Dark                     | Light                   |
| ----------------- | ------------------------ | ----------------------- |
| `--fc-overlay`    | `rgba(0,0,0,0.7)`        | `rgba(0,0,0,0.5)`       |
| `--fc-glass`      | `rgba(0,0,0,0.5)`        | `rgba(255,255,255,0.8)` |
| `--fc-wash`       | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.03)`      |
| `--fc-wash-hover` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.05)`      |

---

## Z-Index Scale

Never use raw numbers. Always reference the variable.

| Token              | Value | Use                          |
| ------------------ | ----- | ---------------------------- |
| `--z-base`         | 1     | Default positioned elements  |
| `--z-shield`       | 2     | Image protection overlay     |
| `--z-corner`       | 4     | L-shaped corner indicators   |
| `--z-cutline`      | 5     | Caption/credit below image   |
| `--z-content`      | 10    | General content              |
| `--z-controls`     | 20    | Toolbars, view controls      |
| `--z-card-menu`    | 30    | Card context menus           |
| `--z-fab`          | 40    | Floating action buttons      |
| `--z-panel-active` | 45    | Open corner panels           |
| `--z-header`       | 50    | App header                   |
| `--z-menu`         | 55    | Dropdown menus               |
| `--z-modal`        | 60    | Modal dialogs                |
| `--z-overlay`      | 9999  | Fullscreen gallery, lightbox |

---

## Radius

**`--radius: 9px` everywhere.**

All Tailwind `rounded-*` utilities map to 9px. Only `rounded-full` stays
`9999px`. Photographs always render with `border-radius: 0` (enforced via
`.fc-protected-img`).

---

## Typography

| Font       | Variable            | Use                       |
| ---------- | ------------------- | ------------------------- |
| Geist Sans | `--font-geist-sans` | Body, UI, headings        |
| Geist Mono | `--font-geist-mono` | Code, metadata, filenames |
| Pacifico   | `--font-pacifico`   | Decorative (logo only)    |

Base: 16px. Line height: 1.5 body, 1.3 headings. Minimum: 14px (enforced
on `.text-xs` and `small`).

---

## Dark / Light Mode

Dark is default. Light activates via `html.light`. Every `--fc-*` variable
is redefined inside `html.light { }`. Components use `var(--fc-*)` only —
never hardcoded hex. Persona palettes (`html[data-persona]`) override the
same variables, so one set of component CSS covers all themes.

---

## Component Patterns

### Naming

BEM-ish, prefixed `fc-`:

```
.fc-panel                  — block
.fc-panel__header          — element
.fc-panel--backstory       — modifier
.fc-panel.fc-active        — state
```

### Key Components

| Class                        | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `.fc-embed`                  | Photo viewer container                                 |
| `.fc-image-wrapper`          | Inner wrapper, overflow visible for corners            |
| `.fc-corner`                 | L-shaped corner indicators (40px desktop, 32px mobile) |
| `.fc-panel`                  | Metadata panels (60% desktop, bottom-sheet mobile)     |
| `.fc-cutline`                | Caption + credit below image                           |
| `.fc-card`                   | Project card (gallery + dashboard)                     |
| `.fc-list` / `.fc-list__row` | List view for projects                                 |
| `.fc-view-controls`          | Tab bar (inline desktop, fixed bottom mobile)          |
| `.fc-dropdown-menu`          | Shared dropdown                                        |
| `.fc-context-card`           | Related image card                                     |
| `.fc-fullscreen-overlay`     | Fullscreen viewer                                      |
| `.fc-sketchboard`            | @fourcorners/canvas wrapper                            |
| `.fc-zoom-controls`          | Shared zoom widget (+/- buttons, % label), used in editor + viewer |
| `.fc-canvas-reset-btn`       | "Reset" button for FlowCanvas viewer                   |
| `.fc-zone-hover-overlay`     | Accent-color border glow on hovered zones              |
| `.fc-sketchboard__drop-overlay` | Drag-and-drop image overlay with pulsing border     |
| `.fc-panel-handle`           | Mobile swipe-to-dismiss pill indicator (hidden desktop) |
| `.fc-panel-exit`             | Panel exit animation wrapper (slide-out before unmount) |
| `.fc-err-anim`               | Error/maintenance/404 animation                        |
| `.input-icon-wrapper`        | Input with icon slots                                  |

### Panel Mobile Behavior

Desktop: `position: absolute` inside `.fc-image-wrapper`, 60% width.
Mobile (≤720px): `position: fixed`, full bottom-sheet from below header
(top: 56px), slides up via `transform: translateY`.

### Corner Indicators

L-shapes via `::before` (vertical) + `::after` (horizontal). States:
`.fc-corners-visible` (fade in), `.fc-active` (hidden when panel open),
`.fc-empty` (50% opacity), `.fc-corner--disabled` (no interaction),
`.fc-corner--hint` (pulse × 3 for onboarding).

---

## Mobile Constraints

- 44px min touch targets on screens ≤768px
- `touch-action: manipulation` globally
- Safe area padding via `env(safe-area-inset-*)`
- Bottom bars: `padding-bottom: max(Xpx, env(safe-area-inset-bottom))`
- `.fc-protected-img`: no select, no drag, no callout, pointer-events none

---

## Accessibility

- `*:focus-visible`: 2px solid accent, 2px offset
- `prefers-reduced-motion: reduce`: all animations → 0.01ms
- `prefers-contrast: more`: borders → 2px, muted text → black/white
- `.sr-only` utility for screen readers
- `::selection` uses accent color
- 14px minimum text enforced

---

## Tailwind Integration

The `@theme inline` block defines static values for Tailwind utilities.
These are **not the runtime source of truth** — `--fc-*` variables are.
Themed utility classes are manually overridden to `var(--fc-*)`:

```css
.bg-corner-backstory {
  background-color: var(--fc-corner-backstory);
}
```

**Rule:** If a Tailwind utility touches a themed color, add a `var(--fc-*)`
override. If it doesn't need theme-awareness, the static value is fine.

---

## @fourcorners/canvas Library

The `@fourcorners/canvas` package is a Konva.js canvas library consumed by
this app as a dependency. It has its own token system (`ThemeTokens`) that
bridges to the app's `--fc-*` variables.

### Two-layer variable architecture

```
App (globals.css)           Library (ThemeProvider)
─────────────────           ──────────────────────
--fc-bg: #1a1a1a    ←───   fourCornersTheme.canvasBg = 'var(--fc-bg, #1a1a1a)'
                      │
html.light              │    ThemeProvider.injectCSSVariables() writes:
--fc-bg: #f8f7f5    ←───   --ock-canvas-bg: var(--fc-bg, #1a1a1a)
                                ↓
                            Konva shapes read --ock-canvas-bg at render time
                            Browser resolves: --ock-* → --fc-* → current value
```

The `--ock-` prefix (Open Canvas Kit) avoids collision with `--fc-*`.
The `fourCornersTheme` preset uses `var(--fc-*, fallback)` strings as token
values, so persona palettes and dark/light switching cascade through
automatically.

### ThemeTokens → --fc-\* mapping

Implemented in `theme/tokens.ts`, `theme/presets/fourCorners.ts`, and
`theme/ThemeProvider.ts`.

| ThemeTokens key          | --ock-\* variable             | Maps to --fc-\*         |
| ------------------------ | ----------------------------- | ----------------------- |
| `canvasBg`               | `--ock-canvas-bg`             | `--fc-bg`               |
| `shapeBg`                | `--ock-shape-bg`              | `--fc-surface`          |
| `shapeBgAlt`             | `--ock-shape-bg-alt`          | `--fc-surface-alt`      |
| `shapeBorder`            | `--ock-shape-border`          | `--fc-border`           |
| `shapeSelectedBorder`    | `--ock-shape-selected-border` | `--fc-accent`           |
| `textColor`              | `--ock-text`                  | `--fc-text`             |
| `textSecondary`          | `--ock-text-secondary`        | `--fc-text-secondary`   |
| `textMuted`              | `--ock-text-muted`            | `--fc-text-muted`       |
| `textFaint`              | `--ock-text-faint`            | `--fc-text-faint`       |
| `accentPrimary`          | `--ock-accent`                | `--fc-accent`           |
| `accentHover`            | `--ock-accent-hover`          | `--fc-accent-hover`     |
| `accentOn`               | `--ock-accent-on`             | `--fc-accent-on`        |
| `accentDanger`           | `--ock-danger`                | `--fc-danger`           |
| `accentSuccess`          | `--ock-success`               | `--fc-success`          |
| `cornerBackstory`        | `--ock-corner-backstory`      | `--fc-corner-backstory` |
| `cornerContext`          | `--ock-corner-context`        | `--fc-corner-context`   |
| `cornerLinks`            | `--ock-corner-links`          | `--fc-corner-links`     |
| `cornerCC`               | `--ock-corner-cc`             | `--fc-corner-cc`        |
| `toolbarBg`              | `--ock-toolbar-bg`            | `--fc-header-bg`        |
| `toolbarBorder`          | `--ock-toolbar-border`        | `--fc-header-border`    |
| `toolbarIconColor`       | `--ock-toolbar-icon`          | `--fc-icon`             |
| `toolbarIconActiveColor` | `--ock-toolbar-icon-active`   | `--fc-accent`           |
| `border`                 | `--ock-border`                | `--fc-border`           |
| `borderSubtle`           | `--ock-border-subtle`         | `--fc-border-subtle`    |
| `overlay`                | `--ock-overlay`               | `--fc-overlay`          |
| `wash`                   | `--ock-wash`                  | `--fc-wash`             |
| `washHover`              | `--ock-wash-hover`            | `--fc-wash-hover`       |
| `shapeBorderRadius`      | `--ock-shape-radius`          | 9 (static)              |
| `handleSize`             | `--ock-handle-size`           | 8 (static)              |

### Shape rendering rule

Shapes read tokens from `CanvasRenderContext.theme` at render time. Konva
doesn't resolve CSS variables natively, so shapes that need a concrete color
call `themeProvider.resolveToken('accentPrimary')` which reads the computed
value from the DOM container.

### Standalone presets

For consumers outside the 4C app, `darkTheme` and `lightTheme` provide
static hex values (no CSS variable dependencies).

---

## @fourcorners/canvas

Used for both the explore view (`/explore/[slug]`, mode="view") and the
sketchboard editor (mode="edit"). Built on Konva.js. Uses the `fourCorners`
theme preset which reads `--fc-*` CSS variables directly — no manual
variable bridging needed.

---

## Persona Palettes

Stored in `persona_palettes` Supabase table with `dark_overrides` and
`light_overrides` JSON. Applied via `PersonaProvider` → `html[data-persona]`.
Can override any `--fc-*` variable. Commonly: accent, corner colors, surfaces.
Admin CRUD at `/admin` (password-gated).

---

## Animations

| Name                 | Duration | Use               |
| -------------------- | -------- | ----------------- |
| `fc-corner-pulse`    | 1.2s     | Loading indicator |
| `fc-err-scatter-*`   | 3.5s     | Error page        |
| `fc-err-breathe-*`   | 2.8s     | Maintenance page  |
| `fc-err-search-*`    | 4s       | 404 page          |
| `fc-fade-in`         | 0.3s     | Card entry        |
| `fc-gallery-fade-in` | 0.2–0.3s | Gallery reveal    |
| `fc-spin`            | 0.8s     | Spinner           |

All respect `prefers-reduced-motion: reduce`.

---

## File Organization

```
app/globals.css                          — All tokens, component styles, overrides
lib/persona.ts                           — PersonaPalette type
lib/palette.ts                           — applyPalette() runtime
components/persona-provider.tsx           — Reads URL/store, applies palette to <html>

@fourcorners/canvas (external library):
  theme/tokens.ts                        — ThemeTokens interface + DEFAULT_TOKENS
  theme/ThemeProvider.ts                  — --ock-* CSS variable injection
  theme/presets/dark.ts                   — Static dark values
  theme/presets/light.ts                  — Static light values
  theme/presets/fourCorners.ts            — var(--fc-*) references
```

The CSS file is the single source for the app. `ThemeTokens` is the single
source for the canvas library. `fourCornersTheme` bridges the two.
