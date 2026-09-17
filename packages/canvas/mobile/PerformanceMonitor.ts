/**
 * @module mobile/PerformanceMonitor
 * FPS tracking with automatic quality downgrade/upgrade.
 */

import Konva from "konva";
import type { Canvas } from "../core/Canvas";

/**
 * Monitors frame rate and automatically toggles quality settings
 * to maintain smooth rendering on low-power devices.
 *
 * When FPS drops below the threshold for a sustained period:
 * 1. Disables shadows on all shapes
 * 2. Sets Konva.pixelRatio = 1
 * 3. Enables caching on complex groups
 * 4. Emits 'downgrade' event for ImageLoader to switch to thumbnails
 *
 * When FPS recovers above threshold + 6, reverses in order.
 */
export class PerformanceMonitor {
  private canvas: Canvas;
  private fpsThreshold: number;
  private durationMs: number;
  private animation: Konva.Animation | null = null;

  private frameTimes: number[] = [];
  private currentFps = 60;
  private degraded = false;
  private belowSince = 0;
  private aboveSince = 0;
  private onChange?: (downgraded: boolean) => void;

  /**
   * @param canvas - The Canvas engine instance.
   * @param fpsThreshold - FPS below which quality degrades (default 24).
   * @param durationMs - Sustained duration before triggering (default 500).
   */
  constructor(canvas: Canvas, fpsThreshold = 24, durationMs = 500) {
    this.canvas = canvas;
    this.fpsThreshold = fpsThreshold;
    this.durationMs = durationMs;
  }

  /**
   * Start monitoring frame rate.
   * @param onChange - Optional callback when degradation state changes.
   */
  start(onChange?: (downgraded: boolean) => void): void {
    this.onChange = onChange;
    let lastTime = performance.now();

    this.animation = new Konva.Animation(() => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      if (delta > 0) {
        this.frameTimes.push(1000 / delta);
        if (this.frameTimes.length > 30) this.frameTimes.shift();
        this.currentFps =
          this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      }

      this.evaluate(now);
    }, this.canvas.backgroundLayer);

    this.animation.start();
  }

  /** Stop monitoring. */
  stop(): void {
    this.animation?.stop();
    this.animation = null;
    this.frameTimes = [];
  }

  /** Get the current average FPS. */
  getFPS(): number {
    return Math.round(this.currentFps);
  }

  /** Whether quality has been downgraded. */
  isDowngraded(): boolean {
    return this.degraded;
  }

  private evaluate(now: number): void {
    if (!this.degraded) {
      // Check if we should downgrade
      if (this.currentFps < this.fpsThreshold) {
        if (this.belowSince === 0) this.belowSince = now;
        if (now - this.belowSince >= this.durationMs) {
          this.downgrade();
        }
      } else {
        this.belowSince = 0;
      }
    } else {
      // Check if we can upgrade
      const recoveryThreshold = this.fpsThreshold + 6;
      if (this.currentFps > recoveryThreshold) {
        if (this.aboveSince === 0) this.aboveSince = now;
        if (now - this.aboveSince >= this.durationMs) {
          this.upgrade();
        }
      } else {
        this.aboveSince = 0;
      }
    }
  }

  private downgrade(): void {
    this.degraded = true;
    this.belowSince = 0;

    // 1. Disable shadows
    this.canvas.contentLayer.children.forEach((node) => {
      if (node instanceof Konva.Shape) {
        node.shadowEnabled(false);
      }
    });

    // 2. Lower pixel ratio
    Konva.pixelRatio = 1;

    // 3. Cache complex groups
    this.canvas.contentLayer.children.forEach((node) => {
      if (node instanceof Konva.Group && node.children.length > 3) {
        node.cache();
      }
    });

    this.onChange?.(true);
  }

  private upgrade(): void {
    this.degraded = false;
    this.aboveSince = 0;

    // Reverse: uncache groups
    this.canvas.contentLayer.children.forEach((node) => {
      if (node instanceof Konva.Group) {
        node.clearCache();
      }
    });

    // Restore pixel ratio
    Konva.pixelRatio = window.devicePixelRatio || 2;

    // Re-enable shadows
    this.canvas.contentLayer.children.forEach((node) => {
      if (node instanceof Konva.Shape) {
        node.shadowEnabled(true);
      }
    });

    this.onChange?.(false);
  }
}
