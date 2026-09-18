/**
 * @module theme/ThemeProvider
 * Framework-agnostic theme provider that manages ThemeTokens
 * and injects CSS custom properties onto a container element.
 */

import type { ThemeTokens } from '../core/types';

/**
 * Manages theme tokens and injects them as CSS custom properties
 * onto a DOM container. Framework-agnostic — React integration
 * is handled separately in the react/ layer.
 */
export class ThemeProvider {
  /** Current active tokens. */
  private tokens: ThemeTokens;

  /** Optional callback invoked when the theme changes. */
  private onChange?: (tokens: ThemeTokens) => void;

  /**
   * Create a ThemeProvider.
   * @param tokens - Initial theme tokens.
   * @param onChange - Optional callback fired on theme change.
   */
  constructor(tokens: ThemeTokens, onChange?: (tokens: ThemeTokens) => void) {
    this.tokens = tokens;
    this.onChange = onChange;
  }

  /**
   * Get the current theme tokens.
   * @returns The active ThemeTokens object.
   */
  getTokens(): ThemeTokens {
    return this.tokens;
  }

  /**
   * Replace the active theme tokens.
   * Fires the onChange callback if set.
   * @param tokens - New theme tokens.
   */
  setTheme(tokens: ThemeTokens): void {
    this.tokens = tokens;
    this.onChange?.(tokens);
  }

  /**
   * Inject all theme tokens as `--ock-*` CSS custom properties
   * onto the given container element.
   * @param container - The DOM element to set properties on.
   */
  injectCSSVariables(container: HTMLElement): void {
    const style = container.style;

    // Surface
    style.setProperty('--ock-canvas-bg', this.tokens.canvasBg);
    style.setProperty('--ock-canvas-dot', this.tokens.canvasDot);
    style.setProperty('--ock-canvas-dot-size', String(this.tokens.canvasDotSize));
    style.setProperty('--ock-canvas-grid-size', String(this.tokens.canvasGridSize));

    // Shape chrome
    style.setProperty('--ock-shape-border', this.tokens.shapeBorder);
    style.setProperty('--ock-shape-border-radius', String(this.tokens.shapeBorderRadius));
    style.setProperty('--ock-shape-shadow', this.tokens.shapeShadow);
    style.setProperty('--ock-shape-selected-border', this.tokens.shapeSelectedBorder);
    style.setProperty('--ock-shape-hover-border', this.tokens.shapeHoverBorder);

    // Shape internals
    style.setProperty('--ock-shape-placeholder', this.tokens.shapePlaceholder);
    style.setProperty('--ock-shape-surface', this.tokens.shapeSurface);
    style.setProperty('--ock-badge-text', this.tokens.badgeText);
    style.setProperty('--ock-video-bg', this.tokens.videoBg);
    style.setProperty('--ock-overlay-bg', this.tokens.overlayBg);

    // Typography
    style.setProperty('--ock-font-family', this.tokens.fontFamily);
    style.setProperty('--ock-font-size-base', String(this.tokens.fontSizeBase));
    style.setProperty('--ock-font-size-small', String(this.tokens.fontSizeSmall));
    style.setProperty('--ock-font-size-large', String(this.tokens.fontSizeLarge));
    style.setProperty('--ock-text-color', this.tokens.textColor);
    style.setProperty('--ock-text-secondary', this.tokens.textSecondary);

    // Accent
    style.setProperty('--ock-accent-primary', this.tokens.accentPrimary);
    style.setProperty('--ock-accent-secondary', this.tokens.accentSecondary);
    style.setProperty('--ock-accent-danger', this.tokens.accentDanger);

    // Interactive
    style.setProperty('--ock-handle-color', this.tokens.handleColor);
    style.setProperty('--ock-handle-size', String(this.tokens.handleSize));
    style.setProperty('--ock-snap-guide-color', this.tokens.snapGuideColor);
    style.setProperty('--ock-selection-rect-color', this.tokens.selectionRectColor);

    // Toolbar
    style.setProperty('--ock-toolbar-bg', this.tokens.toolbarBg);
    style.setProperty('--ock-toolbar-border', this.tokens.toolbarBorder);
    style.setProperty('--ock-toolbar-icon-color', this.tokens.toolbarIconColor);
    style.setProperty('--ock-toolbar-icon-active-color', this.tokens.toolbarIconActiveColor);
  }
}
