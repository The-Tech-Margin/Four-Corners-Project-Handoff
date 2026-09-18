"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type FCCornerKey = "authorship" | "backstory" | "imagery" | "links";

// Corner order for swipe navigation (clockwise from top-left)
const CORNER_ORDER: FCCornerKey[] = ["authorship", "imagery", "links", "backstory"];

// Custom event name for cross-viewer coordination
const FC_PANEL_OPENED_EVENT = "fc-panel-opened";

export interface FCViewerState {
  activeCorner: FCCornerKey | null;
  hoveredCorner: FCCornerKey | null;
}

export interface FCViewerActions {
  /** Toggle a corner - if already active, close it; otherwise open it (closing any other) */
  toggleCorner: (key: FCCornerKey) => void;
  /** Set hovered corner for visual feedback */
  setHoveredCorner: (key: FCCornerKey | null) => void;
  /** Close all panels */
  closeAll: () => void;
  /** Check if a corner is active */
  isActive: (key: FCCornerKey) => boolean;
  /** Check if a corner is hovered */
  isHovered: (key: FCCornerKey) => boolean;
  /** Navigate to next corner (for swipe gestures) */
  navigateToNextCorner: () => void;
  /** Navigate to previous corner (for swipe gestures) */
  navigateToPrevCorner: () => void;
  /** Open a specific corner directly */
  openCorner: (key: FCCornerKey) => void;
}

let viewerIdCounter = 0;

export function useFCViewer(): FCViewerState & FCViewerActions {
  const [activeCorner, setActiveCorner] = useState<FCCornerKey | null>(null);
  const [hoveredCorner, setHoveredCornerState] = useState<FCCornerKey | null>(null);
  const viewerIdRef = useRef<number>(0);

  // Assign a stable unique ID to this viewer instance
  useEffect(() => {
    viewerIdRef.current = ++viewerIdCounter;
  }, []);

  // Listen for other viewers opening panels — close ours
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.viewerId !== viewerIdRef.current) {
        setActiveCorner(null);
      }
    };
    document.addEventListener(FC_PANEL_OPENED_EVENT, handler);
    return () => document.removeEventListener(FC_PANEL_OPENED_EVENT, handler);
  }, []);

  // Notify other viewers when we open a panel
  const notifyOpen = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent(FC_PANEL_OPENED_EVENT, {
        detail: { viewerId: viewerIdRef.current },
      }),
    );
  }, []);

  const toggleCorner = useCallback((key: FCCornerKey) => {
    setActiveCorner((current) => {
      const next = current === key ? null : key;
      if (next) {
        // Use setTimeout to dispatch after state update
        setTimeout(() => notifyOpen(), 0);
      }
      return next;
    });
  }, [notifyOpen]);

  const setHoveredCorner = useCallback((key: FCCornerKey | null) => {
    setHoveredCornerState(key);
  }, []);

  const closeAll = useCallback(() => {
    setActiveCorner(null);
  }, []);

  const isActive = useCallback(
    (key: FCCornerKey) => activeCorner === key,
    [activeCorner]
  );

  const isHovered = useCallback(
    (key: FCCornerKey) => hoveredCorner === key,
    [hoveredCorner]
  );

  // Navigate to next corner in order (for swipe left)
  const navigateToNextCorner = useCallback(() => {
    setActiveCorner((current) => {
      if (!current) return CORNER_ORDER[0];
      const currentIndex = CORNER_ORDER.indexOf(current);
      const nextIndex = (currentIndex + 1) % CORNER_ORDER.length;
      return CORNER_ORDER[nextIndex];
    });
    notifyOpen();
  }, [notifyOpen]);

  // Navigate to previous corner in order (for swipe right)
  const navigateToPrevCorner = useCallback(() => {
    setActiveCorner((current) => {
      if (!current) return CORNER_ORDER[CORNER_ORDER.length - 1];
      const currentIndex = CORNER_ORDER.indexOf(current);
      const prevIndex = (currentIndex - 1 + CORNER_ORDER.length) % CORNER_ORDER.length;
      return CORNER_ORDER[prevIndex];
    });
    notifyOpen();
  }, [notifyOpen]);

  // Open a specific corner directly
  const openCorner = useCallback((key: FCCornerKey) => {
    setActiveCorner(key);
    notifyOpen();
  }, [notifyOpen]);

  return {
    activeCorner,
    hoveredCorner,
    toggleCorner,
    setHoveredCorner,
    closeAll,
    isActive,
    isHovered,
    navigateToNextCorner,
    navigateToPrevCorner,
    openCorner,
  };
}
