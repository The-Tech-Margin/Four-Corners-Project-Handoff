/**
 * Persona palette provider — reads ?persona= and applies
 * per-tab CSS variable overrides. Falls back to the global
 * palette when no persona param is present.
 *
 * Persistence: the slug is stored in sessionStorage so the
 * palette survives internal navigation (router.push, Link clicks).
 * sessionStorage is per-tab, so concurrent demos stay isolated.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { applyPalette, resetPalette } from "@/lib/palette";
import { useFourCornersStore } from "@/lib/store";
import { getLayoutMode } from "@/lib/layout-modes";

const STORAGE_KEY = "fc-persona";

/** Draw a 32×32 four-corners favicon from current CSS variables and swap <link rel="icon"> */
function updateFavicon() {
  const style = getComputedStyle(document.documentElement);
  const colors = [
    style.getPropertyValue("--fc-corner-backstory").trim(),
    style.getPropertyValue("--fc-corner-context").trim(),
    style.getPropertyValue("--fc-corner-links").trim(),
    style.getPropertyValue("--fc-corner-cc").trim(),
  ];
  // Bail if vars aren't resolved yet
  if (colors.some((c) => !c)) return;

  const s = 32;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Match the static SVG favicon (app/icon.tsx): a 0–100 grid with 40×40
  // squares at offsets 5 / 55 and a 4-unit corner radius, scaled to `s`.
  // Keeps the theme favicon identical in size and layout — only colours vary.
  const u = s / 100;
  const sq = 40 * u;
  const r = 4 * u;
  const near = 5 * u;
  const far = 55 * u;

  function roundRect(x: number, y: number, w: number, h: number) {
    ctx!.beginPath();
    ctx!.moveTo(x + r, y);
    ctx!.lineTo(x + w - r, y);
    ctx!.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx!.lineTo(x + w, y + h - r);
    ctx!.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx!.lineTo(x + r, y + h);
    ctx!.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx!.lineTo(x, y + r);
    ctx!.quadraticCurveTo(x, y, x + r, y);
    ctx!.closePath();
    ctx!.fill();
  }

  // TL = backstory, TR = context, BL = links, BR = cc
  ctx.fillStyle = colors[0]; roundRect(near, near, sq, sq);
  ctx.fillStyle = colors[1]; roundRect(far, near, sq, sq);
  ctx.fillStyle = colors[2]; roundRect(near, far, sq, sq);
  ctx.fillStyle = colors[3]; roundRect(far, far, sq, sq);

  const dataUrl = canvas.toDataURL("image/png");
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-fc]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute("data-fc", "1");
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = dataUrl;
}

export function PersonaProvider() {
  const searchParams = useSearchParams();
  const urlPersona = searchParams.get("persona");

  // URL param takes priority; fall back to sessionStorage for
  // navigation within the same tab (e.g. gallery → view → dashboard).
  const persona = urlPersona || (
    typeof window !== "undefined"
      ? sessionStorage.getItem(STORAGE_KEY)
      : null
  );

  const paletteRef = useRef<{
    dark: Record<string, string>;
    light: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    function applyCurrentTheme() {
      if (!paletteRef.current) return;
      const isLight = document.documentElement.classList.contains("light");
      const overrides = isLight
        ? paletteRef.current.light
        : paletteRef.current.dark;

      resetPalette();
      if (Object.keys(overrides).length > 0) {
        applyPalette(overrides);
      }
      // Regenerate favicon with new corner colours
      updateFavicon();
    }

    async function loadPaletteBySlug(slug: string) {
      const res = await fetch(`/api/palettes/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;
      return res.json();
    }

    async function loadGlobalPalette() {
      const res = await fetch("/api/palettes/global", {
        cache: "no-store",
      });
      if (!res.ok || cancelled) return null;
      return res.json();
    }

    /**
     * Check if a Supabase auth cookie exists (cheap, no network).
     * Only when present do we pay for the /api/user/preferences call.
     */
    function hasAuthCookie(): boolean {
      return document.cookie.split(";").some((c) => c.trim().startsWith("sb-") && c.includes("-auth-token"));
    }

    /**
     * Fetch user preference with inline palette data.
     * Returns the full palette object or null.
     */
    async function loadUserPreference(): Promise<{
      slug: string;
      dark_overrides: Record<string, string>;
      light_overrides: Record<string, string>;
    } | null> {
      try {
        const res = await fetch("/api/user/preferences", { cache: "no-store" });
        if (!res.ok) return null;
        const prefs = await res.json();
        return prefs.palette ?? null;
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        let data;

        if (persona) {
          // Explicit persona — persist slug for tab navigation
          sessionStorage.setItem(STORAGE_KEY, persona);
          data = await loadPaletteBySlug(persona);
        } else if (hasAuthCookie()) {
          // Logged in — check user palette preference (returns inline palette data)
          const userPalette = await loadUserPreference();

          if (userPalette) {
            sessionStorage.setItem(STORAGE_KEY, userPalette.slug);
            data = userPalette;
          } else {
            // User has no preference — fall back to global
            sessionStorage.removeItem(STORAGE_KEY);
            data = await loadGlobalPalette();
            if (data?.slug) {
              sessionStorage.setItem(STORAGE_KEY, data.slug);
            }

            // Signal that this logged-in user has no palette preference
            // so the theme prompt can show if dismissals < 3.
            if (!cancelled) {
              (window as unknown as Record<string, unknown>).__fcNoPalettePreference = true;
              window.dispatchEvent(new CustomEvent("fc:no-palette-preference"));
            }
          }
        } else {
          // Not logged in — global palette only
          sessionStorage.removeItem(STORAGE_KEY);
          data = await loadGlobalPalette();
          if (data?.slug) {
            sessionStorage.setItem(STORAGE_KEY, data.slug);
          }
        }

        if (!data || cancelled) {
          resetPalette();
          paletteRef.current = null;
          try {
            sessionStorage.removeItem("fc-palette-dark");
            sessionStorage.removeItem("fc-palette-light");
            localStorage.removeItem("fc-palette-dark");
            localStorage.removeItem("fc-palette-light");
          } catch { /* ignore */ }
          updateFavicon();
          return;
        }

        paletteRef.current = {
          dark: data.dark_overrides || {},
          light: data.light_overrides || {},
        };

        // Cache overrides for blocking script on next page load (prevents flash).
        // Write to both sessionStorage (per-tab) and localStorage (cross-session)
        // so the blocking script can apply the palette before first paint.
        try {
          const darkJson = JSON.stringify(data.dark_overrides || {});
          const lightJson = JSON.stringify(data.light_overrides || {});
          sessionStorage.setItem("fc-palette-dark", darkJson);
          sessionStorage.setItem("fc-palette-light", lightJson);
          localStorage.setItem("fc-palette-dark", darkJson);
          localStorage.setItem("fc-palette-light", lightJson);
        } catch { /* quota — skip */ }

        // Apply persona's default layout mode if specified
        if (data.default_layout_mode) {
          const modeDef = getLayoutMode(data.default_layout_mode);
          if (modeDef.id === data.default_layout_mode) {
            useFourCornersStore.getState().setLayoutMode(data.default_layout_mode);
          }
        }

        applyCurrentTheme();
      } catch {
        /* graceful fallback — default colours */
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          applyCurrentTheme();
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Listen for palette changes from the palette-picker modal so
    // paletteRef stays current and dark/light toggle keeps working.
    function handlePaletteChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        paletteRef.current = {
          dark: detail.dark || {},
          light: detail.light || {},
        };
        applyCurrentTheme();
      }
    }
    window.addEventListener("fc:palette-changed", handlePaletteChanged);

    load();

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("fc:palette-changed", handlePaletteChanged);
      resetPalette();
      paletteRef.current = null;
    };
  }, [persona]);

  return null;
}
