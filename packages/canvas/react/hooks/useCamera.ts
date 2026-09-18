/**
 * @module react/hooks/useCamera
 * Hook for pan/zoom control of the canvas camera.
 */

import { useState, useCallback } from 'react';
import type { CameraState } from '../../core/types';
import { useCanvasContext } from '../CanvasProvider';

/** Return type of the {@link useCamera} hook. */
export interface UseCameraReturn {
  /** Current camera state. */
  camera: CameraState;
  /** Update the camera (pan and/or zoom). */
  setCamera: (c: Partial<CameraState>) => void;
  /** Zoom in by one step. */
  zoomIn: () => void;
  /** Zoom out by one step. */
  zoomOut: () => void;
  /** Reset camera to origin with zoom 1. */
  resetView: () => void;
  /** Zoom to fit all content. */
  fitToContent: () => void;
}

/**
 * Control the canvas camera with pan, zoom, reset, and fit operations.
 * @returns Camera state and control methods.
 */
export function useCamera(): UseCameraReturn {
  const { canvas } = useCanvasContext();
  const [camera, setCameraState] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });

  const setCamera = useCallback(
    (c: Partial<CameraState>) => {
      const next = { ...camera, ...c };
      setCameraState(next);
      canvas?.setCamera(next);
    },
    [canvas, camera]
  );

  const zoomIn = useCallback(() => {
    const next = Math.min(camera.zoom * 1.2, 5);
    setCamera({ zoom: next });
  }, [camera.zoom, setCamera]);

  const zoomOut = useCallback(() => {
    const next = Math.max(camera.zoom / 1.2, 0.1);
    setCamera({ zoom: next });
  }, [camera.zoom, setCamera]);

  const resetView = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }, [setCamera]);

  const fitToContent = useCallback(() => {
    canvas?.fitToContent();
    if (canvas) {
      setCameraState({ ...canvas.camera });
    }
  }, [canvas]);

  return { camera, setCamera, zoomIn, zoomOut, resetView, fitToContent };
}
