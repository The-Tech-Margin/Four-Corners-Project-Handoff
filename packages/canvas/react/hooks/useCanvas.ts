/**
 * @module react/hooks/useCanvas
 * Hook to access the core Canvas engine from React.
 */

import { useCanvasContext } from '../CanvasProvider';
import type { Canvas } from '../../core/Canvas';

/**
 * Access the Canvas engine instance from the nearest CanvasProvider.
 * @returns The Canvas instance.
 * @throws If the canvas is not yet initialized or used outside a CanvasProvider.
 */
export function useCanvas(): Canvas {
  const { canvas } = useCanvasContext();
  if (!canvas) {
    throw new Error('useCanvas: Canvas is not initialized yet. Ensure CanvasProvider has mounted.');
  }
  return canvas;
}
