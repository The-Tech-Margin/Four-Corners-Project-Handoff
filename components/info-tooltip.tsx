"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/** Maps accentColor prop values to runtime palette CSS variables */
const COLOR_MAP: Record<string, string> = {
  "corner-creativeCommons": "var(--fc-corner-cc)",
  "corner-backstory": "var(--fc-corner-backstory)",
  "corner-context": "var(--fc-corner-context)",
  "corner-links": "var(--fc-corner-links)",
};

interface InfoTooltipProps {
  title: string;
  content: string;
  accentColor?: string;
  /** Button size — "md" (default, 32px) or "sm" (16px, for dense admin UI). */
  size?: "sm" | "md";
}

export function InfoTooltip({
  title,
  content,
  accentColor = "corner-creativeCommons",
  size = "md",
}: InfoTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvedColor = COLOR_MAP[accentColor] ?? accentColor;

  // Position the portalled tooltip imperatively after it mounts. Done via the
  // DOM (not React state) because we must measure the rendered tooltip first,
  // and a measure→setState cycle in an effect causes a cascading re-render.
  useEffect(() => {
    const el = tooltipRef.current;
    const btn = buttonRef.current;
    if (!showTooltip || !el || !btn) return;

    const buttonRect = btn.getBoundingClientRect();
    const tooltipWidth = el.offsetWidth;
    const tooltipHeight = el.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const gap = 8;

    let left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2;
    if (left < padding) left = padding;
    if (left + tooltipWidth > viewportWidth - padding)
      left = viewportWidth - padding - tooltipWidth;

    // Default below the button; flip above when it would overflow the viewport
    // bottom and there's room above.
    const fitsBelow =
      buttonRect.bottom + gap + tooltipHeight <= viewportHeight - padding;
    const fitsAbove = buttonRect.top - gap - tooltipHeight >= padding;
    const top =
      !fitsBelow && fitsAbove
        ? buttonRect.top - gap - tooltipHeight
        : buttonRect.bottom + gap;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [showTooltip]);

  // Close on outside click/touch
  const handleOutside = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (
        showTooltip &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    },
    [showTooltip]
  );

  useEffect(() => {
    if (showTooltip) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("touchstart", handleOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showTooltip, handleOutside]);

  // Single handler: pointer (mouse) uses hover, touch uses tap toggle.
  // Prevents the double-tap issue where mouseenter + click fire on same tap.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") {
        e.preventDefault();
        setShowTooltip((v) => !v);
      }
    },
    []
  );

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        // Desktop: hover to show/hide
        onMouseEnter={(e) => {
          // Only respond to real mouse, not synthesized from touch
          if ((e.nativeEvent as PointerEvent).pointerType !== "touch") {
            setShowTooltip(true);
          }
        }}
        onMouseLeave={(e) => {
          if ((e.nativeEvent as PointerEvent).pointerType !== "touch") {
            setShowTooltip(false);
          }
        }}
        // Touch: single tap toggle via pointerdown
        onPointerDown={handlePointerDown}
        className="inline-flex items-center justify-center transition-opacity touch-manipulation opacity-60 hover:opacity-100"
        style={{
          width: size === "sm" ? 14 : 32,
          height: size === "sm" ? 14 : 32,
          minWidth: size === "sm" ? 14 : 32,
          minHeight: size === "sm" ? 14 : 32,
          color: resolvedColor,
          border: size === "sm" ? "1px solid" : "2px solid",
          borderColor: resolvedColor,
          borderRadius: "50%",
        }}
        aria-label={`Information about ${title}`}
      >
        <svg
          width={size === "sm" ? 10 : 28}
          height={size === "sm" ? 10 : 28}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 3h.01"
          />
        </svg>
      </button>

      {/* Tooltip via portal to escape overflow:hidden ancestors */}
      {showTooltip &&
        createPortal(
          <div
            ref={tooltipRef}
            className="pointer-events-none w-64 sm:w-72 max-w-[calc(100vw-2rem)]"
            // Starts hidden at 0,0; the effect measures then positions + reveals
            // it (avoids a flash at the wrong spot and a setState-in-effect).
            style={{ position: "fixed", top: 0, left: 0, zIndex: 9999, visibility: "hidden" }}
            role="tooltip"
          >
            <div
              className="rounded-lg shadow-xl px-3 py-2.5 text-xs backdrop-blur-sm"
              style={{
                background: "var(--fc-surface)",
                border: `1px solid`,
                borderColor: resolvedColor,
              }}
            >
              <div
                className="font-semibold mb-1.5"
                style={{ color: resolvedColor }}
              >
                {title}
              </div>
              <div className="leading-relaxed whitespace-normal" style={{ color: "var(--fc-text-secondary)" }}>
                {content}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
