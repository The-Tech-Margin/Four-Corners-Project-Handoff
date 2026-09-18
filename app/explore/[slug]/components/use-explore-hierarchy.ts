/**
 * Single d3-hierarchy source of truth for the explore rendering pipeline.
 *
 * Builds the hierarchy ONCE from CanvasDocument connections, then derives
 * all lookup maps (colors, zones, depths) in a single tree walk.
 *
 * Consumers: computeLayout(), ConnectionLines, FlowCanvas3D Scene.
 */

import { useMemo } from "react";
import { stratify, type HierarchyNode } from "d3-hierarchy";
import type { ShapeJSON, ConnectionJSON } from "@fourcorners/canvas";

// ── types ──

export interface ExploreNode {
  id: string;
  parentId: string | null;
  shapeType: string | null;
  corner: string | null;
  color: string | null;
}

export interface ExploreHierarchy {
  /** Root of the d3-hierarchy tree (may be synthetic __root__) */
  root: HierarchyNode<ExploreNode>;
  /** O(1) node lookup by shape id */
  nodeMap: Map<string, HierarchyNode<ExploreNode>>;
  /** Zone id → zone accent color */
  shapeColors: Map<string, string>;
  /** Set of shape IDs that are zones */
  zoneIds: Set<string>;
  /** Shape id → inherited zone color (walks up ancestry) */
  cornerColorOf: Map<string, string>;
  /** Shape id → hierarchy depth */
  depthOf: Map<string, number>;
  /** Parent id → child ids (direct children only) */
  childrenOf: Map<string, string[]>;
}

// ── pure builder ──

export function buildExploreHierarchy(
  shapes: ShapeJSON[],
  connections: ConnectionJSON[],
): ExploreHierarchy | null {
  // Index shapes by id for fast lookup
  const shapeById = new Map<string, ShapeJSON>();
  for (const s of shapes) shapeById.set(s.id, s);

  // Build parent lookup from connections
  const parentOf = new Map<string, string>();
  for (const c of connections) {
    parentOf.set(c.toShapeId, c.fromShapeId);
  }

  // Collect all known ids
  const allIds = new Set<string>();
  for (const s of shapes) allIds.add(s.id);
  for (const c of connections) {
    allIds.add(c.fromShapeId);
    allIds.add(c.toShapeId);
  }

  // Build flat node table with enriched data
  const table: ExploreNode[] = [];
  for (const id of allIds) {
    const shape = shapeById.get(id);
    const pid = parentOf.get(id) ?? null;
    table.push({
      id,
      parentId: pid && allIds.has(pid) ? pid : null,
      shapeType: shape?.type ?? null,
      corner: (shape?.metadata?.corner as string) ?? null,
      color: (shape?.type === "zone" && shape?.data?.color)
        ? (shape.data.color as string)
        : null,
    });
  }

  // Handle multiple roots with synthetic root
  const roots = table.filter((n) => n.parentId === null);
  if (roots.length === 0) return null;
  if (roots.length > 1) {
    table.push({ id: "__root__", parentId: null, shapeType: null, corner: null, color: null });
    for (const r of roots) r.parentId = "__root__";
  }

  let root: HierarchyNode<ExploreNode>;
  try {
    root = stratify<ExploreNode>()
      .id((d) => d.id)
      .parentId((d) => d.parentId)(table);
  } catch {
    return null;
  }

  // Single walk to derive all lookup maps
  const nodeMap = new Map<string, HierarchyNode<ExploreNode>>();
  const shapeColors = new Map<string, string>();
  const zoneIds = new Set<string>();
  const cornerColorOf = new Map<string, string>();
  const depthOf = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();

  root.each((node) => {
    const { id, shapeType, color } = node.data;
    if (id === "__root__") return;

    nodeMap.set(id, node);
    depthOf.set(id, node.depth);

    if (shapeType === "zone") {
      zoneIds.add(id);
      if (color) shapeColors.set(id, color);
    }

    // Build childrenOf map
    if (node.children) {
      const kids = node.children
        .map((c) => c.data.id)
        .filter((cid) => cid !== "__root__");
      if (kids.length > 0) childrenOf.set(id, kids);
    }

    // Walk up ancestry to resolve inherited zone color
    let cursor: HierarchyNode<ExploreNode> | null = node;
    while (cursor) {
      if (cursor.data.color) {
        cornerColorOf.set(id, cursor.data.color);
        break;
      }
      cursor = cursor.parent;
    }
  });

  return { root, nodeMap, shapeColors, zoneIds, cornerColorOf, depthOf, childrenOf };
}

// ── React hook ──

export function useExploreHierarchy(
  shapes: ShapeJSON[],
  connections: ConnectionJSON[],
): ExploreHierarchy | null {
  return useMemo(
    () => buildExploreHierarchy(shapes, connections),
    [shapes, connections],
  );
}
