"use client";

import type { MouseEvent } from "react";
import type { FCCornerKey } from "./use-fc-viewer";

export interface FCCornerProps {
  /** Which corner position */
  position: FCCornerKey;
  /** Whether this corner's panel is currently open */
  isActive: boolean;
  /** Whether this corner has content (empty corners show at 50% opacity) */
  hasContent: boolean;
  /** Click handler */
  onClick: () => void;
  /** Mouse enter handler */
  onMouseEnter: () => void;
  /** Mouse leave handler */
  onMouseLeave: () => void;
  /** Accessible label */
  label: string;
  /** Whether corner interaction is disabled (decorative only) */
  disabled?: boolean;
  /** Show pulsing hint animation (mobile first-visit) */
  showHint?: boolean;
}

/**
 * L-shaped corner indicator for Four Corners photo viewer.
 * Replicates the exact UX from fourcorners.js:
 * - Click to open/close panel
 * - Hover for scale feedback
 * - Hides when its panel is active
 * - 50% opacity when no content
 */
export function FCCorner({
  position,
  isActive,
  hasContent,
  onClick,
  onMouseEnter,
  onMouseLeave,
  label,
  disabled = false,
  showHint = false,
}: FCCornerProps) {
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent container click handler from closing panel
    if (!disabled) {
      onClick();
    }
  };

  return (
    <button
      type="button"
      className={`fc-corner fc-corner--${position}${isActive ? " fc-active" : ""}${!hasContent ? " fc-empty" : ""}${disabled ? " fc-corner--disabled" : ""}${showHint ? " fc-corner--hint" : ""}`}
      onClick={handleClick}
      onMouseEnter={disabled ? undefined : onMouseEnter}
      onMouseLeave={disabled ? undefined : onMouseLeave}
      aria-label={label}
      aria-expanded={isActive}
      aria-haspopup="dialog"
      aria-disabled={disabled}
    />
  );
}
