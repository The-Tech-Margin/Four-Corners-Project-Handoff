/**
 * @module core/SnapEngine
 * Grid and object snapping for shape positioning.
 */

import Konva from 'konva';
import type { Canvas } from './Canvas';
import type { Point } from './types';
import type { BaseShape } from '../shapes/BaseShape';

/** A visual snap guide line rendered on the chrome layer. */
export interface SnapGuide {
  /** Whether the guide is horizontal or vertical. */
  orientation: 'horizontal' | 'vertical';
  /** Position along the perpendicular axis. */
  position: number;
  /** Start of the guide line along its axis. */
  start: number;
  /** End of the guide line along its axis. */
  end: number;
}

/**
 * Provides grid snapping and object-to-object edge/center snapping.
 * Renders visual guide lines on the chrome layer when snapping occurs.
 */
export class SnapEngine {
  private canvas: Canvas;
  private gridSize: number;
  private enabled = true;
  private gridSnapEnabled = true;
  private objectSnapEnabled = true;

  /**
   * @param canvas - The Canvas engine instance.
   * @param gridSize - Grid cell size in pixels (defaults to theme.canvasGridSize).
   */
  constructor(canvas: Canvas, gridSize?: number) {
    this.canvas = canvas;
    this.gridSize = gridSize ?? canvas.theme.canvasGridSize;
  }

  /**
   * Snap a point to the nearest grid intersection.
   * @param point - The point to snap.
   * @returns The snapped point.
   */
  snapToGrid(point: Point): Point {
    if (!this.enabled || !this.gridSnapEnabled) return point;
    return {
      x: Math.round(point.x / this.gridSize) * this.gridSize,
      y: Math.round(point.y / this.gridSize) * this.gridSize,
    };
  }

  /**
   * Snap a shape's position to align with edges or centers of other shapes.
   * @param shape - The shape being dragged.
   * @param allShapes - All shapes to snap against.
   * @param threshold - Distance threshold for snapping (default 10px).
   * @returns The snapped position and any guide lines to render.
   */
  snapToObjects(
    shape: BaseShape,
    allShapes: BaseShape[],
    threshold = 10
  ): { snappedPoint: Point; guides: SnapGuide[] } {
    if (!this.enabled || !this.objectSnapEnabled) {
      return { snappedPoint: { x: shape.x, y: shape.y }, guides: [] };
    }

    const guides: SnapGuide[] = [];
    let snappedX = shape.x;
    let snappedY = shape.y;

    // Edges and center of the dragged shape
    const dragLeft = shape.x;
    const dragRight = shape.x + shape.width;
    const dragCenterX = shape.x + shape.width / 2;
    const dragTop = shape.y;
    const dragBottom = shape.y + shape.height;
    const dragCenterY = shape.y + shape.height / 2;

    let bestDx = threshold + 1;
    let bestDy = threshold + 1;

    for (const other of allShapes) {
      if (other.id === shape.id) continue;

      const otherLeft = other.x;
      const otherRight = other.x + other.width;
      const otherCenterX = other.x + other.width / 2;
      const otherTop = other.y;
      const otherBottom = other.y + other.height;
      const otherCenterY = other.y + other.height / 2;

      // Horizontal alignment checks (snap X)
      const xChecks = [
        { drag: dragLeft, target: otherLeft },
        { drag: dragLeft, target: otherRight },
        { drag: dragRight, target: otherLeft },
        { drag: dragRight, target: otherRight },
        { drag: dragCenterX, target: otherCenterX },
      ];

      for (const { drag, target } of xChecks) {
        const dx = Math.abs(drag - target);
        if (dx < threshold && dx < bestDx) {
          bestDx = dx;
          snappedX = shape.x + (target - drag);
          const minY = Math.min(dragTop, otherTop);
          const maxY = Math.max(dragBottom, otherBottom);
          guides.push({
            orientation: 'vertical',
            position: target,
            start: minY,
            end: maxY,
          });
        }
      }

      // Vertical alignment checks (snap Y)
      const yChecks = [
        { drag: dragTop, target: otherTop },
        { drag: dragTop, target: otherBottom },
        { drag: dragBottom, target: otherTop },
        { drag: dragBottom, target: otherBottom },
        { drag: dragCenterY, target: otherCenterY },
      ];

      for (const { drag, target } of yChecks) {
        const dy = Math.abs(drag - target);
        if (dy < threshold && dy < bestDy) {
          bestDy = dy;
          snappedY = shape.y + (target - drag);
          const minX = Math.min(dragLeft, otherLeft);
          const maxX = Math.max(dragRight, otherRight);
          guides.push({
            orientation: 'horizontal',
            position: target,
            start: minX,
            end: maxX,
          });
        }
      }
    }

    return { snappedPoint: { x: snappedX, y: snappedY }, guides };
  }

  /** Enable or disable all snapping. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Enable or disable grid snapping specifically. */
  setGridSnap(enabled: boolean): void {
    this.gridSnapEnabled = enabled;
  }

  /** Enable or disable object snapping specifically. */
  setObjectSnap(enabled: boolean): void {
    this.objectSnapEnabled = enabled;
  }

  /**
   * Render snap guide lines on the chrome layer.
   * @param guides - Guide lines to render.
   * @param layer - The Konva layer to draw on (usually chromeLayer).
   */
  renderGuides(guides: SnapGuide[], layer: Konva.Layer): void {
    this.clearGuides(layer);

    for (const guide of guides) {
      const line =
        guide.orientation === 'vertical'
          ? new Konva.Line({
              points: [guide.position, guide.start, guide.position, guide.end],
              stroke: this.canvas.theme.snapGuideColor,
              strokeWidth: 1,
              dash: [4, 4],
              name: '_snap_guide',
            })
          : new Konva.Line({
              points: [guide.start, guide.position, guide.end, guide.position],
              stroke: this.canvas.theme.snapGuideColor,
              strokeWidth: 1,
              dash: [4, 4],
              name: '_snap_guide',
            });

      layer.add(line);
    }

    layer.batchDraw();
  }

  /**
   * Remove all snap guide lines from a layer.
   * @param layer - The Konva layer to clear guides from.
   */
  clearGuides(layer: Konva.Layer): void {
    const guides = layer.find('._snap_guide');
    guides.forEach((g) => g.destroy());
    layer.batchDraw();
  }
}
