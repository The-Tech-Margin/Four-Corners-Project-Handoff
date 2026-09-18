/**
 * @module shapes/VoiceNote
 * Audio recorder shape with waveform visualization.
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

/** Data payload for a VoiceNote shape. */
export interface VoiceNoteData {
  /** Audio blob URL or remote URL. */
  audioUrl?: string;
  /** Normalized waveform amplitudes (0–1). */
  waveform?: number[];
  /** Duration in seconds. */
  duration?: number;
  /** ISO date string of when the recording was made. */
  recordedAt?: string;
}

/**
 * A voice note shape that renders a waveform visualization on the canvas
 * and provides an HTML overlay audio player in view/present modes.
 */
export class VoiceNote extends BaseShape<VoiceNoteData> {
  readonly type = 'voice-note';
  readonly label = 'Voice Note';
  readonly icon = 'mic';
  readonly category: ShapeCategory = 'media';

  constructor(props?: Partial<BaseShape<VoiceNoteData>>) {
    super(props);
    this.width = this.width || 280;
    this.height = this.height || 80;
    this.data = {
      audioUrl: this.data.audioUrl,
      waveform: this.data.waveform,
      duration: this.data.duration,
      recordedAt: this.data.recordedAt,
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
      })
    );

    if (this.data.waveform && this.data.waveform.length > 0) {
      // Render waveform bars
      const barCount = this.data.waveform.length;
      const barWidth = (this.width - 20) / barCount;
      const maxBarHeight = this.height - 20;

      for (let i = 0; i < barCount; i++) {
        const amplitude = this.data.waveform[i];
        const barHeight = Math.max(2, amplitude * maxBarHeight);
        group.add(
          new Konva.Rect({
            x: 10 + i * barWidth,
            y: this.height / 2 - barHeight / 2,
            width: Math.max(1, barWidth - 1),
            height: barHeight,
            fill: ctx.theme.accentPrimary,
            cornerRadius: 1,
          })
        );
      }
    } else {
      // Placeholder text
      group.add(
        new Konva.Text({
          width: this.width,
          height: this.height,
          text: 'Record audio',
          fontSize: ctx.theme.fontSizeBase,
          fontFamily: ctx.theme.fontFamily,
          fill: ctx.theme.textSecondary,
          align: 'center',
          verticalAlign: 'middle',
        })
      );
    }

    // Duration label
    if (this.data.duration != null) {
      const mins = Math.floor(this.data.duration / 60);
      const secs = Math.floor(this.data.duration % 60);
      const label = `${mins}:${secs.toString().padStart(2, '0')}`;
      group.add(
        new Konva.Text({
          x: this.width - 50,
          y: this.height - 18,
          width: 42,
          text: label,
          fontSize: ctx.theme.fontSizeSmall,
          fontFamily: ctx.theme.fontFamily,
          fill: ctx.theme.textSecondary,
          align: 'right',
        })
      );
    }

    return group;
  }

  /**
   * HTML overlay: a minimal audio player with play/pause and progress.
   * This is the interactive element rendered above the Konva canvas.
   * Static fallback for export is the waveform visualization (render method).
   */
  renderOverlay(): unknown {
    if (!this.data.audioUrl) return null;
    // Return a plain object describing the overlay. The React layer
    // (HtmlOverlay / ShapeRenderer) will render this as DOM.
    return {
      tag: 'div',
      props: {
        style: {
          width: `${this.width}px`,
          height: `${this.height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      children: [
        {
          tag: 'audio',
          props: {
            src: this.data.audioUrl,
            controls: true,
            style: { width: '90%', height: '32px' },
          },
        },
      ],
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
      fill: ctx?.theme.shapePlaceholder ?? '#e2e8f0',
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
    this.data = json.data as unknown as VoiceNoteData;
    this.metadata = json.metadata;
  }

  /** @inheritdoc */
  getEditableFields(): FieldDefinition[] {
    return [
      { key: 'audioUrl', label: 'Audio URL', type: 'text' },
      { key: 'recordedAt', label: 'Recorded At', type: 'text' },
    ];
  }

  /** @inheritdoc */
  validate(): ValidationResult {
    const errors: string[] = [];
    if (!this.data.audioUrl) errors.push('Audio URL is required.');
    return { valid: errors.length === 0, errors };
  }
}

ShapeRegistry.register(VoiceNote);
