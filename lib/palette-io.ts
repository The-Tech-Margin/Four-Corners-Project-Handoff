/**
 * Persona palette import/export helpers — portable JSON themes.
 *
 * Export produces a wrapped object so imports can be validated and versioned;
 * import accepts both the wrapped form and a raw palette object.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import type { PersonaPalette } from "./persona";

export interface PaletteExport {
  type: "four-corners-palette";
  version: 1;
  name: string;
  slug: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
}

/** The importable subset of a palette (no id/timestamps/ownership). */
export interface PaletteImport {
  name: string;
  slug: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build the wrapped, downloadable representation of a palette. */
export function toPaletteExport(p: {
  name: string;
  slug: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
}): PaletteExport {
  return {
    type: "four-corners-palette",
    version: 1,
    name: p.name,
    slug: p.slug,
    dark_overrides: p.dark_overrides || {},
    light_overrides: p.light_overrides || {},
  };
}

/** Trigger a browser download of a palette as pretty-printed JSON. */
export function downloadPalette(p: {
  name: string;
  slug: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
}): void {
  const json = JSON.stringify(toPaletteExport(p), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.slug || "palette"}.palette.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** True when `v` is a flat record of string → string. */
function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (val) => typeof val === "string",
  );
}

/**
 * Validate and normalize arbitrary parsed JSON into a `PaletteImport`.
 * Accepts the wrapped export form or a raw palette-like object.
 * Throws an Error with a user-facing message on bad shape.
 */
export function parsePaletteImport(raw: unknown): PaletteImport {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("File is not a palette object.");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error("Palette is missing a name.");
  }
  const name = obj.name.trim();
  const slug =
    typeof obj.slug === "string" && obj.slug.trim()
      ? slugify(obj.slug)
      : slugify(name);
  if (!slug) {
    throw new Error("Palette has no usable slug or name.");
  }

  const dark = obj.dark_overrides ?? {};
  const light = obj.light_overrides ?? {};
  if (!isStringRecord(dark) || !isStringRecord(light)) {
    throw new Error("Palette overrides must be flat color maps.");
  }

  return { name, slug, dark_overrides: dark, light_overrides: light };
}

/**
 * Derive a slug not already present in `existing`, appending `-copy`,
 * `-copy-2`, … as needed.
 */
export function uniqueSlug(base: string, existing: string[]): string {
  const taken = new Set(existing);
  const root = slugify(base) || "palette";
  if (!taken.has(root)) return root;
  let candidate = `${root}-copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

/** Convenience: full export shape from a stored palette record. */
export function paletteRecordToExport(p: PersonaPalette): PaletteExport {
  return toPaletteExport(p);
}
