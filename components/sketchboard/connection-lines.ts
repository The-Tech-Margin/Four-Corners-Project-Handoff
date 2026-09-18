/**
 * Connection lines — curved Konva lines connecting shapes on the canvas.
 * Rendered during hydration, same lifecycle as zone-overlays.
 */

import Konva from "konva";
import type { Canvas, ConnectionJSON, ShapeJSON } from "@fourcorners/canvas";
import { resolveCornerColors } from "./shapes/types";

const CONNECTION_NAME = "connection-line";

// ── rendering constants ──
const BEZIER_SEGMENTS = 20;
const PERPENDICULAR_OFFSET = 0.12;
const LINE_STROKE_WIDTH = 1.2;
const LINE_OPACITY = 0.18;
const MIN_DISTANCE = 5;
const FADE_DURATION_SEC = 0.8;
const CONTROL_POINT_NEAR = 0.33;
const CONTROL_POINT_FAR = 0.67;

/** Edge anchor — point on a shape's bounding rect closest to a target point */
function edgeAnchor(
  shape: ShapeJSON,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = shape.width / 2;
  const halfH = shape.height / 2;
  const s = Math.min(halfW / Math.abs(dx || 0.001), halfH / Math.abs(dy || 0.001));
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Sample a cubic bezier into a flat points array for Konva.Line */
function bezierPoints(
  x0: number, y0: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x3: number, y3: number,
  segments: number,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const t1 = 1 - t;
    pts.push(
      t1 * t1 * t1 * x0 + 3 * t1 * t1 * t * cx1 + 3 * t1 * t * t * cx2 + t * t * t * x3,
      t1 * t1 * t1 * y0 + 3 * t1 * t1 * t * cy1 + 3 * t1 * t * t * cy2 + t * t * t * y3,
    );
  }
  return pts;
}

/** Resolve connection color from zone corner colors */
function connectionColor(
  from: ShapeJSON,
  to: ShapeJSON,
  colors: Record<string, string>,
): string {
  const corner =
    (from.metadata?.corner as string) ||
    (to.metadata?.corner as string) ||
    (from.data?.cornerAffinity as string) ||
    (to.data?.cornerAffinity as string);
  return (corner && colors[corner]) || "#64748b";
}

/** Render curved connection lines between shapes on the content layer */
export function renderConnectionLines(
  canvas: Canvas,
  connections: ConnectionJSON[],
  shapes: ShapeJSON[],
): void {
  const shapeMap = new Map(shapes.map((s) => [s.id, s]));
  const colors = resolveCornerColors();
  const layer = canvas.contentLayer;

  for (const conn of connections) {
    const from = shapeMap.get(conn.fromShapeId);
    const to = shapeMap.get(conn.toShapeId);
    if (!from || !to) continue;

    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCx = to.x + to.width / 2;
    const toCy = to.y + to.height / 2;

    // Skip connections where the child is fully inside the parent (intra-zone noise)
    const childInside =
      (to.x >= from.x && to.y >= from.y &&
       to.x + to.width <= from.x + from.width &&
       to.y + to.height <= from.y + from.height) ||
      (from.x >= to.x && from.y >= to.y &&
       from.x + from.width <= to.x + to.width &&
       from.y + from.height <= to.y + to.height);
    if (childInside) continue;

    const a = edgeAnchor(from, toCx, toCy);
    const b = edgeAnchor(to, fromCx, fromCy);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_DISTANCE) continue;

    // Perpendicular offset for organic curve
    const perpX = -dy * PERPENDICULAR_OFFSET;
    const perpY = dx * PERPENDICULAR_OFFSET;

    const points = bezierPoints(
      a.x, a.y,
      a.x + dx * CONTROL_POINT_NEAR + perpX, a.y + dy * CONTROL_POINT_NEAR + perpY,
      a.x + dx * CONTROL_POINT_FAR - perpX, a.y + dy * CONTROL_POINT_FAR - perpY,
      b.x, b.y,
      BEZIER_SEGMENTS,
    );

    const color = connectionColor(from, to, colors);

    const line = new Konva.Line({
      points,
      stroke: color,
      strokeWidth: LINE_STROKE_WIDTH,
      opacity: LINE_OPACITY,
      lineCap: "round",
      lineJoin: "round",
      name: CONNECTION_NAME,
      listening: false,
      perfectDrawEnabled: false,
    });

    layer.add(line);
  }
}

/** Fade connection lines in from transparent (for intro animation) */
export function fadeInConnectionLines(canvas: Canvas, durationSec = FADE_DURATION_SEC): void {
  const nodes = canvas.contentLayer.find(`.${CONNECTION_NAME}`);
  nodes.forEach((node: Konva.Node) => {
    const target = node.opacity();
    node.opacity(0);
    node.to({ opacity: target, duration: durationSec, easing: Konva.Easings.EaseOut });
  });
}
