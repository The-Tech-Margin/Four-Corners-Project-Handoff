# Regression & Deferred Follow-ups

Tracked items that are intentionally deferred (not bugs in shipped behavior, but
known gaps to revisit). Add new entries at the top.

## Deferred

### Focus traps on the image overlays (accessibility)

**Status:** deferred · **Area:** `components/viewer/` · **Priority:** medium

The three image overlays —
`components/viewer/fc-fullscreen-viewer.tsx`,
`components/viewer/fc-full-gallery.tsx`, and
`components/viewer/fc-link-overlay.tsx` — handle **Escape** to close but do not
yet:

- move focus into the overlay on open,
- trap **Tab** within the overlay (keyboard focus can reach the page behind it),
- restore focus to the trigger on close, or
- (fullscreen viewer only) expose `role="dialog"` / `aria-modal="true"`.

Nothing is broken today — all three dismiss on Escape — so this is a polish gap,
not a blocker. The corner **panels** (`fc-panel.tsx`) already received focus
management (focus-in + Escape + restore) in the accessibility pass; the overlays
were scoped out to keep that change low-risk.

**Recommended fix:** add one shared `useFocusTrap` hook (capture opener, focus
container with `tabIndex={-1}`, cycle Tab between first/last focusable, restore
on close) and apply it to all three overlays. Verify each individually in the
preview — risks: framer-motion enter/exit timing, the full-gallery's existing
arrow/zoom/Escape key handlers, and the link-overlay's nested external links at
the trap edges. Ship as its own PR.

Reference: `ACCESSIBILITY.md` → _Known Limitations_.
