/**
 * Persona palette types and CSS variable registry.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface PersonaPalette {
  id: string;
  slug: string;
  name: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  created_by_email?: string | null;
}

export interface PaletteSummary {
  slug: string;
  name: string;
}

/** Grouped --fc-* variable definitions for the palette editor. */
export const FC_VARIABLE_GROUPS = [
  {
    label: "Surfaces",
    vars: [
      { key: "--fc-bg", label: "Background" },
      { key: "--fc-bg-alt", label: "Background Alt" },
      { key: "--fc-surface", label: "Surface" },
      { key: "--fc-surface-alt", label: "Surface Alt" },
    ],
  },
  {
    label: "Text",
    vars: [
      { key: "--fc-text", label: "Primary" },
      { key: "--fc-text-secondary", label: "Secondary" },
      { key: "--fc-text-muted", label: "Muted" },
      { key: "--fc-text-faint", label: "Faint" },
    ],
  },
  {
    label: "Borders",
    vars: [
      { key: "--fc-border", label: "Border" },
      { key: "--fc-border-subtle", label: "Border Subtle" },
    ],
  },
  {
    label: "Accent",
    vars: [
      { key: "--fc-accent", label: "Accent" },
      { key: "--fc-accent-hover", label: "Accent Hover" },
      { key: "--fc-accent-on", label: "Accent On (text on accent)" },
    ],
  },
  {
    label: "Corners",
    vars: [
      { key: "--fc-corner-backstory", label: "Backstory" },
      { key: "--fc-corner-context", label: "Context" },
      { key: "--fc-corner-links", label: "Links" },
      { key: "--fc-corner-cc", label: "Creative Commons" },
    ],
  },
  {
    label: "Menu",
    vars: [
      { key: "--fc-menu-bg", label: "Menu Background" },
      { key: "--fc-menu-bg-alt", label: "Menu Background Alt" },
      { key: "--fc-menu-text", label: "Menu Text" },
      { key: "--fc-menu-text-secondary", label: "Menu Text Secondary" },
      { key: "--fc-menu-hover", label: "Menu Hover" },
    ],
  },
  {
    label: "Modal",
    vars: [
      { key: "--fc-modal-bg", label: "Modal Background" },
      { key: "--fc-modal-border", label: "Modal Border" },
    ],
  },
  {
    label: "Header",
    vars: [
      { key: "--fc-header-bg", label: "Header Background" },
      { key: "--fc-header-border", label: "Header Border" },
      { key: "--fc-header-text", label: "Header Text" },
      { key: "--fc-header-shadow", label: "Header Shadow" },
    ],
  },
  {
    label: "Scrollbar",
    vars: [
      { key: "--fc-scrollbar-thumb", label: "Thumb" },
      { key: "--fc-scrollbar-thumb-hover", label: "Thumb Hover" },
      { key: "--fc-scrollbar-track", label: "Track" },
    ],
  },
  {
    label: "Status",
    vars: [
      { key: "--fc-danger", label: "Danger" },
      { key: "--fc-danger-soft", label: "Danger Soft" },
      { key: "--fc-success", label: "Success" },
      { key: "--fc-ai", label: "AI Badge" },
    ],
  },
  {
    label: "Cards",
    vars: [
      { key: "--fc-card-title", label: "Card Title" },
      { key: "--fc-card-body", label: "Card Body" },
      { key: "--fc-card-footer", label: "Card Footer" },
      { key: "--fc-card-divider", label: "Card Divider" },
    ],
  },
  {
    label: "Icons",
    vars: [
      { key: "--fc-icon", label: "Icon" },
      { key: "--fc-icon-hover", label: "Icon Hover" },
    ],
  },
  {
    label: "Overlays",
    vars: [
      { key: "--fc-overlay", label: "Overlay" },
      { key: "--fc-glass", label: "Glass" },
      { key: "--fc-glass-hover", label: "Glass Hover" },
      { key: "--fc-wash", label: "Wash" },
      { key: "--fc-wash-hover", label: "Wash Hover" },
      { key: "--fc-tap-highlight", label: "Tap Highlight" },
    ],
  },
  {
    label: "Explore",
    vars: [
      { key: "--fc-explore-bg", label: "Canvas Background" },
      { key: "--fc-explore-surface", label: "Card Surface" },
      { key: "--fc-explore-border", label: "Card Border" },
      { key: "--fc-explore-text", label: "Text" },
      { key: "--fc-explore-muted", label: "Muted Text" },
      { key: "--fc-explore-accent", label: "Accent" },
      { key: "--fc-explore-grid", label: "Grid" },
    ],
  },
] as const;

/** Flat list of all --fc-* variable keys. */
export const FC_VARIABLE_KEYS = FC_VARIABLE_GROUPS.flatMap((g) =>
  g.vars.map((v) => v.key)
);
