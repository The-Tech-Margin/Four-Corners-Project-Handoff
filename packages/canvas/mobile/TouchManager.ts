/**
 * @module mobile/TouchManager
 * Gesture recognition for touch devices.
 * Translates raw touch events into high-level gestures:
 * pan, pinch-zoom, long-press, and double-tap.
 */

import Konva from 'konva';
import type { Canvas } from '../core/Canvas';
import type { Point } from '../core/types';

/** Minimal event emitter for gesture callbacks. */
type EventHandler = (...args: unknown[]) => void;

/**
 * Manages touch input on the Konva Stage and translates it into
 * higher-level gestures (pan, pinch-zoom, long-press, double-tap).
 */
export class TouchManager {
  /** Whether touch handling is active. */
  enabled = true;

  /** Whether pinch-zoom gesture is enabled. */
  pinchZoomEnabled = true;

  /** Whether two-finger rotation is enabled (disabled by default). */
  rotateEnabled = false;

  private stage: Konva.Stage;
  private canvas: Canvas;
  private listeners: Map<string, EventHandler[]> = new Map();

  // Gesture tracking state
  private touchStartPositions: Map<number, Point> = new Map();
  private lastTapTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private initialPinchDistance = 0;
  private initialPinchZoom = 1;

  /** Long-press threshold in milliseconds. */
  private static readonly LONG_PRESS_MS = 500;
  /** Double-tap threshold in milliseconds. */
  private static readonly DOUBLE_TAP_MS = 300;

  /**
   * @param stage - The Konva Stage to listen on.
   * @param canvas - The Canvas engine for camera control.
   */
  constructor(stage: Konva.Stage, canvas: Canvas) {
    this.stage = stage;
    this.canvas = canvas;

    // Enable multi-touch hit detection
    Konva.hitOnDragEnabled = true;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    const content = this.stage.container();
    content.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    content.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    content.addEventListener('touchend', this.handleTouchEnd);
  }

  /** Enable touch handling. */
  enable(): void {
    this.enabled = true;
  }

  /** Disable touch handling. */
  disable(): void {
    this.enabled = false;
    this.clearLongPress();
  }

  /** Remove all listeners and clean up. */
  destroy(): void {
    this.clearLongPress();
    const content = this.stage.container();
    content.removeEventListener('touchstart', this.handleTouchStart);
    content.removeEventListener('touchmove', this.handleTouchMove);
    content.removeEventListener('touchend', this.handleTouchEnd);
    this.listeners.clear();
  }

  /**
   * Subscribe to a gesture event.
   * Supported events: 'longpress', 'doubletap'.
   */
  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  /** Emit a gesture event. */
  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const h of handlers) {
        h(...args);
      }
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (!this.enabled) return;

    // Track each finger
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      this.touchStartPositions.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (e.touches.length === 1) {
      // Start long-press timer
      this.startLongPress(e.touches[0]);

      // Double-tap detection
      const now = Date.now();
      if (now - this.lastTapTime < TouchManager.DOUBLE_TAP_MS) {
        this.emit('doubletap', {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        });
      }
      this.lastTapTime = now;
    } else if (e.touches.length === 2 && this.pinchZoomEnabled) {
      e.preventDefault();
      this.clearLongPress();
      this.initialPinchDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      this.initialPinchZoom = this.canvas.camera.zoom;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.enabled) return;

    // Any movement cancels long-press
    this.clearLongPress();

    if (e.touches.length === 1) {
      // Single finger pan (if no shape is being dragged — Konva handles shape drag)
      // We don't override Konva's drag behavior here.
    } else if (e.touches.length === 2 && this.pinchZoomEnabled) {
      e.preventDefault();
      const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
      const scale = dist / this.initialPinchDistance;
      const newZoom = Math.min(Math.max(this.initialPinchZoom * scale, 0.1), 5);

      // Zoom around midpoint of the two fingers
      const mid = this.getTouchMidpoint(e.touches[0], e.touches[1]);
      const rect = this.stage.container().getBoundingClientRect();
      const pointerX = mid.x - rect.left;
      const pointerY = mid.y - rect.top;

      const oldZoom = this.canvas.camera.zoom;
      const mousePointTo = {
        x: (pointerX - this.canvas.camera.x) / oldZoom,
        y: (pointerY - this.canvas.camera.y) / oldZoom,
      };

      this.canvas.setCamera({
        zoom: newZoom,
        x: pointerX - mousePointTo.x * newZoom,
        y: pointerY - mousePointTo.y * newZoom,
      });
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.enabled) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      this.touchStartPositions.delete(e.changedTouches[i].identifier);
    }

    if (e.touches.length === 0) {
      this.clearLongPress();
    }
  }

  private startLongPress(touch: Touch): void {
    this.clearLongPress();
    const pos: Point = { x: touch.clientX, y: touch.clientY };
    this.longPressTimer = setTimeout(() => {
      this.emit('longpress', pos);
    }, TouchManager.LONG_PRESS_MS);
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private getTouchDistance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getTouchMidpoint(t1: Touch, t2: Touch): Point {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }
}
