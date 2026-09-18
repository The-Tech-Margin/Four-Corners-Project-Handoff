/**
 * @module react/CanvasView
 * Main canvas component that renders the Konva Stage and shapes.
 */

import React, { useEffect, useRef } from 'react';
import { Stage, Layer } from 'react-konva';
import type { CanvasMode } from '../core/types';
import { useCanvasContext } from './CanvasProvider';

/** Props for {@link CanvasView}. */
export interface CanvasViewProps {
  /** Override the mode from CanvasProvider. */
  mode?: CanvasMode;
  /** CSS class name for the container div. */
  className?: string;
  /** Inline styles for the container div. */
  style?: React.CSSProperties;
  /** Callback fired when the canvas engine is ready. */
  onReady?: (canvas: import('../core/Canvas').Canvas) => void;
  /** Child elements rendered inside the Stage (e.g. ShapeRenderer instances). */
  children?: React.ReactNode;
}

/**
 * The main canvas component. Renders a container div with a Konva Stage
 * that auto-resizes to fill its parent.
 */
export function CanvasView({
  mode,
  className,
  style,
  onReady,
  children,
}: CanvasViewProps) {
  const { canvas, theme } = useCanvasContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  // ResizeObserver to track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(el);

    // Set initial dimensions
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    }

    return () => observer.disconnect();
  }, []);

  // Sync mode override
  useEffect(() => {
    if (canvas && mode) {
      canvas.setMode(mode);
    }
  }, [canvas, mode]);

  // Fire onReady callback
  useEffect(() => {
    if (canvas && onReady) {
      onReady(canvas);
    }
  }, [canvas, onReady]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: theme.canvasBg,
        ...style,
      }}
    >
      <Stage width={dimensions.width} height={dimensions.height}>
        <Layer>{children}</Layer>
      </Stage>
    </div>
  );
}
