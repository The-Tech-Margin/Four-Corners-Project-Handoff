/**
 * Zone overlays — decorative Konva nodes rendered inside empty zones
 * to guide the user. Removed and re-rendered on each hydration cycle.
 */

import Konva from "konva";
import type { Canvas } from "@fourcorners/canvas";
import { getLayout } from "@/hooks/use-canvas-bridge";
import { CORNER_LABELS, CORNER_DESCRIPTIONS, resolveCornerColors } from "./shapes/types";

const OVERLAY_NAME = "zone-overlay";

// ── rendering constants ──
const LABEL_FONT_SIZE = 24;
const LABEL_OPACITY = 0.3;
const DESC_FONT_SIZE = 13;
const DESC_OPACITY = 0.2;
const PLUS_AFFORDANCE_SIZE = 32;
const PLUS_CIRCLE_OPACITY = 0.25;
const PLUS_TEXT_OPACITY = 0.3;
const PLUS_FONT_SIZE = 20;
const DASHED_BORDER_OPACITY = 0.3;
const PHOTO_HINT_OPACITY = 0.35;
const PHOTO_ICON_OPACITY = 0.2;
const FONT_FAMILY = "Inter, system-ui, sans-serif";

type StoreState = {
  imageSrc?: string | null;
  backStory?: { text?: string; author?: string } | null;
  context?: unknown[] | null;
  links?: unknown[] | null;
  creativeCommons?: { description?: string; copyright?: string } | null;
};

/** Check if a corner zone has any content in the store */
function zoneHasContent(corner: string, state: StoreState): boolean {
  switch (corner) {
    case "context":
      return (state.context?.length ?? 0) > 0;
    case "links":
      return (state.links?.length ?? 0) > 0;
    case "backstory":
      return !!(state.backStory?.text?.trim() || state.backStory?.author?.trim());
    case "cc":
      return !!(state.creativeCommons?.description?.trim() || state.creativeCommons?.copyright?.trim());
    default:
      return false;
  }
}

/** Remove all existing overlay nodes from the canvas */
export function clearZoneOverlays(canvas: Canvas): void {
  const layer = canvas.contentLayer;
  const toRemove = layer.find(`.${OVERLAY_NAME}`);
  toRemove.forEach((node: Konva.Node) => node.destroy());
}

/** Render decorative overlays for empty zones */
export function renderZoneOverlays(canvas: Canvas, state: StoreState, viewportWidth?: number, visibleZones?: Set<string>): void {
  const layout = getLayout(viewportWidth);
  const colors = resolveCornerColors();
  const layer = canvas.contentLayer;

  (["context", "links", "backstory", "cc"] as const).forEach((corner) => {
    // Skip zones that are hidden by data mode
    if (visibleZones && !visibleZones.has(corner)) return;
    if (zoneHasContent(corner, state)) return;

    const pos = layout.positions[corner];
    const zw = layout.zw;
    const zh = layout.zh;
    const color = colors[corner] || "#888";
    const label = CORNER_LABELS[corner] || corner.toUpperCase();
    const desc = CORNER_DESCRIPTIONS[corner] || "";

    const group = new Konva.Group({
      x: pos.x,
      y: pos.y,
      width: zw,
      height: zh,
      name: OVERLAY_NAME,
      listening: false,
    });

    // Centered label
    group.add(
      new Konva.Text({
        x: 0,
        y: zh / 2 - 28,
        width: zw,
        text: label,
        fontSize: LABEL_FONT_SIZE,
        fontFamily: FONT_FAMILY,
        fontStyle: "bold",
        fill: color,
        opacity: LABEL_OPACITY,
        align: "center",
      }),
    );

    // Description hint
    group.add(
      new Konva.Text({
        x: 0,
        y: zh / 2 + 4,
        width: zw,
        text: desc,
        fontSize: DESC_FONT_SIZE,
        fontFamily: FONT_FAMILY,
        fill: color,
        opacity: DESC_OPACITY,
        align: "center",
      }),
    );

    // "+" circle affordance
    const plusX = zw / 2 - PLUS_AFFORDANCE_SIZE / 2;
    const plusY = zh / 2 + 30;

    group.add(
      new Konva.Circle({
        x: zw / 2,
        y: plusY + PLUS_AFFORDANCE_SIZE / 2,
        radius: PLUS_AFFORDANCE_SIZE / 2,
        stroke: color,
        strokeWidth: 1.5,
        opacity: PLUS_CIRCLE_OPACITY,
      }),
    );

    group.add(
      new Konva.Text({
        x: plusX,
        y: plusY + 2,
        width: PLUS_AFFORDANCE_SIZE,
        height: PLUS_AFFORDANCE_SIZE,
        text: "+",
        fontSize: PLUS_FONT_SIZE,
        fontFamily: FONT_FAMILY,
        fill: color,
        opacity: PLUS_TEXT_OPACITY,
        align: "center",
        verticalAlign: "middle",
      }),
    );

    layer.add(group);
  });

  // Center photo affordance — only when no image exists
  const photoW = Math.min(400, layout.zw * 0.8);
  const photoH = photoW * 0.75;
  if (!state.imageSrc) {
    const group = new Konva.Group({
      x: layout.photoX,
      y: layout.photoY,
      width: photoW,
      height: photoH,
      name: OVERLAY_NAME,
      listening: false,
    });

    // Dashed border
    group.add(
      new Konva.Rect({
        width: photoW,
        height: photoH,
        stroke: "#64748b",
        strokeWidth: 1.5,
        dash: [10, 6],
        cornerRadius: 8,
        opacity: DASHED_BORDER_OPACITY,
      }),
    );

    // Camera icon path (simple viewfinder)
    group.add(
      new Konva.Text({
        x: 0,
        y: photoH / 2 - 16,
        width: photoW,
        text: "\u{1F4F7}",
        fontSize: 32,
        align: "center",
        opacity: PHOTO_ICON_OPACITY,
      }),
    );

    // Hint text
    group.add(
      new Konva.Text({
        x: 0,
        y: photoH / 2 + 20,
        width: photoW,
        text: "Drop or click to add photo",
        fontSize: DESC_FONT_SIZE,
        fontFamily: FONT_FAMILY,
        fill: "#94a3b8",
        opacity: PHOTO_HINT_OPACITY,
        align: "center",
      }),
    );

    layer.add(group);
  }

  layer.batchDraw();
}
