/**
 * @module interactions/DragDrop
 * External drag-and-drop support for adding shapes from a palette.
 */

import type { Canvas } from '../core/Canvas';
import type { Point } from '../core/types';

/**
 * Enables dragging shapes from an external palette onto the canvas.
 * Listens for HTML5 dragover/drop events on the canvas container
 * and converts screen coordinates to canvas coordinates.
 */
export class DragDrop {
  private canvas: Canvas;
  private handleDragOver: (e: DragEvent) => void;
  private handleDrop: ((e: DragEvent) => void) | null = null;

  /**
   * @param canvas - The Canvas engine instance.
   */
  constructor(canvas: Canvas) {
    this.canvas = canvas;

    this.handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
  }

  /**
   * Enable external drop onto the canvas.
   * @param onDrop - Callback with the shape type string and canvas position.
   */
  enableExternalDrop(onDrop: (type: string, position: Point) => void): void {
    const container = this.canvas.stage.container();

    this.handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData('text/plain') ?? '';
      if (!type) return;

      const rect = container.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Convert screen position to canvas coordinates
      const zoom = this.canvas.camera.zoom;
      const canvasX = (screenX - this.canvas.camera.x) / zoom;
      const canvasY = (screenY - this.canvas.camera.y) / zoom;

      onDrop(type, { x: canvasX, y: canvasY });
    };

    container.addEventListener('dragover', this.handleDragOver);
    container.addEventListener('drop', this.handleDrop);
  }

  /**
   * Remove all drag/drop listeners.
   */
  disable(): void {
    const container = this.canvas.stage.container();
    container.removeEventListener('dragover', this.handleDragOver);
    if (this.handleDrop) {
      container.removeEventListener('drop', this.handleDrop);
      this.handleDrop = null;
    }
  }
}
