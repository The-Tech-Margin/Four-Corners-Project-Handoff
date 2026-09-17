/**
 * @module core/ShapeRegistry
 * Singleton registry for shape type classes.
 * New shape types register themselves here; the engine uses this
 * registry to instantiate shapes from serialized data.
 */

import type { ShapeCategory, ShapeJSON } from "./types";
import { BaseShape } from "../shapes/BaseShape";

/** Constructor type for BaseShape subclasses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BaseShapeConstructor = new (props?: any) => BaseShape<any>;

/**
 * Global registry that maps shape type keys to their constructors.
 *
 * Shape files call `ShapeRegistry.register(MyShape)` at module load time.
 * The engine calls `ShapeRegistry.create(type, props)` to instantiate shapes.
 */
export class ShapeRegistry {
  /** Internal map of type key → constructor. */
  private static registry: Map<string, BaseShapeConstructor> = new Map();

  /**
   * Register a shape class.
   * The type key is read from a temporary instance's `type` property.
   * @param ShapeClass - The shape constructor to register.
   * @throws If a shape with the same type key is already registered.
   */
  static register(ShapeClass: BaseShapeConstructor): void {
    // Create a throwaway instance to read the abstract `type` property.
    const probe = new ShapeClass();
    const typeKey = probe.type;

    if (ShapeRegistry.registry.has(typeKey)) {
      throw new Error(
        `ShapeRegistry: type "${typeKey}" is already registered. Unregister it first or use a different type key.`,
      );
    }

    ShapeRegistry.registry.set(typeKey, ShapeClass);
  }

  /**
   * Retrieve the constructor for a given type key.
   * @param type - The shape type key.
   * @returns The constructor, or undefined if not registered.
   */
  static get(type: string): BaseShapeConstructor | undefined {
    return ShapeRegistry.registry.get(type);
  }

  /**
   * List all registered shape types with their metadata.
   * @returns Array of shape type descriptors.
   */
  static list(): Array<{
    type: string;
    label: string;
    icon: string;
    category: ShapeCategory;
  }> {
    const result: Array<{
      type: string;
      label: string;
      icon: string;
      category: ShapeCategory;
    }> = [];

    for (const [, ShapeClass] of ShapeRegistry.registry) {
      const probe = new ShapeClass();
      result.push({
        type: probe.type,
        label: probe.label,
        icon: probe.icon,
        category: probe.category,
      });
    }

    return result;
  }

  /**
   * Create a new shape instance by type key.
   * @param type - The shape type key.
   * @param props - Optional partial properties to pass to the constructor.
   * @returns A new shape instance.
   * @throws If the type is not registered.
   */
  static create<T extends BaseShape>(type: string, props?: Partial<T>): T {
    const ShapeClass = ShapeRegistry.registry.get(type);

    if (!ShapeClass) {
      throw new Error(
        `ShapeRegistry: type "${type}" is not registered. Available types: ${[...ShapeRegistry.registry.keys()].join(", ")}`,
      );
    }

    return new ShapeClass(props as Partial<BaseShape>) as T;
  }

  /**
   * Create a shape instance from a serialized ShapeJSON object.
   * Instantiates the correct class from the registry and calls deserialize().
   * @param json - The serialized shape data.
   * @returns A fully hydrated shape instance.
   * @throws If the shape type is not registered.
   */
  static fromJSON(json: ShapeJSON): BaseShape {
    const ShapeClass = ShapeRegistry.registry.get(json.type);

    if (!ShapeClass) {
      throw new Error(
        `ShapeRegistry: type "${json.type}" is not registered. Available types: ${[...ShapeRegistry.registry.keys()].join(", ")}`,
      );
    }

    const instance = new ShapeClass();
    instance.deserialize(json);
    return instance;
  }

  /**
   * Remove a registered shape type.
   * Primarily intended for testing.
   * @param type - The shape type key to remove.
   * @returns True if the type was removed, false if it was not registered.
   */
  static unregister(type: string): boolean {
    return ShapeRegistry.registry.delete(type);
  }

  /**
   * Remove all registered shape types.
   * Intended for testing only.
   */
  static clear(): void {
    ShapeRegistry.registry.clear();
  }
}
