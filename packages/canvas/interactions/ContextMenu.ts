/**
 * @module interactions/ContextMenu
 * Framework-agnostic context menu state management.
 * The React layer renders the actual menu DOM; this class manages data.
 */

import type { Canvas } from "../core/Canvas";
import type { Point } from "../core/types";
import type { BaseShape } from "../shapes/BaseShape";

/** A single item in a context menu. */
export interface ContextMenuItem {
  /** Display label. */
  label: string;
  /** Optional icon identifier. */
  icon?: string;
  /** Action to execute when clicked. */
  action: () => void;
  /** Whether to render a divider above this item. */
  divider?: boolean;
  /** Whether the item is disabled. */
  disabled?: boolean;
}

/**
 * Manages context menu state (position, items, visibility).
 * Emits state for the React layer to render.
 */
export class ContextMenu {
  /** Whether the menu is currently visible. */
  visible = false;

  /** Current menu items. */
  items: ContextMenuItem[] = [];

  /** Position where the menu should render. */
  position: Point = { x: 0, y: 0 };

  /** Callback fired when menu state changes. */
  onChange?: () => void;

  /**
   * @param _canvas - The Canvas engine instance (retained for future use).
   */
  constructor(_canvas: Canvas) {
    // Canvas reference reserved for future context menu positioning
  }

  /**
   * Show the context menu at a position with the given items.
   * @param position - Screen position for the menu.
   * @param items - Menu items to display.
   */
  show(position: Point, items: ContextMenuItem[]): void {
    this.position = position;
    this.items = items;
    this.visible = true;
    this.onChange?.();
  }

  /**
   * Hide the context menu.
   */
  hide(): void {
    this.visible = false;
    this.items = [];
    this.onChange?.();
  }

  /**
   * Build context menu items for a specific shape.
   * @param shape - The target shape.
   * @returns Standard shape action items.
   */
  static shapeItems(shape: BaseShape): ContextMenuItem[] {
    return [
      {
        label: "Edit",
        icon: "edit",
        action: () => shape.onDoubleClick(),
      },
      {
        label: shape.locked ? "Unlock" : "Lock",
        icon: shape.locked ? "unlock" : "lock",
        action: () => {
          shape.locked = !shape.locked;
        },
      },
      {
        label: "Delete",
        icon: "trash",
        action: () => {
          // Deletion is handled by the consuming code via the callback
        },
        divider: true,
      },
    ];
  }

  /**
   * Build context menu items for the canvas background.
   * @returns Standard canvas action items.
   */
  static canvasItems(): ContextMenuItem[] {
    return [
      {
        label: "Add Shape",
        icon: "plus",
        action: () => {
          // Placeholder — consuming app wires this up
        },
      },
      {
        label: "Paste",
        icon: "clipboard",
        action: () => {
          // Placeholder
        },
      },
      {
        label: "Toggle Grid",
        icon: "grid",
        action: () => {
          // Placeholder
        },
        divider: true,
      },
      {
        label: "Reset View",
        icon: "maximize",
        action: () => {
          // Placeholder
        },
      },
    ];
  }
}
