"use client";

import { useEffect, useRef } from "react";

/**
 * Swipe-down-to-dismiss gesture for mobile bottom sheet panels.
 * Applies translateY directly during touch for immediate feedback.
 * Only active when viewport width < 640px.
 */
export function useSwipeToDismiss(
  panelRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    // Only enable on mobile
    if (window.innerWidth >= 640) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only start swipe from the header area (top 56px)
      const rect = el.getBoundingClientRect();
      const touchY = e.touches[0].clientY - rect.top;
      if (touchY > 56) return;

      startYRef.current = e.touches[0].clientY;
      currentYRef.current = 0;
      isDraggingRef.current = true;
      el.style.transition = "none";
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      // Only allow downward swipe
      currentYRef.current = Math.max(0, delta);
      el.style.transform = `translateY(${currentYRef.current}px)`;
      // Reduce opacity as user swipes further
      el.style.opacity = String(1 - currentYRef.current / 400);
    };

    const handleTouchEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (currentYRef.current > 80) {
        // Dismiss
        el.style.transition = "transform 0.2s ease-in, opacity 0.2s ease-in";
        el.style.transform = "translateY(100%)";
        el.style.opacity = "0";
        setTimeout(onClose, 200);
      } else {
        // Spring back
        el.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
        el.style.transform = "translateY(0)";
        el.style.opacity = "1";
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [panelRef, onClose]);
}
