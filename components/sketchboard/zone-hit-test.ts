/**
 * Zone hit testing — maps canvas coordinates to corner zones and shapes.
 */

import { getLayout } from "@/hooks/use-canvas-bridge";
import type { CornerAffinity } from "./shapes/types";
import type { ShapeJSON } from "@fourcorners/canvas";

export type ZoneTarget = CornerAffinity | "center";

/** Shape hit-test result for inline editing */
export interface ShapeHit {
  shape: ShapeJSON;
  /** Store field path like "backStory.text" — null for non-editable shapes */
  fieldMapping: string | null;
  /** Input type for inline overlay */
  inputType: "textarea" | "input" | "date" | "url";
}

/** Long-form fields that get a textarea overlay */
const TEXTAREA_FIELDS = new Set(["backStory.text", "creativeCommons.description"]);
/** URL fields */
const URL_FIELDS = new Set(["backStory.publicationUrl", "photographerInfo.website"]);
/** Date fields */
const DATE_FIELDS = new Set(["backStory.date"]);

function inferInputType(fieldMapping: string): "textarea" | "input" | "date" | "url" {
  if (TEXTAREA_FIELDS.has(fieldMapping)) return "textarea";
  if (URL_FIELDS.has(fieldMapping)) return "url";
  if (DATE_FIELDS.has(fieldMapping)) return "date";
  return "input";
}

/**
 * Test if a canvas-space point hits an editable shape.
 * Iterates shapes in reverse order (top-most first), skipping zone containers
 * and read-only shapes. Returns the first match or null.
 */
export function hitTestShape(
  canvasX: number,
  canvasY: number,
  shapes: ShapeJSON[],
): ShapeHit | null {
  // Reverse iterate for z-order (later shapes are on top)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    // Skip zone containers
    if (shape.type === "zone") continue;
    // Skip read-only shapes
    if (shape.locked && shape.metadata?.readOnly) continue;

    // Bounds check
    if (
      canvasX >= shape.x &&
      canvasX <= shape.x + shape.width &&
      canvasY >= shape.y &&
      canvasY <= shape.y + shape.height
    ) {
      // Text blocks with fieldMapping → inline edit
      if (shape.type === "text-block") {
        const fm = (shape.data?.fieldMapping || shape.metadata?.fieldMapping) as string | null;
        if (fm) {
          return { shape, fieldMapping: fm, inputType: inferInputType(fm) };
        }
      }
      // Context items → click opens mini-panel (not inline)
      // Link cards → click opens mini-panel (not inline)
      // For now, return non-editable hit so we know something was clicked
      return { shape, fieldMapping: null, inputType: "input" };
    }
  }
  return null;
}

/** Check if a canvas-space point falls within a zone or the center photo area */
export function hitTestZone(canvasX: number, canvasY: number, viewportWidth?: number, visibleZones?: Set<string>): ZoneTarget | null {
  const layout = getLayout(viewportWidth);
  const photoW = Math.min(400, layout.zw * 0.8);
  const photoH = photoW * 0.75;

  // Check center photo area first (higher priority, overlaps zones)
  if (
    canvasX >= layout.photoX &&
    canvasX <= layout.photoX + photoW &&
    canvasY >= layout.photoY &&
    canvasY <= layout.photoY + photoH
  ) {
    return "center";
  }

  // Check each zone (skip zones hidden by data mode)
  for (const [corner, pos] of Object.entries(layout.positions)) {
    if (visibleZones && !visibleZones.has(corner)) continue;
    if (
      canvasX >= pos.x &&
      canvasX <= pos.x + layout.zw &&
      canvasY >= pos.y &&
      canvasY <= pos.y + layout.zh
    ) {
      return corner as CornerAffinity;
    }
  }

  return null;
}

/** Convert screen (mouse/touch) coordinates to canvas-space coordinates */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  stage: { x: () => number; y: () => number; scaleX: () => number; scaleY: () => number },
): { x: number; y: number } {
  return {
    x: (screenX - stage.x()) / stage.scaleX(),
    y: (screenY - stage.y()) / stage.scaleY(),
  };
}
