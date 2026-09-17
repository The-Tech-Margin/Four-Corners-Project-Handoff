/**
 * @module theme/presets/fourCorners
 * Four Corners theme preset.
 * Uses CSS variable references so the consuming app's existing
 * var(--fc-*) variables cascade through.
 */

import type { ThemeTokens } from "../tokens";

/** Four Corners theme tokens with CSS variable fallbacks. */
export const fourCornersTheme: ThemeTokens = {
  // Surface
  canvasBg: "var(--fc-bg, #ffffff)",
  canvasDot: "var(--fc-dot, #e2e8f0)",
  canvasDotSize: 2,
  canvasGridSize: 20,

  // Shape chrome
  shapeBorder: "var(--fc-border, #cbd5e1)",
  shapeBorderRadius: 9,
  shapeShadow: "var(--fc-shadow, 0 1px 3px rgba(0,0,0,0.1))",
  shapeSelectedBorder: "var(--fc-accent, #2563eb)",
  shapeHoverBorder: "var(--fc-hover, #93c5fd)",

  // Shape internals
  shapePlaceholder: "var(--fc-placeholder, #e2e8f0)",
  shapeSurface: "var(--fc-surface, #ffffff)",
  badgeText: "var(--fc-badge-text, #ffffff)",
  videoBg: "var(--fc-video-bg, #1a1a2e)",
  overlayBg: "var(--fc-overlay-bg, rgba(0,0,0,0.5))",

  // Typography
  fontFamily:
    'var(--fc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
  fontSizeBase: 14,
  fontSizeSmall: 12,
  fontSizeLarge: 18,
  textColor: "var(--fc-text, #1e293b)",
  textSecondary: "var(--fc-text-secondary, #64748b)",

  // Accent
  accentPrimary: "var(--fc-accent, #2563eb)",
  accentSecondary: "var(--fc-accent-secondary, #7c3aed)",
  accentDanger: "var(--fc-danger, #ef4444)",

  // Interactive
  handleColor: "var(--fc-accent, #2563eb)",
  handleSize: 8,
  snapGuideColor: "var(--fc-snap, #f59e0b)",
  selectionRectColor: "var(--fc-selection, rgba(37, 99, 235, 0.15))",

  // Toolbar
  toolbarBg: "var(--fc-toolbar-bg, #ffffff)",
  toolbarBorder: "var(--fc-toolbar-border, #e2e8f0)",
  toolbarIconColor: "var(--fc-toolbar-icon, #64748b)",
  toolbarIconActiveColor: "var(--fc-toolbar-icon-active, #2563eb)",
};
