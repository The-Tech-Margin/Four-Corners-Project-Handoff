/**
 * @module core/types
 * Shared interfaces and types for @fourcorners/canvas.
 */

import type { ThemeTokens } from "../theme/tokens";
export type { ThemeTokens };

/** A 2D point in canvas coordinates. */
export interface Point {
  /** Horizontal position */
  x: number;
  /** Vertical position */
  y: number;
}

/** A 2D size with width and height. */
export interface Size {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/** A rectangle defined by position and size. */
export interface Rect {
  /** Left edge x coordinate */
  x: number;
  /** Top edge y coordinate */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/** Categories that classify shape behavior and rendering. */
export type ShapeCategory = "media" | "text" | "container" | "annotation";

/** The interaction mode of the canvas. */
export type CanvasMode = "edit" | "view" | "present";

/** Camera state controlling the viewport transform. */
export interface CameraState {
  /** Horizontal pan offset */
  x: number;
  /** Vertical pan offset */
  y: number;
  /** Zoom level (1 = 100%) */
  zoom: number;
}

/**
 * Serialized representation of a shape.
 * Used for persistence and transport.
 */
export interface ShapeJSON {
  /** Unique identifier */
  id: string;
  /** Shape type key (e.g. 'photo-card', 'text-block') */
  type: string;
  /** Horizontal position */
  x: number;
  /** Vertical position */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Rotation in degrees */
  rotation: number;
  /** Whether the shape is locked from editing */
  locked: boolean;
  /** Shape-specific data payload */
  data: Record<string, unknown>;
  /** Arbitrary metadata attached to the shape */
  metadata: Record<string, unknown>;
}

/**
 * Serialized representation of a zone.
 * Zones are spatial containers that group shapes.
 */
export interface ZoneJSON {
  /** Unique identifier */
  id: string;
  /** Display label (e.g. 'backstory', 'links') */
  label: string;
  /** Bounding rectangle of the zone */
  bounds: Rect;
  /** IDs of shapes contained within the zone */
  shapeIds: string[];
}

/**
 * Serialized representation of a connection between shapes.
 * Reserved for future use.
 */
export interface ConnectionJSON {
  /** Unique identifier */
  id: string;
  /** Source shape ID */
  fromShapeId: string;
  /** Target shape ID */
  toShapeId: string;
  /** Connection type descriptor */
  type: string;
}

/**
 * Full serialized canvas document.
 * This is the top-level structure written to JSON for persistence.
 */
export interface CanvasDocument {
  /** Schema version string */
  version: string;
  /** Canvas configuration */
  canvas: {
    /** Canvas width in pixels */
    width: number;
    /** Canvas height in pixels */
    height: number;
    /** Camera state at time of serialization */
    camera: CameraState;
    /** Grid size in pixels */
    gridSize: number;
  };
  /** All shapes on the canvas */
  shapes: ShapeJSON[];
  /** All zones on the canvas */
  zones: ZoneJSON[];
  /** All connections between shapes */
  connections: ConnectionJSON[];
}

/**
 * Describes a single editable field on a shape.
 * Used to build property editors in the UI.
 */
export interface FieldDefinition {
  /** Unique key identifying this field */
  key: string;
  /** Human-readable label */
  label: string;
  /** Input type for the field editor */
  type: "text" | "number" | "url" | "textarea" | "image" | "audio" | "select";
  /** Options for 'select' type fields */
  options?: string[];
  /** Whether the field must have a value */
  required?: boolean;
}

/**
 * Result of a shape validation check.
 */
export interface ValidationResult {
  /** Whether the shape passed validation */
  valid: boolean;
  /** List of validation error messages */
  errors: string[];
}

/**
 * Context passed to shape render methods.
 * Provides theme, mode, camera, and selection info.
 */
export interface CanvasRenderContext {
  /** Active theme tokens */
  theme: ThemeTokens;
  /** Current canvas mode */
  mode: CanvasMode;
  /** Current camera state */
  camera: CameraState;
  /** Whether this shape is currently selected */
  selected: boolean;
}
