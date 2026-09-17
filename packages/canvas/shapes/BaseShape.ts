/**
 * @module shapes/BaseShape
 * Abstract base class for all canvas shapes.
 * Every shape type extends this class and self-describes its type,
 * rendering, serialization, validation, and editable fields.
 */

import type {
  Point,
  ShapeCategory,
  ShapeJSON,
  FieldDefinition,
  ValidationResult,
  CanvasRenderContext,
} from '../core/types';

/**
 * Abstract base class for all shapes on the canvas.
 *
 * @typeParam TData - Shape-specific data payload type.
 *
 * Subclasses must implement all abstract properties and methods.
 * Optional hook methods have default no-op implementations.
 */
export abstract class BaseShape<TData = Record<string, unknown>> {
  /** Shape type key used for registry lookup (e.g. 'photo-card'). */
  abstract readonly type: string;

  /** Human-readable label shown in the palette and inspector. */
  abstract readonly label: string;

  /** Icon identifier (e.g. 'image', 'type', 'mic'). */
  abstract readonly icon: string;

  /** Category that classifies shape behavior. */
  abstract readonly category: ShapeCategory;

  /** Unique identifier for this shape instance. */
  id: string;

  /** Horizontal position on the canvas. */
  x: number;

  /** Vertical position on the canvas. */
  y: number;

  /** Width in pixels. */
  width: number;

  /** Height in pixels. */
  height: number;

  /** Rotation in degrees. */
  rotation: number;

  /** Whether the shape is locked from editing. */
  locked: boolean;

  /** Shape-specific data payload. */
  data: TData;

  /** Arbitrary metadata attached to the shape. */
  metadata: Record<string, unknown>;

  /**
   * Create a new shape instance.
   * @param props - Partial properties to initialize the shape with.
   */
  constructor(props?: Partial<BaseShape<TData>>) {
    this.id = props?.id ?? this.generateId();
    this.x = props?.x ?? 0;
    this.y = props?.y ?? 0;
    this.width = props?.width ?? 0;
    this.height = props?.height ?? 0;
    this.rotation = props?.rotation ?? 0;
    this.locked = props?.locked ?? false;
    this.data = (props?.data ?? {}) as TData;
    this.metadata = props?.metadata ?? {};
  }

  /**
   * Render the shape as Konva node(s).
   * @param ctx - Render context with theme, mode, camera, and selection state.
   * @returns Konva node or group. Uses `any` because Konva node types vary by shape.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract render(ctx: CanvasRenderContext): any;

  /**
   * Render a simplified thumbnail representation of the shape.
   * @returns Konva node for thumbnail display.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract renderThumbnail(): any;

  /**
   * Serialize the shape to a plain JSON object.
   * @returns Serialized shape data.
   */
  abstract serialize(): ShapeJSON;

  /**
   * Restore shape state from a serialized JSON object.
   * @param json - Previously serialized shape data.
   */
  abstract deserialize(json: ShapeJSON): void;

  /**
   * Describe the editable fields for the property inspector.
   * @returns Array of field definitions.
   */
  abstract getEditableFields(): FieldDefinition[];

  /**
   * Validate the current shape state.
   * @returns Validation result with any error messages.
   */
  abstract validate(): ValidationResult;

  /**
   * Optional HTML overlay rendered above the Konva canvas.
   * Used for interactive elements like audio players, clickable links, etc.
   * Only implement in shapes that need DOM-based interactivity.
   *
   * NOTE: Imports React type only; does not depend on react-dom.
   */
  renderOverlay?(): unknown;

  /**
   * Called when the shape becomes selected.
   * Override to add custom selection behavior.
   */
  onSelect(): void {
    // no-op
  }

  /**
   * Called when the shape is deselected.
   * Override to add custom deselection behavior.
   */
  onDeselect(): void {
    // no-op
  }

  /**
   * Called on double-click / double-tap.
   * Override to trigger inline editing or other actions.
   */
  onDoubleClick(): void {
    // no-op
  }

  /**
   * Called after a drag operation ends.
   * Override to apply snapping or constraints.
   * @param position - The position the shape was dragged to.
   * @returns The final position (unchanged by default).
   */
  onDragEnd(position: Point): Point {
    return position;
  }

  /**
   * Map shape data to a protocol-specific output format.
   * Override in shapes that need to export to Four Corners or other protocols.
   * @returns Protocol-specific data object.
   */
  toProtocol(): Record<string, unknown> {
    return {};
  }

  /**
   * Generate a unique identifier.
   * Uses crypto.randomUUID() with a Math.random hex fallback
   * for environments that lack crypto support.
   * @returns A UUID string.
   */
  protected generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
