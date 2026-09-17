"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useFourCornersStore } from "@/lib/store";

/**
 * Two-way URL hash ↔ scroll sync for landmark anchors.
 *
 * 1. **Re-scroll to hash after async content lands.** Pages like /gallery
 *    skeleton-load then fetch — the browser's native hash-scroll happens
 *    before page height stabilizes, so `/gallery#footer` initially scrolls
 *    to the wrong place. We retry the scroll at 50ms, 500ms, 1500ms, and
 *    again on `window.load`, which covers infinite-scroll and image-load
 *    layout shifts without locking the user out of manual scroll.
 *
 * 2. **Scroll spy → URL.** As the user scrolls past landmark sections,
 *    `history.replaceState` rewrites the hash so the URL always reflects
 *    the current section. Uses an IntersectionObserver with a thin "active
 *    band" right under the fixed header, so only one section is ever
 *    "current" at a time. `replaceState` (not `pushState`) keeps the
 *    browser back button unchanged.
 */

const HEADER_OFFSET_PX = 80;

// Only these IDs participate in scroll-spy. Add new landmarks here as they
// get `id="…"` attributes attached.
const TRACKED_IDS = new Set([
  "top",
  "gallery",
  "footer",
  "main-content",
  "caption-credit-ethics",
  "backstory",
  "context-images",
  "links",
  "preview-gallery",
  "publish",
  "export",
]);

// Map a scroll-spy section id to its Four Corners corner (for issue
// diagnostics). Sections with no corner (gallery/preview/etc.) map to null.
const SECTION_TO_CORNER: Record<string, string> = {
  "caption-credit-ethics": "authorship",
  backstory: "backstory",
  "context-images": "context",
  links: "links",
};

export function HashAnchorSync() {
  // Re-run on route change — Next.js client nav doesn't trigger window.load
  const pathname = usePathname();

  useEffect(() => {
    // ── 1. Re-scroll to hash after async content settles ──────────────
    const initialHash = window.location.hash.slice(1);
    const scrollToHash = () => {
      if (!initialHash) return;
      const el = document.getElementById(initialHash);
      if (el) el.scrollIntoView({ block: "start" });
    };
    const timers = [
      setTimeout(scrollToHash, 50),
      setTimeout(scrollToHash, 500),
      setTimeout(scrollToHash, 1500),
    ];
    const onLoad = () => scrollToHash();
    window.addEventListener("load", onLoad, { once: true });

    // ── 2. Scroll spy → URL hash ──────────────────────────────────────
    // Defer observer setup so initial scroll completes first and we don't
    // immediately overwrite the user's intended hash.
    const observerSetupTimer = setTimeout(() => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[id]"))
        .filter((el) => TRACKED_IDS.has(el.id));
      if (targets.length === 0) return;

      // Pre-allocate to avoid rebuilds; updated by the observer.
      const visible = new Map<string, IntersectionObserverEntry>();

      // Track the last section we pushed to the store so we only write on
      // change (imperative set — no React re-render of subscribers).
      let lastFocusId: string | null = null;

      const apply = () => {
        if (visible.size === 0) return;
        // Pick the section whose top is closest to the active band.
        const active = Array.from(visible.values()).sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top - HEADER_OFFSET_PX) -
            Math.abs(b.boundingClientRect.top - HEADER_OFFSET_PX),
        )[0];
        const id = (active.target as HTMLElement).id;
        const next = `#${id}`;
        if (window.location.hash !== next) {
          history.replaceState(null, "", next);
        }
        if (id !== lastFocusId) {
          lastFocusId = id;
          useFourCornersStore
            .getState()
            .setFocusedField(SECTION_TO_CORNER[id] ?? null, id);
        }
      };

      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).id;
            if (entry.isIntersecting) visible.set(id, entry);
            else visible.delete(id);
          }
          apply();
        },
        {
          // Active band: 80px below the top of the viewport (header), 50% above
          // the bottom. Only sections whose top crosses into this strip count.
          rootMargin: `-${HEADER_OFFSET_PX}px 0px -50% 0px`,
          threshold: 0,
        },
      );
      targets.forEach((t) => io.observe(t));

      // Stash the observer on the cleanup capture for teardown.
      cleanupObserver = () => io.disconnect();
    }, 200);

    let cleanupObserver: (() => void) | null = null;

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(observerSetupTimer);
      window.removeEventListener("load", onLoad);
      cleanupObserver?.();
    };
  }, [pathname]);

  return null;
}
