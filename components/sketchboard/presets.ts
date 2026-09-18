/**
 * Sketchboard Mode Presets
 *
 * Each preset defines which shapes to create on the canvas and their
 * initial positions. These are canvas layout presets — distinct from
 * the form-based layout modes in lib/layout-modes.ts.
 *
 * Shape types use @fourcorners/canvas type keys:
 *   tldraw "textBlock"  → "text-block"
 *   tldraw "voiceNote"  → "voice-note"
 *   tldraw "linkCard"   → "link-card"
 *   tldraw "relatedImage" → "context-item"
 */

import type { CornerAffinity, FieldMapping } from "./shapes/types";

export interface PresetShapeDef {
  type: "text-block" | "voice-note" | "context-item" | "link-card";
  x: number;
  y: number;
  props: Record<string, unknown>;
}

export interface CanvasPreset {
  id: string;
  label: string;
  description: string;
  /** Camera zoom level */
  zoom: number;
  /** Shapes to create (PhotoCard + ZoneShapes are always created by the bridge) */
  shapes: PresetShapeDef[];
}

// Zone positions (canvas coordinates): zones are 500x400
// TL = context (purple), TR = links (green)
// BL = backstory (cyan), BR = cc/authorship (orange)
const ZX = 500; // zone width
const ZY = 400; // zone height
const GAP = 40; // gap between zones

// Shape offsets relative to zone positions
function inZone(
  zone: "tl" | "tr" | "bl" | "br",
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  switch (zone) {
    case "tl": return { x: offsetX, y: offsetY };
    case "tr": return { x: ZX + GAP + offsetX, y: offsetY };
    case "bl": return { x: offsetX, y: ZY + GAP + offsetY };
    case "br": return { x: ZX + GAP + offsetX, y: ZY + GAP + offsetY };
  }
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  {
    id: "quick",
    label: "Quick",
    description: "Fast caption + byline + voice note",
    zoom: 0.8,
    shapes: [
      {
        type: "text-block",
        ...inZone("br", 20, 20),
        props: {
          w: 300, h: 100,
          cornerAffinity: "cc" as CornerAffinity,
          fieldMapping: "creativeCommons.description" as FieldMapping,
        },
      },
      {
        type: "text-block",
        ...inZone("bl", 20, 20),
        props: {
          w: 260, h: 60,
          cornerAffinity: "backstory" as CornerAffinity,
          fieldMapping: "backStory.author" as FieldMapping,
        },
      },
      {
        type: "voice-note",
        ...inZone("bl", 20, 100),
        props: {
          w: 280, h: 130,
          cornerAffinity: "backstory" as CornerAffinity,
          fieldMapping: "backStory.text" as FieldMapping,
        },
      },
    ],
  },
  {
    id: "voice-first",
    label: "Voice-first",
    description: "Voice-first, fast capture",
    zoom: 0.9,
    shapes: [
      {
        type: "voice-note",
        ...inZone("bl", 20, 20),
        props: {
          w: 340, h: 160,
          cornerAffinity: "backstory" as CornerAffinity,
          fieldMapping: "backStory.text" as FieldMapping,
        },
      },
      {
        type: "text-block",
        ...inZone("bl", 20, 200),
        props: {
          w: 300, h: 80,
          cornerAffinity: "backstory" as CornerAffinity,
          fieldMapping: "backStory.text" as FieldMapping,
        },
      },
    ],
  },
  {
    id: "full",
    label: "Full",
    description: "Full metadata workspace",
    zoom: 0.5,
    shapes: [
      // Backstory zone (BL)
      {
        type: "text-block",
        ...inZone("bl", 20, 20),
        props: { w: 300, h: 140, cornerAffinity: "backstory" as CornerAffinity, fieldMapping: "backStory.text" as FieldMapping },
      },
      {
        type: "text-block",
        ...inZone("bl", 20, 180),
        props: { w: 260, h: 60, cornerAffinity: "backstory" as CornerAffinity, fieldMapping: "backStory.author" as FieldMapping },
      },
      {
        type: "text-block",
        ...inZone("bl", 20, 260),
        props: { w: 260, h: 60, cornerAffinity: "backstory" as CornerAffinity, fieldMapping: "backStory.publication" as FieldMapping },
      },
      // Authorship zone (BR)
      {
        type: "text-block",
        ...inZone("br", 20, 20),
        props: { w: 300, h: 100, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "creativeCommons.description" as FieldMapping },
      },
      {
        type: "text-block",
        ...inZone("br", 20, 140),
        props: { w: 260, h: 60, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "creativeCommons.copyright" as FieldMapping },
      },
      {
        type: "text-block",
        ...inZone("br", 20, 220),
        props: { w: 260, h: 80, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "photographerInfo.bio" as FieldMapping },
      },
      {
        type: "text-block",
        ...inZone("br", 20, 320),
        props: { w: 260, h: 50, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "photographerInfo.website" as FieldMapping },
      },
      // Ethics
      {
        type: "text-block",
        ...inZone("br", 300, 20),
        props: { w: 180, h: 80, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "ethics.customEthicsText" as FieldMapping },
      },
      // Context zone (TL) — placeholders for images
      {
        type: "text-block",
        ...inZone("tl", 20, 320),
        props: { w: 200, h: 50, cornerAffinity: "context" as CornerAffinity, fieldMapping: null },
      },
      // Links zone (TR) — placeholder
      {
        type: "text-block",
        ...inZone("tr", 20, 320),
        props: { w: 200, h: 50, cornerAffinity: "links" as CornerAffinity, fieldMapping: null },
      },
    ],
  },
  {
    id: "narrative",
    label: "Narrative",
    description: "Expansive narrative layout",
    zoom: 0.4,
    shapes: [
      // Large backstory
      {
        type: "text-block",
        ...inZone("bl", 20, 20),
        props: { w: 440, h: 260, cornerAffinity: "backstory" as CornerAffinity, fieldMapping: "backStory.text" as FieldMapping },
      },
      // Bio
      {
        type: "text-block",
        ...inZone("br", 20, 20),
        props: { w: 300, h: 120, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "photographerInfo.bio" as FieldMapping },
      },
      // Caption
      {
        type: "text-block",
        ...inZone("br", 20, 160),
        props: { w: 300, h: 100, cornerAffinity: "cc" as CornerAffinity, fieldMapping: "creativeCommons.description" as FieldMapping },
      },
      // Voice note
      {
        type: "voice-note",
        ...inZone("bl", 20, 300),
        props: { w: 300, h: 130, cornerAffinity: "backstory" as CornerAffinity, fieldMapping: "backStory.text" as FieldMapping },
      },
    ],
  },
];

export function getPreset(id: string): CanvasPreset {
  return CANVAS_PRESETS.find((p) => p.id === id) ?? CANVAS_PRESETS[0];
}
