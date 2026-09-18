/**
 * @module react/hooks/useShapes
 * Hook for CRUD operations on shapes within the canvas.
 */

import { useState, useCallback } from 'react';
import type { BaseShape } from '../../shapes/BaseShape';

/** Return type of the {@link useShapes} hook. */
export interface UseShapesReturn {
  /** All shapes currently on the canvas. */
  shapes: BaseShape[];
  /** Add a shape to the canvas. */
  add: (shape: BaseShape) => void;
  /** Remove a shape by ID. */
  remove: (id: string) => void;
  /** Update a shape's properties by ID. */
  update: (id: string, props: Partial<BaseShape>) => void;
  /** Get a shape by ID. */
  get: (id: string) => BaseShape | undefined;
  /** Remove all shapes. */
  clear: () => void;
}

/**
 * Manage shapes on the canvas with add, remove, update, get, and clear operations.
 * @returns Shape CRUD operations and the current shape list.
 */
export function useShapes(): UseShapesReturn {
  const [shapes, setShapes] = useState<BaseShape[]>([]);

  const add = useCallback((shape: BaseShape) => {
    setShapes((prev) => [...prev, shape]);
  }, []);

  const remove = useCallback((id: string) => {
    setShapes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const update = useCallback((id: string, props: Partial<BaseShape>) => {
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        Object.assign(s, props);
        return s;
      })
    );
  }, []);

  const get = useCallback(
    (id: string) => shapes.find((s) => s.id === id),
    [shapes]
  );

  const clear = useCallback(() => {
    setShapes([]);
  }, []);

  return { shapes, add, remove, update, get, clear };
}
