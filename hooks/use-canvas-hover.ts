"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { hitTestShape, hitTestZone, screenToCanvas } from "@/components/sketchboard/zone-hit-test";
import type { ZoneTarget } from "@/components/sketchboard/zone-hit-test";
import type { ShapeJSON } from "@fourcorners/canvas";

/**
 * Manages cursor changes when hovering over canvas shapes.
 * Sets cursor:text for editable text shapes, cursor:pointer for interactive shapes.
 * Also returns the currently hovered zone for visual feedback.
 */
export function useCanvasHover(
  containerRef: React.RefObject<HTMLDivElement | null>,
  stageRef: React.RefObject<{ x: () => number; y: () => number; scaleX: () => number; scaleY: () => number } | null>,
  shapesRef: React.RefObject<ShapeJSON[]>,
  enabled: boolean,
  visibleZones?: Set<string>,
): ZoneTarget | null {
  const lastCursor = useRef("");
  const [hoveredZone, setHoveredZone] = useState<ZoneTarget | null>(null);

  const clearZone = useCallback(() => setHoveredZone(null), []);

  useEffect(() => {
    const el = containerRef.current;
    const stage = stageRef.current;
    if (!el || !stage || !enabled) {
      return;
    }

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const canvasPos = screenToCanvas(sx, sy, stage);
      const hit = hitTestShape(canvasPos.x, canvasPos.y, shapesRef.current ?? []);

      let cursor = "";
      if (hit) {
        cursor = hit.fieldMapping ? "text" : "pointer";
      }

      if (cursor !== lastCursor.current) {
        lastCursor.current = cursor;
        el.style.cursor = cursor;
      }

      // Zone hover detection (only when not over a shape)
      if (!hit) {
        const zone = hitTestZone(canvasPos.x, canvasPos.y, el.clientWidth, visibleZones);
        setHoveredZone(zone);
      } else {
        setHoveredZone(null);
      }
    };

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", clearZone);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", clearZone);
      el.style.cursor = "";
    };
  }, [containerRef, stageRef, shapesRef, enabled, visibleZones, clearZone]);

  // Reset hovered zone when disabled
  useEffect(() => {
    if (!enabled) setHoveredZone(null);
  }, [enabled]);

  return hoveredZone;
}
