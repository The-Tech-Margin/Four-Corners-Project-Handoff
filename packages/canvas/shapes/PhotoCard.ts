/**
 * @module shapes/PhotoCard
 * Image shape with metadata fields for photography.
 * Supports nonfiction photography labeling.
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

/** Data payload for a PhotoCard shape. */
export interface PhotoCardData {
  /** Image URL or data URI. */
  imageUrl: string;
  /** Optional caption displayed below the image. */
  caption?: string;
  /** Photographer or agency credit. */
  credit?: string;
  /** Date associated with the photograph. */
  date?: string;
  /** Whether the image carries a nonfiction photography label. */
  nfLabel?: boolean;
  /** Which Four Corners corner this card belongs to. */
  cornerKey?: "backstory" | "context" | "links" | "authorship";
}

/**
 * A photo card shape that renders an image with optional caption,
 * credit, and nonfiction label badge.
 */
export class PhotoCard extends BaseShape<PhotoCardData> {
  readonly type = "photo-card";
  readonly label = "Photo Card";
  readonly icon = "image";
  readonly category: ShapeCategory = "media";

  constructor(props?: Partial<BaseShape<PhotoCardData>>) {
    super(props);
    this.width = this.width || 280;
    this.height = this.height || 320;
    this.data = {
      imageUrl: this.data.imageUrl ?? "",
      caption: this.data.caption,
      credit: this.data.credit,
      date: this.data.date,
      nfLabel: this.data.nfLabel,
      cornerKey: this.data.cornerKey,
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

    // Card background
    const borderColor = ctx.selected
      ? ctx.theme.shapeSelectedBorder
      : ctx.theme.shapeBorder;

    group.add(
      new Konva.Rect({
        width: this.width,
        height: this.height,
        fill: ctx.theme.shapeSurface,
        cornerRadius: ctx.theme.shapeBorderRadius,
        stroke: borderColor,
        strokeWidth: ctx.selected ? 2 : 1,
      }),
    );

    // Image area — scaled placeholder
    const captionHeight = this.data.caption ? 40 : 0;
    const imgHeight = this.height - captionHeight;
    group.add(
      new Konva.Rect({
        width: this.width,
        height: imgHeight,
        cornerRadius: [
          ctx.theme.shapeBorderRadius,
          ctx.theme.shapeBorderRadius,
          this.data.caption ? 0 : ctx.theme.shapeBorderRadius,
          this.data.caption ? 0 : ctx.theme.shapeBorderRadius,
        ],
        fill: ctx.theme.shapePlaceholder,
      }),
    );

    // Caption text
    if (this.data.caption) {
      group.add(
        new Konva.Text({
          y: imgHeight + 6,
          x: 8,
          width: this.width - 16,
          text: this.data.caption,
          fontSize: ctx.theme.fontSizeSmall,
          fontFamily: ctx.theme.fontFamily,
          fill: ctx.theme.textColor,
          ellipsis: true,
          wrap: "none",
        }),
      );
    }

    // NF badge (top-right)
    if (this.data.nfLabel) {
      const badgeSize = 24;
      group.add(
        new Konva.Rect({
          x: this.width - badgeSize - 6,
          y: 6,
          width: badgeSize,
          height: badgeSize,
          fill: ctx.theme.accentPrimary,
          cornerRadius: 4,
        }),
      );
      group.add(
        new Konva.Text({
          x: this.width - badgeSize - 6,
          y: 6,
          width: badgeSize,
          height: badgeSize,
          text: "NF",
          fontSize: 11,
          fontFamily: ctx.theme.fontFamily,
          fontStyle: "bold",
          fill: ctx.theme.badgeText,
          align: "center",
          verticalAlign: "middle",
        }),
      );
    }

    return group;
  }

  /** @inheritdoc */
  /** @inheritdoc */
  renderThumbnail(ctx?: CanvasRenderContext): Konva.Rect {
    return new Konva.Rect({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      fill: ctx?.theme.shapePlaceholder ?? "#e2e8f0",
      cornerRadius: 4,
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
    this.data = json.data as unknown as PhotoCardData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: "imageUrl", label: "Image", type: "image", required: true },
      { key: "caption", label: "Caption", type: "textarea" },
      { key: "credit", label: "Credit", type: "text" },
      { key: "date", label: "Date", type: "text" },
      {
        key: "nfLabel",
        label: "NF Label",
        type: "select",
        options: ["true", "false"],
      },
      {
        key: "cornerKey",
        label: "Corner",
        type: "select",
        options: ["backstory", "context", "links", "authorship"],
      },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.imageUrl) errors.push("Image URL (imageUrl) is required.");
    if (this.data.caption && this.data.caption.length > 500) {
      errors.push("Caption must be 500 characters or fewer.");
    }
    return { valid: errors.length === 0, errors };
  }

  /** @inheritdoc */
  toProtocol(): Record<string, unknown> {
    return {
      type: "photograph",
      imageUrl: this.data.imageUrl,
      caption: this.data.caption,
      credit: this.data.credit,
      date: this.data.date,
      nonfiction: this.data.nfLabel,
      cornerKey: this.data.cornerKey,
    };
  }
}

ShapeRegistry.register(PhotoCard);
