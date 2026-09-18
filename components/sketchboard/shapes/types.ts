/**
 * Shape type definitions for the Four Corners Sketchboard Editor.
 * Shared constants and types used by the canvas bridge, presets,
 * and custom shape extensions built on @fourcorners/canvas.
 */

/** Which corner zone a shape belongs to */
export type CornerAffinity =
  | "backstory"
  | "context"
  | "links"
  | "cc"
  | null;

import { FIELD_REGISTRY } from "@/lib/field-registry";

/** Maps a shape to a specific store field (driven by field-registry) */
export type FieldMapping = string | null;

/** Placeholder text for each field mapping — derived from field-registry canvasPlaceholder */
export const FIELD_PLACEHOLDERS: Record<string, string> = Object.fromEntries(
  Object.values(FIELD_REGISTRY)
    .filter((f) => f.canvasPlaceholder)
    .map((f) => [f.path, f.canvasPlaceholder!]),
);

/** Corner colors keyed by affinity — CSS variable names (for DOM elements) */
export const CORNER_COLORS_CSS: Record<string, string> = {
  backstory: "var(--fc-corner-backstory)",
  context: "var(--fc-corner-context)",
  links: "var(--fc-corner-links)",
  cc: "var(--fc-corner-cc)",
};

/** Corner colors keyed by affinity — hex values (for Konva canvas) */
/** These are dark-mode defaults; use resolveCornerColors() for theme-aware values */
export const CORNER_COLORS: Record<string, string> = {
  backstory: "#09fff0",
  context: "#a855f7",
  links: "#84cc16",
  cc: "#f97316",
};

/** Resolve corner colors from computed CSS vars (works in both light and dark mode) */
export function resolveCornerColors(): Record<string, string> {
  if (typeof window === "undefined") return CORNER_COLORS;
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    backstory: get("--fc-corner-backstory", CORNER_COLORS.backstory),
    context: get("--fc-corner-context", CORNER_COLORS.context),
    links: get("--fc-corner-links", CORNER_COLORS.links),
    cc: get("--fc-corner-cc", CORNER_COLORS.cc),
  };
}

/** Corner labels */
export const CORNER_LABELS: Record<string, string> = {
  backstory: "BACKSTORY",
  context: "IMAGERY",
  links: "LINKS",
  cc: "AUTHORSHIP",
};

/** Corner descriptions — shown as tooltips and zone overlay hints */
export const CORNER_DESCRIPTIONS: Record<string, string> = {
  backstory: "The story behind the photo",
  context: "Related images & video",
  links: "Reference links & sources",
  cc: "Credit, copyright & ethics",
};
