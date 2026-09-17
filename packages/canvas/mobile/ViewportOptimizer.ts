/**
 * @module mobile/ViewportOptimizer
 * Frustum culling — hides shapes outside the visible viewport.
 * This is the single biggest mobile performance win.
 */

import type { Canvas } from '../core/Canvas';
import type { Rect } from '../core/types';

/**
 * Optimizes rendering performance by hiding Konva nodes that fall
 * outside the visible viewport (plus a buffer zone).
 */
export class ViewportOptimizer {
  private canvas: Canvas;
  private buffer: number;
  private visibleCount = 0;

  /**
   * @param canvas - The Canvas engine instance.
   * @param buffer - Extra pixels of buffer around the viewport (default 200).
   */
  constructor(canvas: Canvas, buffer = 200) {
    this.canvas = canvas;
    this.buffer = buffer;
  }

  /**
   * Update shape visibility based on the current camera viewport.
   * Call this after every camera move / zoom.
   * @param viewport - The visible rectangle in canvas coordinates.
   */
  onCameraMove(viewport: Rect): void {
    const expanded: Rect = {
      x: viewport.x - this.buffer,
      y: viewport.y - this.buffer,
      width: viewport.width + this.buffer * 2,
      height: viewport.height + this.buffer * 2,
    };

    let count = 0;
    const children = this.canvas.contentLayer.children;

    for (const node of children) {
      const box = node.getClientRect({ relativeTo: this.canvas.contentLayer });
      const visible = this.intersects(box, expanded);

      node.visible(visible);
      node.listening(visible && this.canvas.mode === 'edit');

      if (visible) count++;
    }

    this.visibleCount = count;
  }

  /**
   * Get the number of currently visible shapes.
   * @returns Count of visible shapes.
   */
  getVisibleCount(): number {
    return this.visibleCount;
  }

  /**
   * Check whether two rectangles intersect.
   */
  private intersects(a: { x: number; y: number; width: number; height: number }, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
