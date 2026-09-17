/**
 * Canvas zoom utilities — shared focal-point zoom math used by
 * the sketchboard editor and explore canvases.
 *
 * Extracted to eliminate duplication across wheel, pinch, and
 * button-triggered zoom handlers.
 */

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Zoom limits shared across all canvas surfaces */
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;

/**
 * Compute new camera state for a focal-point zoom.
 *
 * The point at (focalX, focalY) in viewport-space stays fixed on screen
 * while the zoom level changes — the camera pans to compensate.
 */
export function zoomToPoint(
  camera: CameraState,
  focalX: number,
  focalY: number,
  newZoom: number,
): CameraState {
  const clamped = Math.min(Math.max(newZoom, ZOOM_MIN), ZOOM_MAX);
  const worldX = (focalX - camera.x) / camera.zoom;
  const worldY = (focalY - camera.y) / camera.zoom;
  return {
    x: focalX - worldX * clamped,
    y: focalY - worldY * clamped,
    zoom: clamped,
  };
}

/**
 * Zoom centered on the viewport midpoint.
 * Used by +/- buttons that have no pointer position.
 */
export function zoomToCenter(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  newZoom: number,
): CameraState {
  return zoomToPoint(camera, viewportWidth / 2, viewportHeight / 2, newZoom);
}
