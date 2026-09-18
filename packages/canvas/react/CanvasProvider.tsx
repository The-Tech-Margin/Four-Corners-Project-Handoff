/**
 * @module react/CanvasProvider
 * React context provider wrapping the core Canvas engine.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CanvasMode, ThemeTokens } from "../core/types";
import { Canvas } from "../core/Canvas";
import { fourCornersTheme } from "../theme/presets/fourCorners";

/** Value exposed by the canvas context. */
export interface CanvasContextValue {
  /** The core Canvas engine instance, or null before initialization. */
  canvas: Canvas | null;
  /** Current interaction mode. */
  mode: CanvasMode;
  /** Active theme tokens. */
  theme: ThemeTokens;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

/** Props for {@link CanvasProvider}. */
export interface CanvasProviderProps {
  /** Theme tokens. Defaults to the Four Corners preset. */
  theme?: ThemeTokens;
  /** Initial canvas mode. Defaults to 'edit'. */
  mode?: CanvasMode;
  /** Child elements. */
  children: React.ReactNode;
}

/**
 * Provides the core Canvas engine to descendant components via React context.
 * Wrap your canvas UI tree with this provider.
 */
export function CanvasProvider({
  theme = fourCornersTheme,
  mode = "edit",
  children,
}: CanvasProviderProps) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Create / recreate Canvas when theme changes
  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new Canvas({
      container: containerRef.current,
      width: containerRef.current.clientWidth || 800,
      height: containerRef.current.clientHeight || 600,
      theme,
    });

    instance.setMode(mode);
    setCanvas(instance);

    return () => {
      instance.destroy();
    };
  }, [theme]);

  // Sync mode changes
  useEffect(() => {
    canvas?.setMode(mode);
  }, [canvas, mode]);

  const value: CanvasContextValue = { canvas, mode, theme };

  return (
    <CanvasContext.Provider value={value}>
      {/* Hidden container for Konva Stage mounting */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      />
      {children}
    </CanvasContext.Provider>
  );
}

/**
 * Hook to access the canvas context.
 * @returns The canvas context value.
 * @throws If used outside of a CanvasProvider.
 * @internal Prefer the public useCanvas hook.
 */
export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    throw new Error("useCanvasContext must be used within a <CanvasProvider>");
  }
  return ctx;
}
