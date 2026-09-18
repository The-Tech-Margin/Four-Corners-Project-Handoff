/**
 * @module shapes/LinkCard
 * URL preview card shape with favicon, title, domain, and clickable overlay.
 */

import Konva from "konva";
import { BaseShape } from "./BaseShape";
import { ShapeRegistry } from "../core/ShapeRegistry";
import type { LinkPreviewData } from "../media/LinkPreview";
import type {
  ShapeCategory,
  ShapeJSON,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
} from "../core/types";

/** Data payload for a LinkCard shape (same fields as LinkPreviewData). */
export type LinkCardData = LinkPreviewData;

/**
 * A link card shape that renders a URL preview with title, domain,
 * optional description, and a clickable HTML overlay.
 */
export class LinkCard extends BaseShape<LinkCardData> {
  readonly type = "link-card";
  readonly label = "Link";
  readonly icon = "link";
  readonly category: ShapeCategory = "media";

  constructor(props?: Partial<BaseShape<LinkCardData>>) {
    super(props);
    this.width = this.width || 300;
    this.height = this.height || 100;
    this.data = {
      url: this.data.url ?? "",
      domain: this.data.domain ?? "",
      title: this.data.title,
      description: this.data.description,
      image: this.data.image,
      favicon: this.data.favicon,
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

    // Favicon placeholder area
    const iconSize = 20;
    const leftPad = 12;
    const textX = leftPad + iconSize + 8;

    group.add(
      new Konva.Rect({
        x: leftPad,
        y: 12,
        width: iconSize,
        height: iconSize,
        fill: ctx.theme.shapePlaceholder,
        cornerRadius: 4,
      }),
    );

    // Title
    const title = this.data.title || this.data.url;
    group.add(
      new Konva.Text({
        x: textX,
        y: 10,
        width: this.width - textX - 12,
        text: title,
        fontSize: ctx.theme.fontSizeBase,
        fontFamily: ctx.theme.fontFamily,
        fontStyle: "bold",
        fill: ctx.theme.textColor,
        ellipsis: true,
        wrap: "none",
      }),
    );

    // Domain
    group.add(
      new Konva.Text({
        x: textX,
        y: 30,
        width: this.width - textX - 12,
        text: this.data.domain,
        fontSize: ctx.theme.fontSizeSmall,
        fontFamily: ctx.theme.fontFamily,
        fill: ctx.theme.textSecondary,
        ellipsis: true,
        wrap: "none",
      }),
    );

    // Description (truncated to 2 lines)
    if (this.data.description) {
      group.add(
        new Konva.Text({
          x: textX,
          y: 48,
          width: this.width - textX - 12,
          height: this.height - 58,
          text: this.data.description,
          fontSize: ctx.theme.fontSizeSmall,
          fontFamily: ctx.theme.fontFamily,
          fill: ctx.theme.textSecondary,
          ellipsis: true,
          wrap: "word",
        }),
      );
    }

    return group;
  }

  /**
   * HTML overlay: transparent clickable link that opens the URL in a new tab.
   */
  renderOverlay(): unknown {
    if (!this.data.url) return null;
    return {
      tag: "a",
      props: {
        href: this.data.url,
        target: "_blank",
        rel: "noopener noreferrer",
        style: {
          display: "block",
          width: `${this.width}px`,
          height: `${this.height}px`,
          opacity: 0,
          cursor: "pointer",
        },
      },
    };
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
    this.data = json.data as unknown as LinkCardData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: "url", label: "URL", type: "url", required: true },
      { key: "title", label: "Title", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.url) errors.push("URL is required.");
    return { valid: errors.length === 0, errors };
  }
}

ShapeRegistry.register(LinkCard);
