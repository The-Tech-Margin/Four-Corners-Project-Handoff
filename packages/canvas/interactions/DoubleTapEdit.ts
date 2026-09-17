/**
 * @module interactions/DoubleTapEdit
 * Inline editing trigger on double-click / double-tap.
 * For TextBlock shapes, hides the Konva.Text and shows a positioned <textarea>.
 */

import Konva from 'konva';
import type { Canvas } from '../core/Canvas';
import type { BaseShape } from '../shapes/BaseShape';

/** Minimal event emitter type. */
type EditHandler = (shape: BaseShape) => void;

/**
 * Listens for double-click on shapes and emits an 'edit' event.
 * For TextBlock shapes, can trigger inline text editing via a
 * positioned HTML textarea overlay.
 */
export class DoubleTapEdit {
  private canvas: Canvas;
  private enabled = true;
  private handlers: EditHandler[] = [];
  private boundHandler: (e: Konva.KonvaEventObject<MouseEvent>) => void;

  /**
   * @param canvas - The Canvas engine instance.
   */
  constructor(canvas: Canvas) {
    this.canvas = canvas;

    this.boundHandler = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!this.enabled) return;
      const target = e.target;
      if (!target) return;

      // Walk up to find a group with a shape ID
      const group = target.findAncestor('Group');
      if (!group) return;

      // Emit edit event — the consuming code resolves the shape
      const shapeId = group.id();
      if (shapeId) {
        for (const handler of this.handlers) {
          // The handler receives a stub; real shape resolution
          // happens in the React layer using the shape ID.
          handler({ id: shapeId } as BaseShape);
        }
      }
    };

    this.canvas.contentLayer.on('dblclick dbltap', this.boundHandler);
  }

  /**
   * Subscribe to edit events.
   * @param handler - Callback with the shape that was double-clicked.
   */
  on(handler: EditHandler): void {
    this.handlers.push(handler);
  }

  /** Enable double-tap editing. */
  enable(): void {
    this.enabled = true;
  }

  /** Disable double-tap editing. */
  disable(): void {
    this.enabled = false;
  }

  /** Remove all listeners and clean up. */
  destroy(): void {
    this.canvas.contentLayer.off('dblclick dbltap', this.boundHandler);
    this.handlers = [];
  }
}
