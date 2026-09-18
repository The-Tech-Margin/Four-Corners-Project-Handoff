/**
 * Spatial 3D layout for the Four Corners explore canvas.
 *
 * Uses d3.tree() (Reingold-Tilford) to compute a tidy hierarchical
 * tree layout from the 4C structure. The photo is the root, zones
 * branch from it, and child shapes fan out as leaves/subtrees.
 *
 * Falls back to manual quadrant layout when no hierarchy is provided
 * (2D Konva fallback).
 */

import { tree as d3Tree, type HierarchyNode } from "d3-hierarchy";
import type { ShapeJSON, ConnectionJSON, CanvasDocument } from "@fourcorners/canvas";
import type { ExploreHierarchy, ExploreNode } from "./use-explore-hierarchy";

// ── Z-depth layers ──
export const Z_ZONE = 0.1;
export const Z_CHILD = 0;
export const Z_PHOTO = 0.4;

// ── Tree layout sizing ──

/** Total tree extent (world units) — width is horizontal spread */
const TREE_WIDTH = 20;
const TREE_HEIGHT = 16;

// ── Fallback quadrant constants (used when no hierarchy) ──

const ZONE_RADIUS = 6.0;
const CHILD_RADIUS_BASE = 3.2;
const CHILD_RADIUS_RING_STEP = 2.4;
const CHILD_ARC_BASE = Math.PI * 0.7;
const CHILDREN_PER_RING = 3;
const OVERFLOW_THRESHOLD = 9;

const QUADRANT_ANGLE: Record<string, number> = {
  context: Math.PI * 0.75,
  links: Math.PI * 0.25,
  backstory: Math.PI * 1.25,
  cc: Math.PI * 1.75,
};

const LANDSCAPE_X_SCALE = 1.35;
const LANDSCAPE_Y_SCALE = 0.85;

export interface LayoutOptions {
  landscape?: boolean;
  hierarchy?: ExploreHierarchy | null;
  /** Mobile only: zones whose children should be hidden */
  collapsedZones?: Set<string>;
}

// ── d3.tree() layout ──

function computeTreeLayout(
  hierarchy: ExploreHierarchy,
  landscape: boolean,
  options: LayoutOptions = {},
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const { root } = hierarchy;

  if (landscape) {
    // Desktop: standard horizontal tree (wide spread, depth goes down)
    const layout = d3Tree<ExploreNode>()
      .nodeSize([2.8, 4.5])
      .separation((a, b) => {
        const aIsZone = a.data.shapeType === "zone";
        const bIsZone = b.data.shapeType === "zone";
        if (aIsZone || bIsZone) return 2.0;
        return a.parent === b.parent ? 1.0 : 1.4;
      });

    layout(root);

    root.each((node: HierarchyNode<ExploreNode>) => {
      const { id, shapeType } = node.data;
      if (id === "__root__") return;

      const nx = (node.x ?? 0) * LANDSCAPE_X_SCALE;
      const ny = -(node.y ?? 0) * LANDSCAPE_Y_SCALE;

      let z = Z_CHILD;
      if (id === "photo-main") z = Z_PHOTO;
      else if (shapeType === "zone") z = Z_ZONE;

      positions.set(id, [nx, ny, z]);
    });
  } else {
    // Mobile/portrait: photo at top, all nodes stacked below.
    // Depth-first order. Cards fill viewport width, lines show hierarchy.
    // Small x-offset per depth gives connection lines a visible curve.
    const ROW_SPACING = 4.0;
    const DEPTH_X = 0.3; // subtle horizontal shift per depth level

    let rowIndex = 0;
    root.eachBefore((node: HierarchyNode<ExploreNode>) => {
      const { id, shapeType } = node.data;
      if (id === "__root__") return;

      const depth = node.depth - 1; // __root__ is depth 0
      const nx = depth * DEPTH_X;
      const ny = -rowIndex * ROW_SPACING;

      let z = Z_CHILD;
      if (id === "photo-main") z = Z_PHOTO;
      else if (shapeType === "zone") z = Z_ZONE;

      positions.set(id, [nx, ny, z]);
      rowIndex++;
    });

    // Center horizontally
    let sumX = 0, count = 0;
    for (const [, pos] of positions) { sumX += pos[0]; count++; }
    if (count > 0) {
      const cx = sumX / count;
      for (const [id, pos] of positions) {
        positions.set(id, [pos[0] - cx, pos[1], pos[2]]);
      }
    }
  }

  // Pin the root (photo-main) near the top of the visible area.
  // Camera at z≈18, fov=50 → visible Y range ≈ ±8 units.
  const ROOT_Y_TARGET = 6;
  const rootPos = positions.get("photo-main");
  if (rootPos) {
    const offsetY = ROOT_Y_TARGET - rootPos[1];
    for (const [id, pos] of positions) {
      positions.set(id, [pos[0], pos[1] + offsetY, pos[2]]);
    }
  }

  return positions;
}

// ── Fallback: manual quadrant layout (no hierarchy) ──

function ringParams(count: number): { perRing: number; radiusStep: number } {
  if (count <= OVERFLOW_THRESHOLD) {
    return { perRing: CHILDREN_PER_RING, radiusStep: CHILD_RADIUS_RING_STEP };
  }
  const perRing = Math.min(Math.ceil(count / 3), 6);
  const maxRadius = ZONE_RADIUS * 0.75;
  const rings = Math.ceil(count / perRing);
  const radiusStep = rings > 1
    ? (maxRadius - CHILD_RADIUS_BASE) / (rings - 1)
    : CHILD_RADIUS_RING_STEP;
  return { perRing, radiusStep };
}

function computeFallbackLayout(
  shapes: ShapeJSON[],
  connections: ConnectionJSON[],
  landscape: boolean,
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const sx = landscape ? LANDSCAPE_X_SCALE : 1;
  const sy = landscape ? LANDSCAPE_Y_SCALE : 1;

  const childrenOf = new Map<string, string[]>();
  for (const c of connections) {
    const list = childrenOf.get(c.fromShapeId) || [];
    list.push(c.toShapeId);
    childrenOf.set(c.fromShapeId, list);
  }

  const zoneCorners = new Map<string, string>();
  for (const s of shapes) {
    if (s.type === "zone" && s.metadata?.corner) {
      zoneCorners.set(s.id, s.metadata.corner as string);
    }
  }

  for (const s of shapes) {
    if (s.id === "photo-main") {
      positions.set(s.id, [0, 0, Z_PHOTO]);
    }
  }

  for (const s of shapes) {
    if (s.type !== "zone") continue;
    const corner = zoneCorners.get(s.id);
    if (!corner) continue;
    const angle = QUADRANT_ANGLE[corner] ?? 0;
    positions.set(s.id, [
      Math.cos(angle) * ZONE_RADIUS * sx,
      Math.sin(angle) * ZONE_RADIUS * sy,
      Z_ZONE,
    ]);
  }

  for (const [parentId, childIds] of childrenOf) {
    const parentPos = positions.get(parentId);
    if (!parentPos || parentId === "photo-main") continue;
    const corner = zoneCorners.get(parentId);
    if (!corner) continue;

    const baseAngle = QUADRANT_ANGLE[corner] ?? 0;
    const count = childIds.length;
    const { perRing, radiusStep } = ringParams(count);

    childIds.forEach((childId, i) => {
      const ring = Math.floor(i / perRing);
      const indexInRing = i % perRing;
      const countInRing = Math.min(perRing, count - ring * perRing);
      const arc = CHILD_ARC_BASE + ring * 0.2;
      const t = countInRing === 1 ? 0 : (indexInRing / (countInRing - 1)) - 0.5;
      const childAngle = baseAngle + t * arc;
      const radius = CHILD_RADIUS_BASE + ring * radiusStep;
      positions.set(childId, [
        parentPos[0] + Math.cos(childAngle) * radius * sx,
        parentPos[1] + Math.sin(childAngle) * radius * sy,
        Z_CHILD + i * 0.04,
      ]);
    });
  }

  for (const s of shapes) {
    if (!positions.has(s.id)) {
      positions.set(s.id, [0, 0, Z_CHILD]);
    }
  }

  return positions;
}

// ── 2D tree layout for Konva fallback ──

/** Scale factor: world units → pixels for 2D canvas */
const PX_PER_UNIT = 120;

/**
 * Apply d3.tree() positions to a CanvasDocument's shapes as 2D pixel
 * coords. Returns a new shapes array with updated x/y — the original
 * document is not mutated.
 *
 * Used by the 2D Konva fallback (FlowCanvas) so mobile devices without
 * WebGL still get the tree layout.
 */
export function applyTreeLayout2D(
  doc: CanvasDocument,
  hierarchy: ExploreHierarchy,
  isMobile: boolean,
): CanvasDocument {
  const positions = computeTreeLayout(hierarchy, !isMobile);

  // Find bounds to center the tree in positive coordinate space
  let minX = Infinity, minY = Infinity;
  for (const [, pos] of positions) {
    if (pos[0] < minX) minX = pos[0];
    if (pos[1] < minY) minY = pos[1];
  }

  const pad = isMobile ? 40 : 80;
  const offsetX = -minX * PX_PER_UNIT + pad;
  const offsetY = -minY * PX_PER_UNIT + pad;

  const shapes = doc.shapes.map((s) => {
    const pos = positions.get(s.id);
    if (!pos) return s;
    return {
      ...s,
      x: pos[0] * PX_PER_UNIT + offsetX - s.width / 2,
      y: pos[1] * PX_PER_UNIT + offsetY - s.height / 2,
    };
  });

  // Recompute canvas bounds to fit the tree
  let maxX = 0, maxY = 0;
  for (const s of shapes) {
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  return {
    ...doc,
    shapes,
    canvas: {
      ...doc.canvas,
      width: maxX + pad,
      height: maxY + pad,
    },
  };
}

// ── public API ──

/**
 * Compute 3D positions for all shapes.
 *
 * When a hierarchy is provided, uses d3.tree() for a proper
 * Reingold-Tilford tree layout. Otherwise falls back to the
 * manual quadrant layout for 2D compatibility.
 */
export function computeLayout(
  shapes: ShapeJSON[],
  connections: ConnectionJSON[],
  options: LayoutOptions = {},
): Map<string, [number, number, number]> {
  const { landscape = false, hierarchy } = options;

  if (hierarchy) {
    return computeTreeLayout(hierarchy, landscape, options);
  }
  return computeFallbackLayout(shapes, connections, landscape);
}
