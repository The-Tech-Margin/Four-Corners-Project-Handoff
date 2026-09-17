/**
 * @module theme/tokens
 * ThemeTokens interface and default values.
 * All visual properties in shapes and UI components are read from these tokens.
 */

/** Token interface for all visual properties used by the canvas library. */
export interface ThemeTokens {
  // Surface
  canvasBg: string;
  canvasDot: string;
  canvasDotSize: number;
  canvasGridSize: number;

  // Shape chrome
  shapeBorder: string;
  shapeBorderRadius: number;
  shapeShadow: string;
  shapeSelectedBorder: string;
  shapeHoverBorder: string;

  // Shape internals
  /** Placeholder fill for empty image areas, favicon slots, and thumbnails. */
  shapePlaceholder: string;
  /** Surface color for shape card backgrounds (may differ from canvasBg). */
  shapeSurface: string;
  /** Badge / overlay text color (e.g. NF label, video duration). */
  badgeText: string;
  /** Video player background color. */
  videoBg: string;
  /** Semi-transparent overlay for controls on media shapes. */
  overlayBg: string;

  // Typography
  fontFamily: string;
  fontSizeBase: number;
  fontSizeSmall: number;
  fontSizeLarge: number;
  textColor: string;
  textSecondary: string;

  // Accent
  accentPrimary: string;
  accentSecondary: string;
  accentDanger: string;

  // Interactive
  handleColor: string;
  handleSize: number;
  snapGuideColor: string;
  selectionRectColor: string;

  // Toolbar
  toolbarBg: string;
  toolbarBorder: string;
  toolbarIconColor: string;
  toolbarIconActiveColor: string;
}

/** Default light-mode theme tokens. */
export const DEFAULT_TOKENS: ThemeTokens = {
  // Surface
  canvasBg: "#ffffff",
  canvasDot: "#e2e8f0",
  canvasDotSize: 2,
  canvasGridSize: 20,

  // Shape chrome
  shapeBorder: "#cbd5e1",
  shapeBorderRadius: 9,
  shapeShadow: "0 1px 3px rgba(0,0,0,0.1)",
  shapeSelectedBorder: "#2563eb",
  shapeHoverBorder: "#93c5fd",

  // Shape internals
  shapePlaceholder: "#e2e8f0",
  shapeSurface: "#ffffff",
  badgeText: "#ffffff",
  videoBg: "#1a1a2e",
  overlayBg: "rgba(0,0,0,0.5)",

  // Typography
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizeBase: 14,
  fontSizeSmall: 12,
  fontSizeLarge: 18,
  textColor: "#1e293b",
  textSecondary: "#64748b",

  // Accent
  accentPrimary: "#2563eb",
  accentSecondary: "#7c3aed",
  accentDanger: "#ef4444",

  // Interactive
  handleColor: "#2563eb",
  handleSize: 8,
  snapGuideColor: "#f59e0b",
  selectionRectColor: "rgba(37, 99, 235, 0.15)",

  // Toolbar
  toolbarBg: "#ffffff",
  toolbarBorder: "#e2e8f0",
  toolbarIconColor: "#64748b",
  toolbarIconActiveColor: "#2563eb",
};
