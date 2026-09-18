/**
 * @module shapes/TextBlock
 * Rich text shape with styling options.
 */

import Konva from "konva";
import { BaseShape } from "./BaseShape";
import { ShapeRegistry } from "../core/ShapeRegistry";
import type {
  ShapeCategory,
  ShapeJSON,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
} from "../core/types";

/** Data payload for a TextBlock shape. */
export interface TextBlockData {
  /** Text content. */
  content: string;
  /** Font size override (defaults to theme.fontSizeBase). */
  fontSize?: number;
  /** Font weight variant. */
  fontWeight?: "normal" | "bold";
  /** Text alignment. */
  textAlign?: "left" | "center" | "right";
  /** Optional background color for note-style blocks. */
  backgroundColor?: string;
}

/**
 * A text block shape that renders styled text on the canvas.
 */
export class TextBlock extends BaseShape<TextBlockData> {
  readonly type = "text-block";
  readonly label = "Text";
  readonly icon = "type";
  readonly category: ShapeCategory = "text";

  constructor(props?: Partial<BaseShape<TextBlockData>>) {
    super(props);
    this.width = this.width || 240;
    this.height = this.height || 120;
    this.data = {
      content: this.data.content ?? "",
      fontSize: this.data.fontSize,
      fontWeight: this.data.fontWeight ?? "normal",
      textAlign: this.data.textAlign ?? "left",
      backgroundColor: this.data.backgroundColor,
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
      draggable: !this.locked,
    });

    // Optional background
    if (this.data.backgroundColor) {
      group.add(
        new Konva.Rect({
          width: this.width,
          height: this.height,
          fill: this.data.backgroundColor,
          cornerRadius: ctx.theme.shapeBorderRadius,
        }),
      );
    }

    // Selection border
    if (ctx.selected) {
      group.add(
        new Konva.Rect({
          width: this.width,
          height: this.height,
          stroke: ctx.theme.shapeSelectedBorder,
          strokeWidth: 2,
          dash: [6, 3],
          cornerRadius: ctx.theme.shapeBorderRadius,
        }),
      );
    }

    // Text content
    const fontSize = this.data.fontSize ?? ctx.theme.fontSizeBase;
    group.add(
      new Konva.Text({
        x: 8,
        y: 8,
        width: this.width - 16,
        height: this.height - 16,
        text: this.data.content,
        fontSize,
        fontFamily: ctx.theme.fontFamily,
        fontStyle: this.data.fontWeight === "bold" ? "bold" : "normal",
        fill: ctx.theme.textColor,
        align: this.data.textAlign ?? "left",
        wrap: "word",
      }),
    );

    return group;
  }

  /** @inheritdoc */
  /** @inheritdoc */
  renderThumbnail(ctx?: CanvasRenderContext): Konva.Text {
    return new Konva.Text({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      text: this.data.content,
      fontSize: 10,
      fill: ctx?.theme.textSecondary ?? "#64748b",
      wrap: "word",
    });
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
    this.data = json.data as unknown as TextBlockData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: "content", label: "Content", type: "textarea", required: true },
      { key: "fontSize", label: "Font Size", type: "number" },
      {
        key: "fontWeight",
        label: "Font Weight",
        type: "select",
        options: ["normal", "bold"],
      },
      {
        key: "textAlign",
        label: "Alignment",
        type: "select",
        options: ["left", "center", "right"],
      },
      { key: "backgroundColor", label: "Background Color", type: "text" },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.content) errors.push("Text content is required.");
    return { valid: errors.length === 0, errors };
  }
}

ShapeRegistry.register(TextBlock);
