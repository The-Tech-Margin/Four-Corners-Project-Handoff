"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { HierarchyNode } from "d3-hierarchy";
import type { ExploreNode } from "./use-explore-hierarchy";

const SEGMENTS = 24;
const LINE_W = 1.2;
const LINE_A = 0.3;
const DOT_R = 0.06;
const DOT_PTS = 16;
const DOT_A = 0.5;

/** Circle outline at (cx, cy) for node intersection dots */
function dot(cx: number, cy: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= DOT_PTS; i++) {
    const a = (i / DOT_PTS) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * DOT_R, cy + Math.sin(a) * DOT_R, 0]);
  }
  return pts;
}

/** Smooth cubic bezier — vertical S-curve from parent to child */
function curve(
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number][] {
  const dy = to[1] - from[1];
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    // Control points: pull 50% vertically from each end
    const c1y = from[1] + dy * 0.5;
    const c2y = to[1] - dy * 0.5;
    const x = u * u * u * from[0] + 3 * u * u * t * from[0] + 3 * u * t * t * to[0] + t * t * t * to[0];
    const y = u * u * u * from[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * to[1];
    pts.push([x, y, 0]);
  }
  return pts;
}

interface ConnectionLinesProps {
  root: HierarchyNode<ExploreNode> | null;
  positions: Map<string, [number, number, number]>;
  shapeColors: Map<string, string>;
  defaultColor: string;
  zoneIds: Set<string>;
  collapsedZones?: Set<string>;
}

export function ConnectionLines({
  root, positions, shapeColors, defaultColor, zoneIds, collapsedZones,
}: ConnectionLinesProps) {
  const links = useMemo(() => {
    if (!root) return [];

    const result: { key: string; color: string; pts: [number, number, number][]; d1: [number, number, number][]; d2: [number, number, number][] }[] = [];

    root.each((node: HierarchyNode<ExploreNode>) => {
      if (!node.parent) return;
      const cId = node.data.id;
      const pId = node.parent.data.id;
      if (pId === "__root__" || cId === "__root__") return;
      if (collapsedZones?.has(pId) && zoneIds.has(pId)) return;

      const p = positions.get(pId);
      const c = positions.get(cId);
      if (!p || !c) return;

      let color = defaultColor;
      let cur: HierarchyNode<ExploreNode> | null = node;
      while (cur) {
        const col = shapeColors.get(cur.data.id);
        if (col) { color = col; break; }
        cur = cur.parent;
      }

      result.push({
        key: `${pId}-${cId}`,
        color,
        pts: curve(p, c),
        d1: dot(p[0], p[1]),
        d2: dot(c[0], c[1]),
      });
    });

    return result;
  }, [root, positions, shapeColors, defaultColor, zoneIds, collapsedZones]);

  return (
    <group>
      {links.map((l) => (
        <group key={l.key}>
          <Line points={l.pts} color={l.color} lineWidth={LINE_W} transparent opacity={LINE_A} />
          <Line points={l.d1} color={l.color} lineWidth={1} transparent opacity={DOT_A} />
          <Line points={l.d2} color={l.color} lineWidth={1} transparent opacity={DOT_A} />
        </group>
      ))}
    </group>
  );
}
