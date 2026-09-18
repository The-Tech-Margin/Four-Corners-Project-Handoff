/**
 * @module react/HtmlOverlay
 * Wraps react-konva-utils Html component with mode-aware positioning.
 */

import React from 'react';
import { Group } from 'react-konva';
import { Html } from 'react-konva-utils';
import type { BaseShape } from '../shapes/BaseShape';
import type { CanvasMode, CameraState } from '../core/types';

/** Props for {@link HtmlOverlay}. */
export interface HtmlOverlayProps {
  /** The shape this overlay belongs to. */
  shape: BaseShape;
  /** Current canvas mode. */
  mode: CanvasMode;
  /** Current camera state. */
  camera: CameraState;
  /** Overlay content to render as DOM elements. */
  children: React.ReactNode;
}

/**
 * Positions HTML children in canvas coordinates matching a shape's position.
 * Scales with camera zoom. Only interactive in view/present modes;
 * pointer-events are disabled in edit mode.
 */
export function HtmlOverlay({
  shape,
  mode,
  camera,
  children,
}: HtmlOverlayProps) {
  const interactive = mode === 'view' || mode === 'present';

  return (
    <Group>
      <Html
        groupProps={{
          x: shape.x,
          y: shape.y,
        }}
        divProps={{
          style: {
            width: `${shape.width}px`,
            height: `${shape.height}px`,
            pointerEvents: interactive ? 'auto' : 'none',
            transform: `scale(${1 / camera.zoom})`,
            transformOrigin: 'top left',
          },
        }}
      >
        {children}
      </Html>
    </Group>
  );
}
