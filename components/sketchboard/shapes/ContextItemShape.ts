/**
 * Custom shape for related images/videos (context items).
 * Extends @fourcorners/canvas BaseShape since no built-in shape
 * covers image + media-type badge + caption + contextIndex.
 */

import Konva from "konva";
import {
  BaseShape,
  type ShapeJSON,
  type FieldDefinition,
  type ValidationResult,
  type CanvasRenderContext,
  ShapeRegistry,
} from "@fourcorners/canvas";

export interface ContextItemData {
  /** Image or video source URL / data URI */
  imageSrc: string;
  /** Caption text */
  caption: string;
  /** Media type: image or video */
  mediaType: "image" | "video";
  /** Index into the store's context array */
  contextIndex: number;
}

export class ContextItemShape extends BaseShape<ContextItemData> {
  readonly type = "context-item";
  readonly label = "Context Item";
  readonly icon = "image";
  readonly category = "media" as const;

  constructor(props?: Partial<BaseShape<ContextItemData>>) {
    super({
      width: 180,
      height: 200,
      data: {
        imageSrc: "",
        caption: "",
        mediaType: "image",
        contextIndex: -1,
      },
      ...props,
    });
  }

  render(ctx: CanvasRenderContext): Konva.Group {
    const group = new Konva.Group({ x: 0, y: 0 });

    // Card background
    group.add(
      new Konva.Rect({
        width: this.width,
        height: this.height,
        fill: ctx.theme.canvasBg || "#1a1a2e",
        stroke: ctx.selected
          ? (ctx.theme.accentPrimary || "#a855f7")
          : "rgba(168, 85, 247, 0.3)",
        strokeWidth: ctx.selected ? 2 : 1,
        cornerRadius: 9,
      }),
    );

    // Media type badge
    if (this.data.mediaType === "video") {
      group.add(
        new Konva.Tag({
          x: 8,
          y: 8,
          fill: "rgba(0,0,0,0.6)",
          cornerRadius: 4,
        }),
      );
      group.add(
        new Konva.Text({
          x: 8,
          y: 8,
          text: "VIDEO",
          fontSize: 10,
          fontFamily: "system-ui, sans-serif",
          fill: "#fff",
          padding: 4,
        }),
      );
    }

    // Caption
    if (this.data.caption) {
      group.add(
        new Konva.Text({
          x: 8,
          y: this.height - 36,
          width: this.width - 16,
          text: this.data.caption,
          fontSize: 11,
          fontFamily: "system-ui, sans-serif",
          fill: ctx.theme.textColor || "#e0e0e0",
          wrap: "word",
          ellipsis: true,
          height: 28,
        }),
      );
    }

    return group;
  }

  renderThumbnail(): Konva.Rect {
    return new Konva.Rect({
      width: this.width,
      height: this.height,
      fill: "rgba(168, 85, 247, 0.2)",
      cornerRadius: 4,
    });
  }

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
      data: { ...this.data },
      metadata: { ...this.metadata },
    };
  }

  deserialize(json: ShapeJSON): void {
    this.id = json.id;
    this.x = json.x;
    this.y = json.y;
    this.width = json.width;
    this.height = json.height;
    this.rotation = json.rotation;
    this.locked = json.locked;
    this.data = json.data as unknown as ContextItemData;
    this.metadata = json.metadata;
  }

  getEditableFields(): FieldDefinition[] {
    return [
      { key: "imageSrc", label: "Image URL", type: "image" },
      { key: "caption", label: "Caption", type: "text" },
      { key: "mediaType", label: "Media Type", type: "select", options: ["image", "video"] },
    ];
  }

  validate(): ValidationResult {
    return { valid: true, errors: [] };
  }
}

// Self-register with the shape registry
ShapeRegistry.register(ContextItemShape);
