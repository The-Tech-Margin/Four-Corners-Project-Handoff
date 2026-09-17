/**
 * @module theme/presets/dark
 * Dark mode theme preset.
 */

import type { ThemeTokens } from "../tokens";

/** Dark mode theme tokens. */
export const darkTheme: ThemeTokens = {
  // Surface
  canvasBg: "#0f172a",
  canvasDot: "#334155",
  canvasDotSize: 2,
  canvasGridSize: 20,

  // Shape chrome
  shapeBorder: "#475569",
  shapeBorderRadius: 9,
  shapeShadow: "0 1px 3px rgba(0,0,0,0.4)",
  shapeSelectedBorder: "#3b82f6",
  shapeHoverBorder: "#60a5fa",

  // Shape internals
  shapePlaceholder: "#334155",
  shapeSurface: "#1e293b",
  badgeText: "#ffffff",
  videoBg: "#0f172a",
  overlayBg: "rgba(0,0,0,0.6)",

  // Typography
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizeBase: 14,
  fontSizeSmall: 12,
  fontSizeLarge: 18,
  textColor: "#f1f5f9",
  textSecondary: "#94a3b8",

  // Accent
  accentPrimary: "#3b82f6",
  accentSecondary: "#8b5cf6",
  accentDanger: "#f87171",

  // Interactive
  handleColor: "#3b82f6",
  handleSize: 8,
  snapGuideColor: "#fbbf24",
  selectionRectColor: "rgba(59, 130, 246, 0.2)",

  // Toolbar
  toolbarBg: "#1e293b",
  toolbarBorder: "#334155",
  toolbarIconColor: "#94a3b8",
  toolbarIconActiveColor: "#3b82f6",
};
