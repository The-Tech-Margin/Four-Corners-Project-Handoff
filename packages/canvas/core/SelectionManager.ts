/**
 * @module core/SelectionManager
 * Single and multi-select management with Konva Transformer.
 */

import Konva from "konva";
import type { Canvas } from "./Canvas";

/**
 * Manages shape selection state and the Konva Transformer node
 * that provides resize/rotate handles on selected shapes.
 */
export class SelectionManager {
  /** IDs of currently selected shapes. */
  selectedIds: Set<string> = new Set();

  /** The Konva Transformer for visual handles. */
  transformerNode: Konva.Transformer;

  /** Callback fired when selection changes. */
  onSelectionChange?: (ids: string[]) => void;

  private canvas: Canvas;
  private shapeMap: Map<string, Konva.Node> = new Map();

  /**
   * @param canvas - The Canvas engine instance.
   */
  constructor(canvas: Canvas) {
    this.canvas = canvas;

    this.transformerNode = new Konva.Transformer({
      anchorFill: canvas.theme.handleColor,
      anchorSize: canvas.theme.handleSize,
      borderStroke: canvas.theme.shapeSelectedBorder,
      borderDash: [4, 4],
      rotateEnabled: true,
    });

    this.canvas.chromeLayer.add(this.transformerNode);
  }

  /**
   * Register a Konva node for a shape so the transformer can attach to it.
   * @param id - Shape ID.
   * @param node - The Konva node rendered for that shape.
   */
  registerNode(id: string, node: Konva.Node): void {
    this.shapeMap.set(id, node);
  }

  /**
   * Unregister a node when a shape is removed.
   * @param id - Shape ID.
   */
  unregisterNode(id: string): void {
    this.shapeMap.delete(id);
    this.selectedIds.delete(id);
    this.updateTransformer();
  }

  /**
   * Select a single shape (deselects all others).
   * @param id - Shape ID to select.
   */
  select(id: string): void {
    this.selectedIds.clear();
    this.selectedIds.add(id);
    this.updateTransformer();
    this.notifyChange();
  }

  /**
   * Add a shape to the current selection (multi-select).
   * @param id - Shape ID to add.
   */
  addToSelection(id: string): void {
    this.selectedIds.add(id);
    this.updateTransformer();
    this.notifyChange();
  }

  /**
   * Remove a shape from the current selection.
   * @param id - Shape ID to deselect.
   */
  deselect(id: string): void {
    this.selectedIds.delete(id);
    this.updateTransformer();
    this.notifyChange();
  }

  /**
   * Clear all selections.
   */
  deselectAll(): void {
    this.selectedIds.clear();
    this.updateTransformer();
    this.notifyChange();
  }

  /**
   * Check whether a shape is selected.
   * @param id - Shape ID.
   */
  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /**
   * Get the IDs of all selected shapes.
   */
  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  /**
   * Update the Konva Transformer to attach to the currently selected nodes.
   */
  private updateTransformer(): void {
    const nodes: Konva.Node[] = [];
    for (const id of this.selectedIds) {
      const node = this.shapeMap.get(id);
      if (node) nodes.push(node);
    }
    this.transformerNode.nodes(nodes);
    this.canvas.chromeLayer.batchDraw();
  }

  private notifyChange(): void {
    this.onSelectionChange?.([...this.selectedIds]);
  }
}
