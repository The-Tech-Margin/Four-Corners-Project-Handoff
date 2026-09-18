/**
 * @module core/Serializer
 * Serialization and deserialization of CanvasDocument JSON.
 */

import type { Canvas } from "./Canvas";
import type {
  CanvasDocument,
  ShapeJSON,
  ValidationResult,
  ZoneJSON,
} from "./types";
import { ShapeRegistry } from "./ShapeRegistry";
import type { BaseShape } from "../shapes/BaseShape";

/**
 * Converts between live canvas state and the CanvasDocument JSON format.
 */
export class Serializer {
  /**
   * Serialize the current canvas and shapes into a CanvasDocument.
   * @param canvas - The Canvas engine instance.
   * @param shapes - All shapes on the canvas.
   * @returns A full CanvasDocument object.
   */
  static serialize(canvas: Canvas, shapes: BaseShape[]): CanvasDocument {
    const shapeJsons: ShapeJSON[] = shapes.map((s) => s.serialize());

    // Build zone list from zone-type shapes, calculating contained shape IDs
    const zones: ZoneJSON[] = shapes
      .filter((s) => s.type === "zone")
      .map((zone) => {
        const contained = shapes
          .filter((s) => s.id !== zone.id && Serializer.isWithinBounds(s, zone))
          .map((s) => s.id);

        return {
          id: zone.id,
          label: (zone.data as { label?: string }).label ?? "",
          bounds: {
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
          },
          shapeIds: contained,
        };
      });

    return {
      version: "0.1.0",
      canvas: {
        width: canvas.stage.width(),
        height: canvas.stage.height(),
        camera: { ...canvas.camera },
        gridSize: canvas.theme.canvasGridSize,
      },
      shapes: shapeJsons,
      zones,
      connections: [],
    };
  }

  /**
   * Deserialize a CanvasDocument into canvas config and shape instances.
   * Does NOT create a Canvas instance — that is the caller's responsibility.
   * @param doc - The CanvasDocument to deserialize.
   * @returns Canvas configuration and an array of shape instances.
   */
  static deserialize(doc: CanvasDocument): {
    canvasConfig: CanvasDocument["canvas"];
    shapes: BaseShape[];
  } {
    const shapes: BaseShape[] = [];

    for (const shapeJson of doc.shapes) {
      const ShapeClass = ShapeRegistry.get(shapeJson.type);
      if (!ShapeClass) {
        // Skip unknown shape types rather than crashing
        continue;
      }
      const instance = new ShapeClass();
      instance.deserialize(shapeJson);
      shapes.push(instance);
    }

    return {
      canvasConfig: doc.canvas,
      shapes,
    };
  }

  /**
   * Convert a CanvasDocument to a formatted JSON string.
   * @param doc - The document to stringify.
   * @returns JSON string with 2-space indentation.
   */
  static toJSON(doc: CanvasDocument): string {
    return JSON.stringify(doc, null, 2);
  }

  /**
   * Parse a JSON string into a CanvasDocument.
   * @param json - The JSON string to parse.
   * @returns The parsed CanvasDocument.
   * @throws If the JSON is invalid.
   */
  static fromJSON(json: string): CanvasDocument {
    const doc = JSON.parse(json) as CanvasDocument;
    const validation = Serializer.validate(doc);
    if (!validation.valid) {
      throw new Error(
        `Invalid CanvasDocument: ${validation.errors.join("; ")}`,
      );
    }
    return doc;
  }

  /**
   * Validate a CanvasDocument structure.
   * Checks version, shapes array, registered types, and duplicate IDs.
   * @param doc - The document to validate.
   * @returns Validation result.
   */
  static validate(doc: CanvasDocument): ValidationResult {
    const errors: string[] = [];

    if (!doc.version) {
      errors.push("Missing version field.");
    }

    if (!Array.isArray(doc.shapes)) {
      errors.push("Missing or invalid shapes array.");
    } else {
      const ids = new Set<string>();
      for (const shape of doc.shapes) {
        if (!shape.id) {
          errors.push("Shape missing id.");
        } else if (ids.has(shape.id)) {
          errors.push(`Duplicate shape id: ${shape.id}`);
        } else {
          ids.add(shape.id);
        }

        if (!shape.type) {
          errors.push(`Shape ${shape.id ?? "(unknown)"} missing type.`);
        } else if (!ShapeRegistry.get(shape.type)) {
          errors.push(`Unregistered shape type: ${shape.type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check whether a shape's center falls within another shape's bounds.
   */
  private static isWithinBounds(inner: BaseShape, outer: BaseShape): boolean {
    const cx = inner.x + inner.width / 2;
    const cy = inner.y + inner.height / 2;
    return (
      cx >= outer.x &&
      cx <= outer.x + outer.width &&
      cy >= outer.y &&
      cy <= outer.y + outer.height
    );
  }
}
