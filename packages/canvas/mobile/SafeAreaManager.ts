/**
 * @module mobile/SafeAreaManager
 * iOS safe area inset detection and CSS variable injection.
 */

import type { Rect } from "../core/types";

/**
 * Reads iOS safe area environment variables and applies them
 * as CSS custom properties for toolbar and canvas positioning.
 */
export class SafeAreaManager {
  private probe: HTMLDivElement | null = null;

  /**
   * @param _container - The DOM element associated with this manager.
   */
  constructor(_container: HTMLElement) {
    // Container reference retained for future viewport calculations
    void _container;
  }

  /**
   * Read safe area insets from CSS environment variables.
   * Returns 0 for each value on non-iOS platforms.
   * @returns Inset values in pixels.
   */
  getInsets(): { top: number; bottom: number; left: number; right: number } {
    if (!this.probe) {
      this.probe = document.createElement("div");
      this.probe.style.position = "fixed";
      this.probe.style.visibility = "hidden";
      this.probe.style.pointerEvents = "none";
      document.body.appendChild(this.probe);
    }

    const read = (prop: string): number => {
      this.probe!.style.height = `env(${prop}, 0px)`;
      return parseFloat(getComputedStyle(this.probe!).height) || 0;
    };

    const top = read("safe-area-inset-top");
    const bottom = read("safe-area-inset-bottom");
    const left = read("safe-area-inset-left");
    const right = read("safe-area-inset-right");

    return { top, bottom, left, right };
  }

  /**
   * Calculate adjusted canvas bounds excluding safe area insets.
   * @param containerRect - The DOMRect of the container element.
   * @returns Adjusted bounds as a Rect.
   */
  getCanvasBounds(containerRect: DOMRect): Rect {
    const insets = this.getInsets();
    return {
      x: containerRect.x + insets.left,
      y: containerRect.y + insets.top,
      width: containerRect.width - insets.left - insets.right,
      height: containerRect.height - insets.top - insets.bottom,
    };
  }

  /**
   * Get positioning styles for a bottom toolbar that respects safe area insets.
   * Matches the fc-view-controls CSS pattern.
   * @returns CSS properties for toolbar positioning.
   */
  getToolbarStyle(): Record<string, string> {
    return {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    };
  }

  /**
   * Set --ock-safe-* CSS custom properties on the container.
   * @param container - The DOM element to apply properties to.
   */
  applyToContainer(container: HTMLElement): void {
    const insets = this.getInsets();
    container.style.setProperty("--ock-safe-top", `${insets.top}px`);
    container.style.setProperty("--ock-safe-bottom", `${insets.bottom}px`);
    container.style.setProperty("--ock-safe-left", `${insets.left}px`);
    container.style.setProperty("--ock-safe-right", `${insets.right}px`);
  }

  /**
   * Apple Human Interface Guidelines minimum touch target size.
   * @returns 44 pixels.
   */
  static getMinTouchTarget(): number {
    return 44;
  }

  /**
   * Clean up the probe element.
   */
  destroy(): void {
    if (this.probe && this.probe.parentNode) {
      this.probe.parentNode.removeChild(this.probe);
      this.probe = null;
    }
  }
}
