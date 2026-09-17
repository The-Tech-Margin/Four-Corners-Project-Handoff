/**
 * Persona palette provider — resolves a theme preset from `?persona=<id>`
 * (see lib/palette-presets.ts) or the stored per-browser preference, and
 * applies its CSS variable overrides.
 *
 * Persistence: the preset id is mirrored into sessionStorage so the palette
 * survives internal navigation (router.push, Link clicks). sessionStorage is
 * per-tab, so concurrent demos stay isolated.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { applyPalette, resetPalette } from "@/lib/palette";
import { PALETTE_PRESETS } from "@/lib/palette-presets";
import { readStoredPersona } from "@/lib/persona-preference";

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

  // URL param takes priority, then the current tab's persona, then the
  // preference this browser saved from the theme picker.
  const persona =
    urlPersona ||
    (typeof window !== "undefined"
      ? sessionStorage.getItem(STORAGE_KEY) || readStoredPersona()
      : null);

  const paletteRef = useRef<{
    dark: Record<string, string>;
    light: Record<string, string>;
  } | null>(null);

  useEffect(() => {
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

    function clearCaches() {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem("fc-palette-dark");
        sessionStorage.removeItem("fc-palette-light");
        localStorage.removeItem("fc-palette-dark");
        localStorage.removeItem("fc-palette-light");
      } catch {
        /* storage disabled */
      }
    }

    function load() {
      const preset = persona
        ? (PALETTE_PRESETS.find((p) => p.id === persona) ?? null)
        : null;

      if (!preset) {
        clearCaches();
        resetPalette();
        paletteRef.current = null;
        updateFavicon();
        return;
      }

      paletteRef.current = { dark: preset.dark, light: preset.light };

      // Cache overrides for the blocking script on the next page load so the
      // palette is in place before first paint.
      try {
        sessionStorage.setItem(STORAGE_KEY, preset.id);
        const darkJson = JSON.stringify(preset.dark);
        const lightJson = JSON.stringify(preset.light);
        sessionStorage.setItem("fc-palette-dark", darkJson);
        sessionStorage.setItem("fc-palette-light", lightJson);
        localStorage.setItem("fc-palette-dark", darkJson);
        localStorage.setItem("fc-palette-light", lightJson);
      } catch {
        /* quota — skip */
      }

      applyCurrentTheme();
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
      observer.disconnect();
      window.removeEventListener("fc:palette-changed", handlePaletteChanged);
      resetPalette();
      paletteRef.current = null;
    };
  }, [persona]);

  return null;
}
