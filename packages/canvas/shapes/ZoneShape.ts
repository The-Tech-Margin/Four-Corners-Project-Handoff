/**
 * @module shapes/ZoneShape
 * Spatial grouping container for organizing shapes into zones.
 */

import Konva from "konva";
import { BaseShape } from "./BaseShape";
import { ShapeRegistry } from "../core/ShapeRegistry";
import type {
  Point,
  ShapeCategory,
  ShapeJSON,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
} from "../core/types";

/** Data payload for a ZoneShape. */
export interface ZoneData {
  /** Zone label (e.g. 'backstory', 'related-imagery', 'links', 'authorship', 'center'). */
  label: string;
  /** Zone tint color. Defaults to transparent. */
  color?: string;
  /** Whether the zone is collapsed to a compact indicator. */
  collapsed?: boolean;
}

/**
 * A zone container shape that groups other shapes spatially.
 * Zones are layout containers and are not draggable by default.
 */
export class ZoneShape extends BaseShape<ZoneData> {
  readonly type = "zone";
  readonly label = "Zone";
  readonly icon = "square-dashed";
  readonly category: ShapeCategory = "container";

  constructor(props?: Partial<BaseShape<ZoneData>>) {
    super(props);
    this.width = this.width || 600;
    this.height = this.height || 400;
    this.data = {
      label: this.data.label ?? "",
      color: this.data.color,
      collapsed: this.data.collapsed,
    };
  }

  /** @inheritdoc */
  render(ctx: CanvasRenderContext): Konva.Group {
    const group = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      draggable: false,
    });

    if (this.data.collapsed) {
      // Collapsed indicator
      const indicatorSize = 48;
      group.add(
        new Konva.Rect({
          width: indicatorSize,
          height: indicatorSize,
          fill: this.data.color ?? ctx.theme.shapeBorder,
          cornerRadius: ctx.theme.shapeBorderRadius,
          opacity: 0.3,
        }),
      );
      group.add(
        new Konva.Text({
          width: indicatorSize,
          height: indicatorSize,
          text: this.data.label,
          fontSize: ctx.theme.fontSizeSmall,
          fontFamily: ctx.theme.fontFamily,
          fontStyle: "bold",
          fill: ctx.theme.textSecondary,
          align: "center",
          verticalAlign: "middle",
        }),
      );
      return group;
    }

    // Zone boundary
    const strokeColor = this.data.color ?? ctx.theme.shapeBorder;
    group.add(
      new Konva.Rect({
        width: this.width,
        height: this.height,
        stroke: strokeColor,
        strokeWidth: 1,
        dash: [8, 4],
        fill: this.data.color ?? "transparent",
        opacity: 0.05,
        cornerRadius: ctx.theme.shapeBorderRadius,
      }),
    );

    // Visible border on top of the subtle fill
    group.add(
      new Konva.Rect({
        width: this.width,
        height: this.height,
        stroke: strokeColor,
        strokeWidth: 1,
        dash: [8, 4],
        cornerRadius: ctx.theme.shapeBorderRadius,
      }),
    );

    // Label in top-left
    group.add(
      new Konva.Text({
        x: 8,
        y: 6,
        text: this.data.label,
        fontSize: ctx.theme.fontSizeSmall,
        fontFamily: ctx.theme.fontFamily,
        fontStyle: "bold",
        fill: ctx.theme.textSecondary,
      }),
    );

    return group;
  }

  /** @inheritdoc */
  renderThumbnail(ctx?: CanvasRenderContext): Konva.Rect {
    return new Konva.Rect({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      stroke: this.data.color ?? ctx?.theme.shapeBorder ?? "#cbd5e1",
      strokeWidth: 1,
      dash: [4, 2],
      cornerRadius: 4,
    });
  }

  /**
   * Override drag end to snap to grid.
   * @param position - The dragged-to position.
   * @returns The snapped position.
   */
  onDragEnd(position: Point): Point {
    const gridSize = 20;
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize,
    };
  }

  /** @inheritdoc */
  serialize(): ShapeJSON {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      locked: this.locked,
      data: { ...this.data } as unknown as Record<string, unknown>,
      metadata: { ...this.metadata },
    };
  }

  /** @inheritdoc */
  deserialize(json: ShapeJSON): void {
    this.id = json.id;
    this.x = json.x;
    this.y = json.y;
    this.width = json.width;
    this.height = json.height;
    this.rotation = json.rotation;
    this.locked = json.locked;
    this.data = json.data as unknown as ZoneData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "color", label: "Color", type: "text" },
      {
        key: "collapsed",
        label: "Collapsed",
        type: "select",
        options: ["true", "false"],
      },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.label) errors.push("Zone label is required.");
    return { valid: errors.length === 0, errors };
  }

  /** @inheritdoc */
  toProtocol(): Record<string, unknown> {
    return {
      type: "zone",
      label: this.data.label,
      bounds: { x: this.x, y: this.y, width: this.width, height: this.height },
    };
  }
}

ShapeRegistry.register(ZoneShape);
