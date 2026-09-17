/**
 * @module react/ShapeRenderer
 * Maps a BaseShape instance to Konva nodes, with optional HTML overlay.
 *
 * shape.render() returns imperative Konva nodes (e.g. Konva.Group),
 * which cannot be passed as React children to react-konva's declarative
 * components. Instead we attach them to a react-konva <Group> via a ref.
 */

import React, { useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Group } from "react-konva";
import { Html } from "react-konva-utils";
import type { BaseShape } from "../shapes/BaseShape";
import type {
  CanvasRenderContext,
  CanvasMode,
  CameraState,
  ThemeTokens,
} from "../core/types";

/** Props for {@link ShapeRenderer}. */
export interface ShapeRendererProps {
  /** The shape instance to render. */
  shape: BaseShape;
  /** Active theme tokens. */
  theme: ThemeTokens;
  /** Current canvas mode. */
  mode: CanvasMode;
  /** Current camera state. */
  camera: CameraState;
  /** Whether this shape is currently selected. */
  selected?: boolean;
}

/**
 * Renders a single shape as Konva nodes.
 *
 * shape.render() returns imperative Konva nodes which are added to a
 * react-konva Group via a ref. If the shape implements renderOverlay(),
 * the overlay is rendered as an Html component positioned at the shape's
 * location.
 */
export function ShapeRenderer({
  shape,
  theme,
  mode,
  camera,
  selected = false,
}: ShapeRendererProps) {
  const groupRef = useRef<Konva.Group>(null);

  const ctx: CanvasRenderContext = useMemo(
    () => ({ theme, mode, camera, selected }),
    [theme, mode, camera, selected],
  );

  // Attach imperative Konva nodes from shape.render() to the Group ref
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.destroyChildren();
    const node = shape.render(ctx);
    if (node) {
      group.add(node);
    }
    group.getLayer()?.batchDraw();
  }, [shape, ctx]);

  const overlay = useMemo(() => {
    if (shape.renderOverlay) {
      return shape.renderOverlay();
    }
    return null;
  }, [shape, mode]);

  return (
    <>
      <Group ref={groupRef} />
      {overlay && (
        <Group>
          <Html
            groupProps={{
              x: shape.x,
              y: shape.y,
            }}
            divProps={{
              style: {
                pointerEvents: mode === "edit" ? "none" : "auto",
              },
            }}
          >
            {overlay as React.ReactElement}
          </Html>
        </Group>
      )}
    </>
  );
}
