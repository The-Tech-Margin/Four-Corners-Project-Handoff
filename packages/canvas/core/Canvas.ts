/**
 * @module core/Canvas
 * Stage manager wrapping Konva.Stage with camera control,
 * three-layer architecture, and dot grid rendering.
 */

import Konva from "konva";
import type { CameraState, CanvasMode, Rect, ThemeTokens } from "./types";
import type { BaseShape } from "../shapes/BaseShape";

/** Options for constructing a Canvas instance. */
export interface CanvasOptions {
  /** DOM element or CSS selector for the stage container. */
  container: HTMLDivElement | string;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
  /** Theme tokens for visual styling. */
  theme: ThemeTokens;
}

/**
 * Manages the Konva Stage lifecycle, three rendering layers,
 * camera (pan/zoom), mode switching, and dot grid background.
 */
export class Canvas {
  /** The Konva stage instance. */
  stage: Konva.Stage;

  /** Background layer: dot grid, zone boundaries. Not listening for events. */
  backgroundLayer: Konva.Layer;

  /** Content layer: all user shapes. */
  contentLayer: Konva.Layer;

  /** Chrome layer: selection handles, snap guides, drag previews. */
  chromeLayer: Konva.Layer;

  /** Current camera state (pan + zoom). */
  camera: CameraState;

  /** Current interaction mode. */
  mode: CanvasMode;

  /** Active theme tokens. */
  theme: ThemeTokens;

  /**
   * Create a Canvas.
   * @param options - Configuration for stage, size, and theme.
   */
  constructor(options: CanvasOptions) {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.mode = "edit";
    this.theme = options.theme;

    this.stage = new Konva.Stage({
      container: options.container,
      width: options.width,
      height: options.height,
    });

    // Background layer — not listening for events
    this.backgroundLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.backgroundLayer);

    // Content layer — all shapes
    this.contentLayer = new Konva.Layer();
    this.stage.add(this.contentLayer);

    // Chrome layer — selection handles, snap guides
    this.chromeLayer = new Konva.Layer();
    this.stage.add(this.chromeLayer);

    this.drawGrid();
    this.stage.on("wheel", this.handleWheel.bind(this));
  }

  /**
   * Update the camera state (pan and/or zoom).
   * @param camera - Partial camera state to merge.
   */
  setCamera(camera: Partial<CameraState>): void {
    this.camera = { ...this.camera, ...camera };

    this.stage.position({ x: this.camera.x, y: this.camera.y });
    this.stage.scale({ x: this.camera.zoom, y: this.camera.zoom });
    this.stage.batchDraw();
    this.drawGrid();
  }

  /**
   * Switch the interaction mode.
   * In 'edit' mode shapes are draggable. In 'view' and 'present' they are locked.
   * @param mode - The new canvas mode.
   */
  setMode(mode: CanvasMode): void {
    this.mode = mode;
    const draggable = mode === "edit";

    this.contentLayer.children.forEach((node) => {
      node.draggable(draggable && !node.getAttr("locked"));
    });

    this.contentLayer.listening(true);
    this.chromeLayer.visible(mode === "edit");
    this.stage.batchDraw();
  }

  /**
   * Replace the active theme and redraw the background.
   * @param theme - New theme tokens.
   */
  setTheme(theme: ThemeTokens): void {
    this.theme = theme;
    this.drawGrid();
  }

  /**
   * Get the visible viewport rectangle in canvas coordinates,
   * accounting for the current camera transform.
   * @returns The visible area.
   */
  getViewport(): Rect {
    const scale = this.camera.zoom;
    return {
      x: -this.camera.x / scale,
      y: -this.camera.y / scale,
      width: this.stage.width() / scale,
      height: this.stage.height() / scale,
    };
  }

  /**
   * Reset the camera to center on the content bounds.
   */
  toCenter(): void {
    const box = this.contentLayer.getClientRect();
    if (!box || (box.width === 0 && box.height === 0)) {
      this.setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    this.setCamera({
      x: this.stage.width() / 2 - cx * this.camera.zoom,
      y: this.stage.height() / 2 - cy * this.camera.zoom,
    });
  }

  /**
   * Zoom and pan to fit all shapes within the viewport.
   * @param padding - Extra padding in pixels around the content.
   */
  fitToContent(padding = 40): void {
    const box = this.contentLayer.getClientRect();
    if (!box || (box.width === 0 && box.height === 0)) {
      this.setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }

    const stageW = this.stage.width();
    const stageH = this.stage.height();
    const zoom = Math.min(
      (stageW - padding * 2) / box.width,
      (stageH - padding * 2) / box.height,
      5,
    );

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    this.setCamera({
      x: stageW / 2 - cx * zoom,
      y: stageH / 2 - cy * zoom,
      zoom,
    });
  }

  /** Internal map of shape ID → Konva node for shape management. */
  private shapeNodes: Map<string, Konva.Group> = new Map();

  /** Internal map of shape ID → BaseShape instance. */
  private shapeInstances: Map<string, BaseShape> = new Map();

  /**
   * Pan the camera to a specific position.
   * @param x - Target x position.
   * @param y - Target y position.
   * @param _animated - Reserved for future animation support.
   */
  panTo(x: number, y: number, _animated?: boolean): void {
    this.setCamera({ x, y });
  }

  /**
   * Zoom the camera to a specific level.
   * @param zoom - Target zoom level (clamped 0.1–5).
   * @param center - Optional center point to zoom around.
   * @param _animated - Reserved for future animation support.
   */
  zoomTo(
    zoom: number,
    center?: { x: number; y: number },
    _animated?: boolean,
  ): void {
    const clampedZoom = Math.min(Math.max(zoom, 0.1), 5);
    if (center) {
      const mousePointTo = {
        x: (center.x - this.camera.x) / this.camera.zoom,
        y: (center.y - this.camera.y) / this.camera.zoom,
      };
      this.setCamera({
        zoom: clampedZoom,
        x: center.x - mousePointTo.x * clampedZoom,
        y: center.y - mousePointTo.y * clampedZoom,
      });
    } else {
      this.setCamera({ zoom: clampedZoom });
    }
  }

  /**
   * Pan and zoom to fit a specific rectangle within the viewport.
   * @param rect - The target bounding rectangle.
   * @param padding - Extra padding in pixels (default 40).
   */
  fitBounds(rect: Rect, padding = 40): void {
    const stageW = this.stage.width();
    const stageH = this.stage.height();
    const zoom = Math.min(
      (stageW - padding * 2) / rect.width,
      (stageH - padding * 2) / rect.height,
      5,
    );
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    this.setCamera({
      x: stageW / 2 - cx * zoom,
      y: stageH / 2 - cy * zoom,
      zoom,
    });
  }

  /**
   * Get the visible viewport bounds in canvas coordinates.
   * Alias for getViewport().
   * @returns The viewport rectangle.
   */
  getViewportBounds(): Rect {
    return this.getViewport();
  }

  /**
   * Add a shape to the canvas content layer.
   * @param shape - The BaseShape instance to add.
   */
  addShape(shape: BaseShape): void {
    this.shapeInstances.set(shape.id, shape);
    // Render is handled by the React layer (ShapeRenderer).
    // This tracks the shape for getShapes/removeShape.
  }

  /**
   * Remove a shape from the canvas by ID.
   * @param id - The shape ID to remove.
   */
  removeShape(id: string): void {
    this.shapeInstances.delete(id);
    const node = this.shapeNodes.get(id);
    if (node) {
      node.destroy();
      this.shapeNodes.delete(id);
      this.contentLayer.batchDraw();
    }
  }

  /**
   * Get all tracked shape instances.
   * @returns Array of BaseShape instances.
   */
  getShapes(): BaseShape[] {
    return [...this.shapeInstances.values()];
  }

  /**
   * Export the canvas stage to a data URL (PNG by default).
   * @param pixelRatio - Pixel ratio for the export (default 2).
   * @returns A base64-encoded data URL string.
   */
  toDataURL(pixelRatio = 2): string {
    return this.stage.toDataURL({ pixelRatio });
  }

  /**
   * Destroy the stage and clean up resources.
   */
  destroy(): void {
    this.shapeNodes.clear();
    this.shapeInstances.clear();
    this.stage.destroy();
  }

  /**
   * Draw a dot grid on the background layer using theme tokens.
   */
  private drawGrid(): void {
    this.backgroundLayer.destroyChildren();

    const viewport = this.getViewport();
    const gridSize = this.theme.canvasGridSize;
    const dotSize = this.theme.canvasDotSize;

    const startX = Math.floor(viewport.x / gridSize) * gridSize;
    const startY = Math.floor(viewport.y / gridSize) * gridSize;
    const endX = viewport.x + viewport.width;
    const endY = viewport.y + viewport.height;

    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        this.backgroundLayer.add(
          new Konva.Circle({
            x,
            y,
            radius: dotSize / 2,
            fill: this.theme.canvasDot,
            listening: false,
          }),
        );
      }
    }

    this.backgroundLayer.batchDraw();
  }

  /**
   * Handle mouse wheel for zoom.
   * Scales the stage around the pointer position, clamped between 0.1 and 5.
   */
  private handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const oldScale = this.camera.zoom;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - this.camera.x) / oldScale,
      y: (pointer.y - this.camera.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(
      Math.max(oldScale * Math.pow(scaleBy, direction), 0.1),
      5,
    );

    this.setCamera({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }
}
