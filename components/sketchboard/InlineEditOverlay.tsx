"use client";

import { useEffect, useRef, useCallback } from "react";
import { setStoreField, getNestedValue } from "@/hooks/use-canvas-bridge";
import { useFourCornersStore } from "@/lib/store";
import { FIELD_PLACEHOLDERS, CORNER_COLORS_CSS } from "./shapes/types";

export interface InlineEditState {
  shapeId: string;
  fieldMapping: string;
  /** Canvas-space rect of the shape being edited */
  canvasRect: { x: number; y: number; w: number; h: number };
  value: string;
  inputType: "textarea" | "input" | "date" | "url";
  cornerAffinity?: string | null;
}

interface InlineEditOverlayProps {
  state: InlineEditState;
  /** Konva stage for coordinate transforms */
  stage: {
    x: () => number;
    y: () => number;
    scaleX: () => number;
    scaleY: () => number;
  };
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/**
 * HTML overlay for inline text editing directly on the canvas.
 * Positioned absolutely inside the canvas container, tracks camera transforms.
 */
export function InlineEditOverlay({ state, stage, onCommit, onCancel }: InlineEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const valueRef = useRef(state.value);

  // Auto-focus on mount
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Move cursor to end
    if ("setSelectionRange" in el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  // Camera-tracking: reposition on stage drag/zoom
  const overlayRef = useRef<HTMLDivElement>(null);
  const updatePosition = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    const zoom = stage.scaleX();
    const panX = stage.x();
    const panY = stage.y();
    el.style.left = `${state.canvasRect.x * zoom + panX}px`;
    el.style.top = `${state.canvasRect.y * zoom + panY}px`;
    el.style.width = `${state.canvasRect.w * zoom}px`;
    el.style.minHeight = `${state.canvasRect.h * zoom}px`;
    el.style.fontSize = `${Math.max(11, 13 * zoom)}px`;
  }, [stage, state.canvasRect]);

  useEffect(() => {
    updatePosition();

    // Listen for stage position/zoom changes via MutationObserver on the Konva container
    // Use RAF polling as a reliable fallback since Konva stage events aren't React-friendly
    let raf: number;
    let lastX = stage.x();
    let lastY = stage.y();
    let lastZoom = stage.scaleX();

    const poll = () => {
      const x = stage.x();
      const y = stage.y();
      const z = stage.scaleX();
      if (x !== lastX || y !== lastY || z !== lastZoom) {
        lastX = x;
        lastY = y;
        lastZoom = z;
        updatePosition();
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    return () => cancelAnimationFrame(raf);
  }, [updatePosition, stage]);

  const handleCommit = useCallback(() => {
    onCommit(valueRef.current);
  }, [onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "Enter" && state.inputType !== "textarea") {
        e.preventDefault();
        handleCommit();
        return;
      }
      // Shift+Enter for newline in textarea, plain Enter to commit
      if (e.key === "Enter" && !e.shiftKey && state.inputType === "textarea") {
        e.preventDefault();
        handleCommit();
      }
      // Stop propagation so canvas doesn't receive keyboard events
      e.stopPropagation();
    },
    [state.inputType, handleCommit, onCancel],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    valueRef.current = e.target.value;
    // Force re-render to keep input controlled
    const el = e.target;
    el.value = valueRef.current;
  }, []);

  const placeholder = FIELD_PLACEHOLDERS[state.fieldMapping] || "";
  const accent = state.cornerAffinity
    ? CORNER_COLORS_CSS[state.cornerAffinity] || "var(--fc-accent)"
    : "var(--fc-accent)";

  const sharedProps = {
    defaultValue: state.value,
    placeholder,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: handleCommit,
    className: "fc-inline-overlay__input",
    style: { "--zone-accent": accent } as React.CSSProperties,
  };

  return (
    <div
      ref={overlayRef}
      className="fc-inline-overlay"
      // Prevent clicks from propagating to canvas click handler
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {state.inputType === "textarea" ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          {...sharedProps}
          rows={3}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={state.inputType === "url" ? "url" : state.inputType === "date" ? "date" : "text"}
          {...sharedProps}
        />
      )}
    </div>
  );
}
