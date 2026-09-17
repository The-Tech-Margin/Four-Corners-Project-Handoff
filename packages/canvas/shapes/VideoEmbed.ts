/**
 * @module shapes/VideoEmbed
 * Video player shape with poster frame and HTML overlay for playback.
 */

import Konva from 'konva';
import { BaseShape } from './BaseShape';
import { ShapeRegistry } from '../core/ShapeRegistry';
import type {
  ShapeCategory,
  ShapeJSON,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
} from '../core/types';

/** Data payload for a VideoEmbed shape. */
export interface VideoData {
  /** Video source URL. */
  src: string;
  /** Poster frame image URL. */
  posterSrc?: string;
  /** Video duration in seconds. */
  duration?: number;
  /** Whether the video should start muted. */
  muted?: boolean;
}

/**
 * A video embed shape that shows a poster frame in edit mode
 * and an interactive HTML video player in view/present modes.
 */
export class VideoEmbed extends BaseShape<VideoData> {
  readonly type = 'video-embed';
  readonly label = 'Video';
  readonly icon = 'video';
  readonly category: ShapeCategory = 'media';

  constructor(props?: Partial<BaseShape<VideoData>>) {
    super(props);
    this.width = this.width || 320;
    this.height = this.height || 180;
    this.data = {
      src: this.data.src ?? '',
      posterSrc: this.data.posterSrc,
      duration: this.data.duration,
      muted: this.data.muted,
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
        fill: ctx.theme.videoBg,
        cornerRadius: ctx.theme.shapeBorderRadius,
        stroke: borderColor,
        strokeWidth: ctx.selected ? 2 : 1,
      })
    );

    // Play icon overlay (triangle) — shown in edit mode as poster indicator
    if (ctx.mode === 'edit') {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const triRadius = 20;

      group.add(
        new Konva.Circle({
          x: cx,
          y: cy,
          radius: triRadius + 8,
          fill: ctx.theme.overlayBg,
        })
      );

      group.add(
        new Konva.RegularPolygon({
          x: cx + 3,
          y: cy,
          sides: 3,
          radius: triRadius,
          fill: ctx.theme.badgeText,
          rotation: 90,
        })
      );
    }

    // Duration label
    if (this.data.duration != null) {
      const mins = Math.floor(this.data.duration / 60);
      const secs = Math.floor(this.data.duration % 60);
      const label = `${mins}:${secs.toString().padStart(2, '0')}`;

      group.add(
        new Konva.Rect({
          x: this.width - 58,
          y: this.height - 26,
          width: 48,
          height: 20,
          fill: ctx.theme.overlayBg,
          cornerRadius: 4,
        })
      );

      group.add(
        new Konva.Text({
          x: this.width - 58,
          y: this.height - 26,
          width: 48,
          height: 20,
          text: label,
          fontSize: 12,
          fontFamily: ctx.theme.fontFamily,
          fill: ctx.theme.badgeText,
          align: 'center',
          verticalAlign: 'middle',
        })
      );
    }

    return group;
  }

  /**
   * HTML overlay: a <video> element with native controls.
   * Only rendered in view/present mode (ShapeRenderer handles this).
   */
  renderOverlay(): unknown {
    if (!this.data.src) return null;
    return {
      tag: 'video',
      props: {
        src: this.data.src,
        controls: true,
        muted: this.data.muted ?? false,
        playsInline: true,
        poster: this.data.posterSrc,
        style: {
          width: `${this.width}px`,
          height: `${this.height}px`,
          borderRadius: '9px',
          objectFit: 'cover',
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
      fill: ctx?.theme.videoBg ?? '#1a1a2e',
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
    this.data = json.data as unknown as VideoData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: 'src', label: 'Video URL', type: 'url', required: true },
      { key: 'posterSrc', label: 'Poster Image', type: 'image' },
      { key: 'muted', label: 'Muted', type: 'select', options: ['true', 'false'] },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.src) errors.push('Video source URL is required.');
    return { valid: errors.length === 0, errors };
  }
}

ShapeRegistry.register(VideoEmbed);
