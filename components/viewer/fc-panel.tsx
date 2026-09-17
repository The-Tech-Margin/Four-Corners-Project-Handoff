"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FCCornerKey } from "./use-fc-viewer";
import { X } from "lucide-react";

export interface FCPanelProps {
  /** Which corner this panel belongs to */
  position: FCCornerKey;
  /** Whether panel is visible */
  isActive: boolean;
  /** Close handler */
  onClose: () => void;
  /** Panel title */
  title: string;
  /** Panel content */
  children: ReactNode;
}

/**
 * Slide-out panel for Four Corners photo viewer.
 *
 * Desktop: 60% width, anchored to corner, opacity transition.
 * Mobile:  Full-viewport bottom sheet (fixed), slides up from bottom
 *          with swipe-down-to-close gesture on the drag handle / header.
 */
export function FCPanel({
  position,
  isActive,
  onClose,
  title,
  children,
}: FCPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const isDragging = useRef(false);

  // Lock body scroll on mobile when panel is active
  useEffect(() => {
    if (!isActive) return;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    if (!isMobile) return;

    // Prevent background scrolling
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [isActive]);

  // Haptic feedback on mobile when panel opens
  useEffect(() => {
    if (isActive && window.matchMedia("(pointer: coarse)").matches) {
      navigator?.vibrate?.(10);
    }
  }, [isActive]);

  // Keyboard a11y: when the panel opens, move focus into it (the close button)
  // and remember what opened it (the corner button); Escape closes; on close,
  // restore focus to the opener so keyboard users aren't stranded behind the
  // now-inert panel. Keyed on isActive only — onClose is read via a ref so the
  // effect stays stable and doesn't re-grab focus on parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isActive) return;
    const panel = panelRef.current;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      panel?.querySelector<HTMLElement>(".fc-panel__close")?.focus();
    });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      const opener = openerRef.current;
      openerRef.current = null;
      // Only restore if focus is still inside the closing panel (or was lost) —
      // don't yank focus if the user has already moved on elsewhere.
      if (
        opener &&
        document.body.contains(opener) &&
        (panel?.contains(document.activeElement) ||
          document.activeElement === document.body ||
          document.activeElement === null)
      ) {
        opener.focus();
      }
    };
  }, [isActive]);

  const handleClose = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  // ── Swipe-to-dismiss gesture (touch only, on drag handle + header) ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only track touch gestures (not mouse clicks on close button)
    if ((e.target as HTMLElement).closest(".fc-panel__close")) return;
    dragStartY.current = e.clientY;
    isDragging.current = false;
    setDragOffsetY(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.clientY - dragStartY.current;
    // Only allow downward drag (positive Y)
    if (dy > 0) {
      isDragging.current = true;
      setDragOffsetY(dy);
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (dragStartY.current === null) return;
    // Close if dragged down more than 60px
    if (dragOffsetY > 60) {
      onClose();
    }
    dragStartY.current = null;
    isDragging.current = false;
    setDragOffsetY(0);
  }, [dragOffsetY, onClose]);

  const handlePointerCancel = useCallback(() => {
    dragStartY.current = null;
    isDragging.current = false;
    setDragOffsetY(0);
  }, []);

  // Apply drag offset as inline transform (only while actively dragging)
  const dragStyle =
    dragOffsetY > 0
      ? {
          transform: `translateY(${dragOffsetY}px)`,
          transition: "none",
        }
      : undefined;

  return (
    <div
      ref={panelRef}
      className={`fc-panel fc-panel--${position}${isActive ? " fc-active" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      inert={!isActive ? true : undefined}
      style={isActive ? dragStyle : undefined}
    >
      {/* Drag handle indicator (mobile) — swipe zone */}
      <div
        className="fc-panel__drag-handle"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: "none" }}
      >
        <div className="fc-panel__drag-handle-bar" />
      </div>

      {/* Panel header with close button — also a swipe zone */}
      <div
        className="fc-panel__header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: "none" }}
      >
        <h3 className="fc-panel__title">{title}</h3>
        <button
          type="button"
          className="fc-panel__close"
          onClick={handleClose}
          aria-label={`Close ${title} panel`}
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content — native scroll, no drag interference */}
      <div className="fc-panel__content">{children}</div>
    </div>
  );
}
