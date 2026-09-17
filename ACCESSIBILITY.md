# Accessibility Features

## Keyboard Shortcuts

### Global Shortcuts

- **Cmd+S** (Mac) / **Ctrl+S** (Windows/Linux): Export metadata JSON
  - Works from anywhere in the application
  - Opens the export dialog

### Canvas Editor (Sketchboard Mode)

- **Scroll wheel**: Zoom in/out centered on cursor
- **+** / **=**: Zoom in (centered on viewport)
- **-**: Zoom out (centered on viewport)
- **0**: Fit content to viewport
- **Escape**: Close current panel or overlay
- **Double-click** empty canvas: Zoom in; double-click when zoomed to reset
- **Pinch** (touch): Zoom in/out centered on pinch midpoint
- **Drag** empty canvas: Pan navigation
- **Swipe down** panel header (mobile): Dismiss bottom sheet

### Form Navigation

- **Tab**: Move forward through interactive elements
- **Shift+Tab**: Move backward through interactive elements
- **Enter**: Activate buttons and submit forms
- **Space**: Toggle checkboxes and activate buttons
- **Escape**: Close dialogs and modals

### Links Manager

- **Cmd+Enter** (Mac) / **Ctrl+Enter** (Windows/Linux): Quick add link
  - When focused in the links input fields

### Dialogs & Focus Management

- Modal dialogs (the app menu and the issue reporter/ticket threads) move focus
  into the dialog on open, trap **Tab** within it, and restore focus to the
  trigger element on close.
- **Four Corners viewer panels** open from a corner button, move focus into the
  panel, close on **Escape** or the close button, and return focus to the corner
  that opened them.
- **Escape** closes any open menu, dropdown, viewer panel, or overlay.

## Screen Reader Support

### Landmarks and Regions

- **Header** (`role="banner"`): Contains application title and global navigation
- **Main** (`role="main"`, `id="main-content"`): Primary content area with all metadata editors
- **Section**: Export controls with descriptive `aria-label`
- **Footer** (`role="contentinfo"`): Footer links and attribution

### Skip Navigation

- **Skip to main content** link available as first focusable element
- Visible only on keyboard focus
- Jumps directly to the metadata editing area

### Live Regions

- **Save Status**: Announces "Saved locally" with `aria-live="polite"`
- Updates are announced to screen readers automatically

### ARIA Labels

All interactive elements include descriptive labels:

- Buttons with icon-only interfaces have `aria-label`
- Form inputs have associated `<label>` elements with `htmlFor`
- Collapsible sections use `aria-expanded` to indicate state
- Decorative elements marked with `aria-hidden="true"`

### Form Accessibility

- All form inputs have visible or screen-reader-only labels
- Related help text connected via `aria-describedby`
- Required fields are properly marked
- Input types are semantic (text, url, date, etc.)

## Audited Surfaces

These surfaces have been keyboard- and screen-reader-audited:

- **Metadata editor** — every field is labeled; corner navigation and section
  progress are keyboard-operable buttons; hover affordances also reveal on
  keyboard focus.
- **Gallery & cards** (`/gallery`) — each card is reachable with a single tab
  stop via its title link; the Sort, Tag-filter, and grid/list controls expose
  `aria-label`, `aria-expanded`/`aria-haspopup`, and `aria-pressed` state; the
  results count is a polite live region and the loading skeleton is `aria-busy`;
  the list view exposes `role="list"`/`listitem"`.
- **Four Corners viewer panels** (`/view/[slug]`) — corners are labeled buttons
  (`aria-expanded`, `aria-haspopup="dialog"`); panels open and close by keyboard
  with focus management (see _Dialogs & Focus Management_); related-imagery cards
  are keyboard-activatable and video players are labeled.
- **Admin dashboard** — a grouped sidebar (desktop) and a focus-trapped
  slide-out drawer (mobile), both labeled navigation landmarks.
- **App menu** — focus moves into the menu on open, arrow keys move between
  items, Escape closes and restores focus to the trigger.
- **Issue reporter & tickets** — focus-trapped dialog, labeled controls, and
  live status updates.

## Visual Accessibility

### Color Contrast

All text meets WCAG AA standards:

- Body text: Sufficient contrast in both light and dark modes
- Interactive elements: Clear hover and focus states
- Corner colors: Semantic and distinguishable

### Focus Indicators

- Visible focus outlines on all interactive elements
- Enhanced focus states for keyboard navigation
- Skip link highly visible when focused

### Reduced Motion

- Respects `prefers-reduced-motion` media query
- Animations disabled for users who prefer reduced motion
- Transitions limited to 0.01ms when reduced motion is active

## Best Practices

### Semantic HTML

- Proper heading hierarchy (h1, h2, h3)
- Semantic elements (header, main, section, footer)
- Native form controls where possible

### Keyboard Accessibility

- All functionality available via keyboard
- Logical tab order throughout the application
- No keyboard traps in dialogs or modals

### Progressive Enhancement

- Core functionality works without JavaScript
- Graceful degradation for older browsers
- Local storage with fallback handling

## Testing Recommendations

### Screen Readers

- **macOS**: VoiceOver (Cmd+F5)
- **Windows**: NVDA (free) or JAWS
- **iOS**: VoiceOver (Settings > Accessibility)
- **Android**: TalkBack (Settings > Accessibility)

### Browser Extensions

- **axe DevTools**: Automated accessibility testing
- **WAVE**: Web accessibility evaluation tool
- **Lighthouse**: Built into Chrome DevTools

### Manual Testing

1. Navigate entire app using only keyboard (Tab, Enter, Space, Esc)
2. Test with screen reader on
3. Verify color contrast in light and dark modes
4. Check focus indicators are visible
5. Test with zoom levels 200% and 400%
6. Verify skip navigation link works

## Known Limitations

- Voice recording feature requires microphone permission
- Geolocation feature requires location permission
- Some EXIF data may not be available from all image sources
- The fullscreen image, full-gallery, and link-preview **overlays** close on
  Escape but do not yet trap **Tab** focus or restore focus to the trigger on
  close. Tracked as a follow-up — see `REGRESSION.md`.
- The gallery's masonry grid does not expose `role="list"` semantics (its
  column-based layout precludes a valid list structure); the list view does.

## Reporting Issues

If you encounter accessibility barriers, please contact: sonia@thetechmargin.com
