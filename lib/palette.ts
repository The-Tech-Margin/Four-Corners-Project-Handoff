/**
 * Runtime palette override API.
 *
 * Every --fc-* CSS variable defined in globals.css can be overridden at
 * runtime by calling applyPalette(). The :root and html.light blocks in
 * globals.css serve as defaults — inline style.setProperty() wins over
 * both, so external input takes precedence without touching the stylesheet.
 *
 * Usage:
 *   import { applyPalette, resetPalette } from '@/lib/palette';
 *
 *   // Override accent + corners
 *   applyPalette({
 *     '--fc-accent': '#ff0000',
 *     '--fc-accent-hover': '#cc0000',
 *     '--fc-corner-context': '#a855f7',
 *   });
 *
 *   // Restore defaults
 *   resetPalette();
 */

/** Apply one or more CSS variable overrides to :root. */
export function applyPalette(overrides: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key, value);
  }
}

/** Remove all inline variable overrides, restoring CSS defaults. */
export function resetPalette(): void {
  document.documentElement.removeAttribute("style");
}

/** Remove a specific set of variable overrides. */
export function removePaletteKeys(keys: string[]): void {
  const root = document.documentElement;
  for (const key of keys) {
    root.style.removeProperty(key);
  }
}
