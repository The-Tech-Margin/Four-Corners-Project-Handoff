/**
 * Colour scheme presets — pick a triad and auto-populate
 * all --fc-* variables for both dark and light modes.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface PalettePreset {
  id: string;
  name: string;
  description: string;
  /** Swatch colours shown in the picker UI: [accent, corner1, corner2, corner3, corner4] */
  swatches: [string, string, string, string, string];
  dark: Record<string, string>;
  light: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")
  );
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return hex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

function parse(h: string): [number, number, number] {
  const c = h.replace("#", "");
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function alpha(h: string, a: number): string {
  const [r, g, b] = parse(h);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function darken(h: string, amount: number): string {
  return mix(h, "#000000", amount);
}

function lighten(h: string, amount: number): string {
  return mix(h, "#ffffff", amount);
}

/* ------------------------------------------------------------------ */
/*  Generator — derive full variable set from a seed                   */
/* ------------------------------------------------------------------ */

interface Seed {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderSubtle: string;
  accent: string;
  accentHover: string;
  accentOn: string;
  cornerBS: string;
  cornerCX: string;
  cornerLK: string;
  cornerCC: string;
}

function generate(s: Seed): Record<string, string> {
  return {
    "--fc-bg": s.bg,
    "--fc-bg-alt": s.bgAlt,
    "--fc-surface": s.surface,
    "--fc-surface-alt": s.surfaceAlt,
    "--fc-text": s.text,
    "--fc-text-secondary": s.textSecondary,
    "--fc-text-muted": s.textMuted,
    "--fc-text-faint": s.textFaint,
    "--fc-border": s.border,
    "--fc-border-subtle": s.borderSubtle,
    "--fc-accent": s.accent,
    "--fc-accent-hover": s.accentHover,
    "--fc-accent-on": s.accentOn,
    "--fc-corner-backstory": s.cornerBS,
    "--fc-corner-context": s.cornerCX,
    "--fc-corner-links": s.cornerLK,
    "--fc-corner-cc": s.cornerCC,
    "--fc-menu-bg": s.surface,
    "--fc-menu-bg-alt": s.surfaceAlt,
    "--fc-menu-text": s.text,
    "--fc-menu-text-secondary": s.textMuted,
    "--fc-menu-hover": s.surfaceAlt,
    "--fc-modal-bg": s.bg,
    "--fc-modal-border": s.border,
    "--fc-header-bg": alpha(s.bg, 0.95),
    "--fc-header-border": alpha(s.border, 0.5),
    "--fc-header-text": s.text,
    "--fc-header-shadow": `0 1px 3px ${alpha(s.bg, 0.4)}`,
    "--fc-scrollbar-thumb": alpha(s.accent, 0.3),
    "--fc-scrollbar-thumb-hover": alpha(s.accent, 0.5),
    "--fc-scrollbar-track": alpha(s.bg, 0.2),
    "--fc-tap-highlight": alpha(s.accent, 0.1),
    "--fc-danger": "#ef4444",
    "--fc-danger-soft": "#f87171",
    "--fc-success": "#22c55e",
    "--fc-ai": mix(s.accent, "#a855f7", 0.5),
    "--fc-card-title": s.text,
    "--fc-card-body": s.textMuted,
    "--fc-card-footer": s.textFaint,
    "--fc-card-divider": s.border,
    "--fc-icon": s.textMuted,
    "--fc-icon-hover": s.text,
    "--fc-overlay": alpha(s.bg, 0.7),
    "--fc-glass": alpha(s.bg, 0.5),
    "--fc-glass-hover": alpha(s.bg, 0.7),
    "--fc-wash": alpha(s.text, 0.05),
    "--fc-wash-hover": alpha(s.text, 0.08),
  };
}

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "minimal-bw",
    name: "Minimal B\u2009&\u2009W",
    description: "Uniform corners, accent buttons. Inverts for light mode.",
    swatches: ["#ffffff", "#cccccc", "#cccccc", "#cccccc", "#cccccc"],
    dark: generate({
      bg: "#0a0a0a", bgAlt: "#000000",
      surface: "#141414", surfaceAlt: "#1c1c1c",
      text: "#f5f5f5", textSecondary: "#cccccc", textMuted: "#999999", textFaint: "#666666",
      border: "#222222", borderSubtle: "#2a2a2a",
      accent: "#ffffff", accentHover: "#dddddd", accentOn: "#000000",
      cornerBS: "#cccccc", cornerCX: "#cccccc", cornerLK: "#cccccc", cornerCC: "#cccccc",
    }),
    light: generate({
      bg: "#ffffff", bgAlt: "#fafafa",
      surface: "#f5f5f5", surfaceAlt: "#eeeeee",
      text: "#111111", textSecondary: "#444444", textMuted: "#777777", textFaint: "#aaaaaa",
      border: "#e0e0e0", borderSubtle: "#ebebeb",
      accent: "#111111", accentHover: "#333333", accentOn: "#ffffff",
      cornerBS: "#444444", cornerCX: "#444444", cornerLK: "#444444", cornerCC: "#444444",
    }),
  },
  {
    id: "warm-gray",
    name: "Warm Gray",
    description: "Soft charcoal with a single warm accent. Quiet and readable.",
    swatches: ["#a08878", "#3a3632", "#a08878", "#a08878", "#a08878"],
    dark: generate({
      bg: "#1a1816", bgAlt: "#141210",
      surface: "#222018", surfaceAlt: "#2a2820",
      text: "#ece8e2", textSecondary: "#c8c2b8", textMuted: "#908880", textFaint: "#686058",
      border: "#302c26", borderSubtle: "#3a3630",
      accent: "#a08878", accentHover: "#8a7468", accentOn: "#ffffff",
      cornerBS: "#a08878", cornerCX: "#a08878", cornerLK: "#a08878", cornerCC: "#a08878",
    }),
    light: generate({
      bg: "#faf8f5", bgAlt: "#f5f2ee",
      surface: "#ffffff", surfaceAlt: "#faf8f6",
      text: "#2a2622", textSecondary: "#4a4640", textMuted: "#7a756e", textFaint: "#a8a29a",
      border: "#e5e0d8", borderSubtle: "#edeae4",
      accent: "#7a6a5a", accentHover: "#665848", accentOn: "#ffffff",
      cornerBS: "#7a6a5a", cornerCX: "#7a6a5a", cornerLK: "#7a6a5a", cornerCC: "#7a6a5a",
    }),
  },
  {
    id: "cool-gray",
    name: "Cool Gray",
    description: "Blue-gray tones with a slate accent. Modern and neutral.",
    swatches: ["#6b7a8a", "#1e2430", "#6b7a8a", "#6b7a8a", "#6b7a8a"],
    dark: generate({
      bg: "#141820", bgAlt: "#10141a",
      surface: "#1c2028", surfaceAlt: "#222830",
      text: "#e8ecf0", textSecondary: "#b8c0ca", textMuted: "#808a98", textFaint: "#586470",
      border: "#283040", borderSubtle: "#303848",
      accent: "#6b7a8a", accentHover: "#5a6878", accentOn: "#ffffff",
      cornerBS: "#6b7a8a", cornerCX: "#6b7a8a", cornerLK: "#6b7a8a", cornerCC: "#6b7a8a",
    }),
    light: generate({
      bg: "#f8f9fb", bgAlt: "#f2f4f7",
      surface: "#ffffff", surfaceAlt: "#f8f9fb",
      text: "#1e2430", textSecondary: "#3a4250", textMuted: "#6a7280", textFaint: "#98a0aa",
      border: "#dde0e6", borderSubtle: "#e8eaee",
      accent: "#4a5568", accentHover: "#3a4558", accentOn: "#ffffff",
      cornerBS: "#4a5568", cornerCX: "#4a5568", cornerLK: "#4a5568", cornerCC: "#4a5568",
    }),
  },
  {
    id: "paper",
    name: "Paper",
    description: "Newsprint feel — off-white, ink black, understated.",
    swatches: ["#333333", "#333333", "#555555", "#555555", "#777777"],
    dark: generate({
      bg: "#161614", bgAlt: "#101010",
      surface: "#1e1e1c", surfaceAlt: "#262624",
      text: "#e8e6e0", textSecondary: "#c0beb6", textMuted: "#8a887e", textFaint: "#5e5c56",
      border: "#2e2e2a", borderSubtle: "#383834",
      accent: "#c8c4b8", accentHover: "#b0aca0", accentOn: "#161614",
      cornerBS: "#8a887e", cornerCX: "#8a887e", cornerLK: "#8a887e", cornerCC: "#8a887e",
    }),
    light: generate({
      bg: "#f5f3ec", bgAlt: "#edeae2",
      surface: "#faf8f2", surfaceAlt: "#f5f3ee",
      text: "#222220", textSecondary: "#444440", textMuted: "#6e6e68", textFaint: "#a0a098",
      border: "#d8d4ca", borderSubtle: "#e4e0d8",
      accent: "#333333", accentHover: "#222222", accentOn: "#f5f3ec",
      cornerBS: "#555555", cornerCX: "#555555", cornerLK: "#555555", cornerCC: "#555555",
    }),
  },
  {
    id: "ink-wash",
    name: "Ink Wash",
    description: "Sumi-e inspired — near-black with one quiet blue-gray note.",
    swatches: ["#5a6a78", "#0e1214", "#5a6a78", "#5a6a78", "#5a6a78"],
    dark: generate({
      bg: "#0e1214", bgAlt: "#0a0c0e",
      surface: "#161a1e", surfaceAlt: "#1c2024",
      text: "#dce0e4", textSecondary: "#a8b0b8", textMuted: "#707a84", textFaint: "#4a5660",
      border: "#242a30", borderSubtle: "#2c3238",
      accent: "#5a6a78", accentHover: "#4a5a68", accentOn: "#dce0e4",
      cornerBS: "#5a6a78", cornerCX: "#5a6a78", cornerLK: "#5a6a78", cornerCC: "#5a6a78",
    }),
    light: generate({
      bg: "#f4f5f6", bgAlt: "#eef0f2",
      surface: "#ffffff", surfaceAlt: "#f6f7f8",
      text: "#1a1e22", textSecondary: "#3a3e44", textMuted: "#6a6e74", textFaint: "#9a9ea4",
      border: "#dce0e4", borderSubtle: "#e8eaec",
      accent: "#4a5460", accentHover: "#3a4450", accentOn: "#ffffff",
      cornerBS: "#4a5460", cornerCX: "#4a5460", cornerLK: "#4a5460", cornerCC: "#4a5460",
    }),
  },
  {
    id: "sepia",
    name: "Sepia",
    description: "Warm brown tones — aged photograph, archival quality.",
    swatches: ["#8b7355", "#1a1510", "#8b7355", "#8b7355", "#8b7355"],
    dark: generate({
      bg: "#1a1510", bgAlt: "#14100a",
      surface: "#221c14", surfaceAlt: "#2a2218",
      text: "#ece4d4", textSecondary: "#c4b8a0", textMuted: "#8a7e68", textFaint: "#605848",
      border: "#322a1e", borderSubtle: "#3c3226",
      accent: "#8b7355", accentHover: "#766040", accentOn: "#ece4d4",
      cornerBS: "#8b7355", cornerCX: "#8b7355", cornerLK: "#8b7355", cornerCC: "#8b7355",
    }),
    light: generate({
      bg: "#faf6ee", bgAlt: "#f4efe4",
      surface: "#ffffff", surfaceAlt: "#faf7f0",
      text: "#2a2418", textSecondary: "#4a4232", textMuted: "#7a7060", textFaint: "#a8a090",
      border: "#e0d8c8", borderSubtle: "#eae4d8",
      accent: "#6a5a42", accentHover: "#584830", accentOn: "#ffffff",
      cornerBS: "#6a5a42", cornerCX: "#6a5a42", cornerLK: "#6a5a42", cornerCC: "#6a5a42",
    }),
  },
  {
    id: "muted-duo",
    name: "Muted Duo",
    description: "Two quiet tones — soft olive corners, dusty rose accent.",
    swatches: ["#b08a80", "#1a1a18", "#7a8a70", "#7a8a70", "#b08a80"],
    dark: generate({
      bg: "#161614", bgAlt: "#101010",
      surface: "#1e1e1c", surfaceAlt: "#262624",
      text: "#e8e6e0", textSecondary: "#c0beb6", textMuted: "#8a887e", textFaint: "#5e5c56",
      border: "#2e2e2a", borderSubtle: "#383834",
      accent: "#b08a80", accentHover: "#9a7870", accentOn: "#161614",
      cornerBS: "#7a8a70", cornerCX: "#7a8a70", cornerLK: "#7a8a70", cornerCC: "#7a8a70",
    }),
    light: generate({
      bg: "#f8f7f4", bgAlt: "#f2f0ec",
      surface: "#ffffff", surfaceAlt: "#f9f8f5",
      text: "#2a2a26", textSecondary: "#4a4a44", textMuted: "#7a7a72", textFaint: "#a0a098",
      border: "#e2e0d8", borderSubtle: "#eceae4",
      accent: "#8a6a60", accentHover: "#7a5a50", accentOn: "#ffffff",
      cornerBS: "#5a6a50", cornerCX: "#5a6a50", cornerLK: "#5a6a50", cornerCC: "#5a6a50",
    }),
  },
  {
    id: "corporate-blue",
    name: "Corporate Blue",
    description: "Navy header, steel blue accent, professional feel.",
    swatches: ["#2563eb", "#1e3a5f", "#3b82f6", "#60a5fa", "#f97316"],
    dark: generate({
      bg: "#0f172a", bgAlt: "#0b1120",
      surface: "#1e293b", surfaceAlt: "#253346",
      text: "#f1f5f9", textSecondary: "#cbd5e1", textMuted: "#94a3b8", textFaint: "#64748b",
      border: "#1e3a5f", borderSubtle: "#253752",
      accent: "#3b82f6", accentHover: "#2563eb", accentOn: "#ffffff",
      cornerBS: "#38bdf8", cornerCX: "#818cf8", cornerLK: "#34d399", cornerCC: "#f97316",
    }),
    light: generate({
      bg: "#f8fafc", bgAlt: "#f1f5f9",
      surface: "#ffffff", surfaceAlt: "#f8fafc",
      text: "#0f172a", textSecondary: "#334155", textMuted: "#64748b", textFaint: "#94a3b8",
      border: "#e2e8f0", borderSubtle: "#eef2f6",
      accent: "#2563eb", accentHover: "#1d4ed8", accentOn: "#ffffff",
      cornerBS: "#0284c7", cornerCX: "#6366f1", cornerLK: "#059669", cornerCC: "#ea580c",
    }),
  },
  {
    id: "warm-earth",
    name: "Warm Earth",
    description: "Terracotta, amber, olive — warm editorial palette.",
    swatches: ["#d97706", "#92400e", "#b45309", "#65a30d", "#dc2626"],
    dark: generate({
      bg: "#1c1410", bgAlt: "#140e0a",
      surface: "#271e17", surfaceAlt: "#30261e",
      text: "#fef3c7", textSecondary: "#d6c9a8", textMuted: "#a89070", textFaint: "#7a6850",
      border: "#3d2e22", borderSubtle: "#4a3828",
      accent: "#f59e0b", accentHover: "#d97706", accentOn: "#1c1410",
      cornerBS: "#f59e0b", cornerCX: "#dc2626", cornerLK: "#65a30d", cornerCC: "#ea580c",
    }),
    light: generate({
      bg: "#fefbf3", bgAlt: "#fdf6e3",
      surface: "#ffffff", surfaceAlt: "#fef9ee",
      text: "#292524", textSecondary: "#57534e", textMuted: "#78716c", textFaint: "#a8a29e",
      border: "#e7e0d5", borderSubtle: "#f0ebe2",
      accent: "#b45309", accentHover: "#92400e", accentOn: "#ffffff",
      cornerBS: "#b45309", cornerCX: "#b91c1c", cornerLK: "#4d7c0f", cornerCC: "#c2410c",
    }),
  },
  {
    id: "cool-slate",
    name: "Cool Slate",
    description: "Neutral grays with a teal accent. Clean and restrained.",
    swatches: ["#14b8a6", "#334155", "#475569", "#64748b", "#f43f5e"],
    dark: generate({
      bg: "#111827", bgAlt: "#0d1117",
      surface: "#1f2937", surfaceAlt: "#283444",
      text: "#f9fafb", textSecondary: "#d1d5db", textMuted: "#9ca3af", textFaint: "#6b7280",
      border: "#283444", borderSubtle: "#334155",
      accent: "#14b8a6", accentHover: "#0d9488", accentOn: "#ffffff",
      cornerBS: "#14b8a6", cornerCX: "#8b5cf6", cornerLK: "#a3e635", cornerCC: "#f43f5e",
    }),
    light: generate({
      bg: "#f9fafb", bgAlt: "#f3f4f6",
      surface: "#ffffff", surfaceAlt: "#f9fafb",
      text: "#111827", textSecondary: "#374151", textMuted: "#6b7280", textFaint: "#9ca3af",
      border: "#e5e7eb", borderSubtle: "#f0f1f3",
      accent: "#0d9488", accentHover: "#0f766e", accentOn: "#ffffff",
      cornerBS: "#0d9488", cornerCX: "#7c3aed", cornerLK: "#65a30d", cornerCC: "#e11d48",
    }),
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum readability — pure black/white with vivid corners.",
    swatches: ["#facc15", "#ef4444", "#8b5cf6", "#22c55e", "#f97316"],
    dark: generate({
      bg: "#000000", bgAlt: "#000000",
      surface: "#0a0a0a", surfaceAlt: "#141414",
      text: "#ffffff", textSecondary: "#e5e5e5", textMuted: "#b0b0b0", textFaint: "#808080",
      border: "#333333", borderSubtle: "#404040",
      accent: "#facc15", accentHover: "#eab308", accentOn: "#000000",
      cornerBS: "#ef4444", cornerCX: "#8b5cf6", cornerLK: "#22c55e", cornerCC: "#f97316",
    }),
    light: generate({
      bg: "#ffffff", bgAlt: "#ffffff",
      surface: "#f5f5f5", surfaceAlt: "#eeeeee",
      text: "#000000", textSecondary: "#1a1a1a", textMuted: "#555555", textFaint: "#888888",
      border: "#cccccc", borderSubtle: "#dddddd",
      accent: "#b45309", accentHover: "#92400e", accentOn: "#ffffff",
      cornerBS: "#dc2626", cornerCX: "#7c3aed", cornerLK: "#15803d", cornerCC: "#ea580c",
    }),
  },
  {
    id: "rose-editorial",
    name: "Rose Editorial",
    description: "Muted rose accent with charcoal — magazine feel.",
    swatches: ["#e11d48", "#1f1f1f", "#be123c", "#9f1239", "#f97316"],
    dark: generate({
      bg: "#181214", bgAlt: "#120e10",
      surface: "#221a1c", surfaceAlt: "#2a2022",
      text: "#fce7f3", textSecondary: "#d4a5b8", textMuted: "#a87090", textFaint: "#7a5068",
      border: "#3a2228", borderSubtle: "#44282f",
      accent: "#fb7185", accentHover: "#f43f5e", accentOn: "#181214",
      cornerBS: "#fb7185", cornerCX: "#c084fc", cornerLK: "#86efac", cornerCC: "#fdba74",
    }),
    light: generate({
      bg: "#fdf2f8", bgAlt: "#fce7f3",
      surface: "#ffffff", surfaceAlt: "#fef1f7",
      text: "#1f1f1f", textSecondary: "#4a4a4a", textMuted: "#78717a", textFaint: "#a8a0a8",
      border: "#f3d5e4", borderSubtle: "#f8e4ef",
      accent: "#e11d48", accentHover: "#be123c", accentOn: "#ffffff",
      cornerBS: "#be123c", cornerCX: "#7c3aed", cornerLK: "#15803d", cornerCC: "#ea580c",
    }),
  },
  {
    id: "forest-ink",
    name: "Forest Ink",
    description: "Deep green base with cream text — nature editorial.",
    swatches: ["#22c55e", "#14532d", "#166534", "#15803d", "#eab308"],
    dark: generate({
      bg: "#0a1a10", bgAlt: "#071208",
      surface: "#12261a", surfaceAlt: "#1a3022",
      text: "#ecfdf5", textSecondary: "#bbdbc8", textMuted: "#7daa90", textFaint: "#557a65",
      border: "#1e3a28", borderSubtle: "#254430",
      accent: "#4ade80", accentHover: "#22c55e", accentOn: "#0a1a10",
      cornerBS: "#4ade80", cornerCX: "#a78bfa", cornerLK: "#fbbf24", cornerCC: "#fb923c",
    }),
    light: generate({
      bg: "#f0fdf4", bgAlt: "#ecfdf5",
      surface: "#ffffff", surfaceAlt: "#f5fbf7",
      text: "#14532d", textSecondary: "#166534", textMuted: "#4d7c5e", textFaint: "#86a895",
      border: "#d1e7d8", borderSubtle: "#e2f0e7",
      accent: "#15803d", accentHover: "#166534", accentOn: "#ffffff",
      cornerBS: "#15803d", cornerCX: "#6d28d9", cornerLK: "#a16207", cornerCC: "#c2410c",
    }),
  },
  {
    id: "midnight-purple",
    name: "Midnight Purple",
    description: "Deep violet base with electric purple accent.",
    swatches: ["#a855f7", "#2e1065", "#7c3aed", "#6d28d9", "#06b6d4"],
    dark: generate({
      bg: "#13061f", bgAlt: "#0d0416",
      surface: "#1e1030", surfaceAlt: "#26163c",
      text: "#f5f3ff", textSecondary: "#c4b5fd", textMuted: "#8b7ab8", textFaint: "#6a5a90",
      border: "#2e1850", borderSubtle: "#381e5c",
      accent: "#a855f7", accentHover: "#9333ea", accentOn: "#ffffff",
      cornerBS: "#06b6d4", cornerCX: "#a855f7", cornerLK: "#84cc16", cornerCC: "#f97316",
    }),
    light: generate({
      bg: "#faf5ff", bgAlt: "#f5f3ff",
      surface: "#ffffff", surfaceAlt: "#fbf8ff",
      text: "#1e1030", textSecondary: "#44337a", textMuted: "#6b5c8a", textFaint: "#a095b5",
      border: "#e5ddf0", borderSubtle: "#ede7f5",
      accent: "#7c3aed", accentHover: "#6d28d9", accentOn: "#ffffff",
      cornerBS: "#0891b2", cornerCX: "#7c3aed", cornerLK: "#65a30d", cornerCC: "#ea580c",
    }),
  },

  /* ================================================================ */
  /*  Editorial & news-inspired presets                                */
  /* ================================================================ */

  {
    id: "wire-service",
    name: "Wire Service",
    description: "AP/Reuters-inspired — red masthead, strict grayscale body.",
    swatches: ["#dc2626", "#1a1a1a", "#dc2626", "#404040", "#404040"],
    dark: generate({
      bg: "#111111", bgAlt: "#0a0a0a",
      surface: "#1a1a1a", surfaceAlt: "#222222",
      text: "#f0f0f0", textSecondary: "#c8c8c8", textMuted: "#909090", textFaint: "#606060",
      border: "#2a2a2a", borderSubtle: "#333333",
      accent: "#dc2626", accentHover: "#b91c1c", accentOn: "#ffffff",
      cornerBS: "#ef4444", cornerCX: "#a3a3a3", cornerLK: "#a3a3a3", cornerCC: "#d4d4d4",
    }),
    light: generate({
      bg: "#ffffff", bgAlt: "#fafafa",
      surface: "#f7f7f7", surfaceAlt: "#f0f0f0",
      text: "#111111", textSecondary: "#333333", textMuted: "#666666", textFaint: "#999999",
      border: "#e0e0e0", borderSubtle: "#ebebeb",
      accent: "#b91c1c", accentHover: "#991b1b", accentOn: "#ffffff",
      cornerBS: "#dc2626", cornerCX: "#525252", cornerLK: "#525252", cornerCC: "#737373",
    }),
  },
  {
    id: "broadsheet",
    name: "Broadsheet",
    description: "NYT/Guardian feel — warm cream, serif-weight navy accents.",
    swatches: ["#1a3a5c", "#1a3a5c", "#6b8f71", "#a0522d", "#c9a959"],
    dark: generate({
      bg: "#14181e", bgAlt: "#0f1318",
      surface: "#1c222a", surfaceAlt: "#232b34",
      text: "#f5f0e8", textSecondary: "#d4ccb8", textMuted: "#998f78", textFaint: "#706858",
      border: "#2a323c", borderSubtle: "#333c46",
      accent: "#5a8fa8", accentHover: "#4a7a92", accentOn: "#ffffff",
      cornerBS: "#5a8fa8", cornerCX: "#6b8f71", cornerLK: "#c9a959", cornerCC: "#a0522d",
    }),
    light: generate({
      bg: "#faf8f2", bgAlt: "#f5f1e8",
      surface: "#ffffff", surfaceAlt: "#faf8f4",
      text: "#1a1a18", textSecondary: "#3d3d38", textMuted: "#6b6b62", textFaint: "#9e9e90",
      border: "#e0ddd2", borderSubtle: "#ebe8df",
      accent: "#1a3a5c", accentHover: "#142e48", accentOn: "#ffffff",
      cornerBS: "#1a3a5c", cornerCX: "#4a6e50", cornerLK: "#9a7d2e", cornerCC: "#8b4513",
    }),
  },
  {
    id: "tabloid-red",
    name: "Tabloid Red",
    description: "Bold red-on-black — NY Post, Sun, Daily Mirror energy.",
    swatches: ["#ef4444", "#111111", "#ef4444", "#facc15", "#ffffff"],
    dark: generate({
      bg: "#0a0a0a", bgAlt: "#050505",
      surface: "#141414", surfaceAlt: "#1c1c1c",
      text: "#ffffff", textSecondary: "#e0e0e0", textMuted: "#a0a0a0", textFaint: "#707070",
      border: "#2a2a2a", borderSubtle: "#333333",
      accent: "#ef4444", accentHover: "#dc2626", accentOn: "#ffffff",
      cornerBS: "#ef4444", cornerCX: "#facc15", cornerLK: "#ffffff", cornerCC: "#ef4444",
    }),
    light: generate({
      bg: "#ffffff", bgAlt: "#fafafa",
      surface: "#f8f8f8", surfaceAlt: "#f0f0f0",
      text: "#0a0a0a", textSecondary: "#222222", textMuted: "#555555", textFaint: "#888888",
      border: "#e5e5e5", borderSubtle: "#eeeeee",
      accent: "#dc2626", accentHover: "#b91c1c", accentOn: "#ffffff",
      cornerBS: "#dc2626", cornerCX: "#ca8a04", cornerLK: "#111111", cornerCC: "#dc2626",
    }),
  },
  {
    id: "magazine-gloss",
    name: "Magazine Gloss",
    description: "Vogue/Vanity Fair — black & gold with high polish.",
    swatches: ["#d4a843", "#0a0a0a", "#d4a843", "#b89530", "#8c7020"],
    dark: generate({
      bg: "#0a0a0a", bgAlt: "#050505",
      surface: "#141414", surfaceAlt: "#1a1a1a",
      text: "#f5f0e0", textSecondary: "#d4c9a8", textMuted: "#9a8f70", textFaint: "#6a6050",
      border: "#2a2518", borderSubtle: "#332e20",
      accent: "#d4a843", accentHover: "#b89530", accentOn: "#0a0a0a",
      cornerBS: "#d4a843", cornerCX: "#d4a843", cornerLK: "#d4a843", cornerCC: "#d4a843",
    }),
    light: generate({
      bg: "#fdfbf5", bgAlt: "#f9f6ee",
      surface: "#ffffff", surfaceAlt: "#fcfaf5",
      text: "#1a1a1a", textSecondary: "#3a3a3a", textMuted: "#6a6a6a", textFaint: "#9a9a9a",
      border: "#e8e2d0", borderSubtle: "#f0ebdd",
      accent: "#8c6d20", accentHover: "#7a5f18", accentOn: "#ffffff",
      cornerBS: "#8c6d20", cornerCX: "#8c6d20", cornerLK: "#8c6d20", cornerCC: "#8c6d20",
    }),
  },
  {
    id: "indie-zine",
    name: "Indie Zine",
    description: "Risograph-inspired — hot pink, electric blue, acid yellow.",
    swatches: ["#ff2d87", "#0a0a24", "#00b4d8", "#e9ff32", "#ff6b35"],
    dark: generate({
      bg: "#0a0a1a", bgAlt: "#060612",
      surface: "#141428", surfaceAlt: "#1a1a34",
      text: "#f0f0ff", textSecondary: "#c8c8e0", textMuted: "#8888b0", textFaint: "#606088",
      border: "#22224a", borderSubtle: "#2a2a55",
      accent: "#ff2d87", accentHover: "#e01a70", accentOn: "#ffffff",
      cornerBS: "#00b4d8", cornerCX: "#ff2d87", cornerLK: "#e9ff32", cornerCC: "#ff6b35",
    }),
    light: generate({
      bg: "#fef8fb", bgAlt: "#fdf0f6",
      surface: "#ffffff", surfaceAlt: "#fef5f9",
      text: "#1a1a2e", textSecondary: "#3a3a52", textMuted: "#6a6a80", textFaint: "#9a9ab0",
      border: "#f0d8e8", borderSubtle: "#f5e4ee",
      accent: "#d41872", accentHover: "#b8125f", accentOn: "#ffffff",
      cornerBS: "#0088a3", cornerCX: "#d41872", cornerLK: "#8a9900", cornerCC: "#cc5020",
    }),
  },
  {
    id: "photojournalism",
    name: "Photojournalism",
    description: "Magnum/World Press — dark neutral, image-first, red flag.",
    swatches: ["#c0392b", "#1a1a1a", "#c0392b", "#7f8c8d", "#bdc3c7"],
    dark: generate({
      bg: "#121212", bgAlt: "#0a0a0a",
      surface: "#1a1a1a", surfaceAlt: "#222222",
      text: "#e8e8e8", textSecondary: "#b8b8b8", textMuted: "#808080", textFaint: "#585858",
      border: "#2a2a2a", borderSubtle: "#333333",
      accent: "#c0392b", accentHover: "#a93226", accentOn: "#ffffff",
      cornerBS: "#c0392b", cornerCX: "#7f8c8d", cornerLK: "#bdc3c7", cornerCC: "#e67e22",
    }),
    light: generate({
      bg: "#f9f9f7", bgAlt: "#f3f3f0",
      surface: "#ffffff", surfaceAlt: "#f9f9f7",
      text: "#1a1a1a", textSecondary: "#404040", textMuted: "#6e6e6e", textFaint: "#a0a0a0",
      border: "#e0e0dc", borderSubtle: "#eaeae6",
      accent: "#a93226", accentHover: "#922b21", accentOn: "#ffffff",
      cornerBS: "#a93226", cornerCX: "#5d6d6e", cornerLK: "#8e9a9d", cornerCC: "#c76e18",
    }),
  },
  {
    id: "science-journal",
    name: "Science Journal",
    description: "Nature/Science feel — clean white, deep blue, data-forward.",
    swatches: ["#1565c0", "#0d47a1", "#2196f3", "#4caf50", "#ff9800"],
    dark: generate({
      bg: "#0a1628", bgAlt: "#071020",
      surface: "#12203a", surfaceAlt: "#1a2a48",
      text: "#e8f0fa", textSecondary: "#b8cce0", textMuted: "#7a98b8", textFaint: "#566e88",
      border: "#1e3050", borderSubtle: "#253a5a",
      accent: "#42a5f5", accentHover: "#2196f3", accentOn: "#0a1628",
      cornerBS: "#42a5f5", cornerCX: "#ab47bc", cornerLK: "#66bb6a", cornerCC: "#ffa726",
    }),
    light: generate({
      bg: "#fafcff", bgAlt: "#f0f6ff",
      surface: "#ffffff", surfaceAlt: "#f8fafd",
      text: "#0d1b2a", textSecondary: "#2a3f55", textMuted: "#5a7088", textFaint: "#8aa0b8",
      border: "#d8e4f0", borderSubtle: "#e8eff5",
      accent: "#1565c0", accentHover: "#0d47a1", accentOn: "#ffffff",
      cornerBS: "#1565c0", cornerCX: "#7b1fa2", cornerLK: "#2e7d32", cornerCC: "#e65100",
    }),
  },
  {
    id: "alt-weekly",
    name: "Alt Weekly",
    description: "Village Voice/Reader — gritty, yellow-black, counter-culture.",
    swatches: ["#facc15", "#0a0a0a", "#facc15", "#22c55e", "#f97316"],
    dark: generate({
      bg: "#0c0c08", bgAlt: "#080804",
      surface: "#161610", surfaceAlt: "#1e1e16",
      text: "#f5f5e8", textSecondary: "#d4d4b8", textMuted: "#9a9a78", textFaint: "#6a6a58",
      border: "#2a2a1e", borderSubtle: "#333326",
      accent: "#facc15", accentHover: "#eab308", accentOn: "#0c0c08",
      cornerBS: "#facc15", cornerCX: "#22c55e", cornerLK: "#f97316", cornerCC: "#a855f7",
    }),
    light: generate({
      bg: "#fefef5", bgAlt: "#fbfbee",
      surface: "#ffffff", surfaceAlt: "#fdfdf8",
      text: "#1a1a10", textSecondary: "#3a3a28", textMuted: "#6a6a52", textFaint: "#9a9a82",
      border: "#e5e5d0", borderSubtle: "#eeeedc",
      accent: "#a16207", accentHover: "#854d0e", accentOn: "#ffffff",
      cornerBS: "#a16207", cornerCX: "#15803d", cornerLK: "#c2410c", cornerCC: "#7c3aed",
    }),
  },

  /* ================================================================ */
  /*  UX 2026 trend-sourced presets                                    */
  /* ================================================================ */

  {
    id: "cloud-dancer",
    name: "Cloud Dancer",
    description: "Pantone 2026 — airy near-white, visual detox, pastel corners.",
    swatches: ["#f0ece4", "#a8d8d8", "#c8b8e0", "#b8d0a0", "#e0c0b0"],
    dark: generate({
      bg: "#1a1918", bgAlt: "#131210",
      surface: "#22211e", surfaceAlt: "#2a2926",
      text: "#f5f3ee", textSecondary: "#d8d4ca", textMuted: "#a09a8e", textFaint: "#706a60",
      border: "#302e28", borderSubtle: "#3a3832",
      accent: "#f0ece4", accentHover: "#d8d4ca", accentOn: "#1a1918",
      cornerBS: "#a8d8d8", cornerCX: "#c8b8e0", cornerLK: "#b8d0a0", cornerCC: "#e0c0b0",
    }),
    light: generate({
      bg: "#fcfbf8", bgAlt: "#f8f6f2",
      surface: "#ffffff", surfaceAlt: "#fdfcfa",
      text: "#2a2820", textSecondary: "#4a4840", textMuted: "#7a7870", textFaint: "#a8a6a0",
      border: "#e8e4dc", borderSubtle: "#f0eee8",
      accent: "#8a8478", accentHover: "#706a60", accentOn: "#ffffff",
      cornerBS: "#5a9a9a", cornerCX: "#8a70b0", cornerLK: "#6a8a50", cornerCC: "#b08070",
    }),
  },
  {
    id: "ocean-tech",
    name: "Ocean Tech",
    description: "2026 teal dominance — ocean-meets-technology, multi-color corners.",
    swatches: ["#14b8a6", "#06b6d4", "#8b5cf6", "#22d3ee", "#f59e0b"],
    dark: generate({
      bg: "#0a1418", bgAlt: "#060e12",
      surface: "#121e24", surfaceAlt: "#18282e",
      text: "#ecf8f6", textSecondary: "#b0d8d2", textMuted: "#6aa89e", textFaint: "#4a807a",
      border: "#1a3038", borderSubtle: "#223a42",
      accent: "#14b8a6", accentHover: "#0d9488", accentOn: "#ffffff",
      cornerBS: "#06b6d4", cornerCX: "#8b5cf6", cornerLK: "#22d3ee", cornerCC: "#f59e0b",
    }),
    light: generate({
      bg: "#f0fdfb", bgAlt: "#e6faf6",
      surface: "#ffffff", surfaceAlt: "#f5fcfa",
      text: "#0a2620", textSecondary: "#1a4a40", textMuted: "#4a7a70", textFaint: "#80aaa0",
      border: "#c8e8e2", borderSubtle: "#daf0ea",
      accent: "#0d9488", accentHover: "#0f766e", accentOn: "#ffffff",
      cornerBS: "#0891b2", cornerCX: "#7c3aed", cornerLK: "#06b6d4", cornerCC: "#d97706",
    }),
  },
  {
    id: "neo-earth",
    name: "Neo Earth",
    description: "2026 neo earth tones — clay, olive, sandstone, muted terracotta.",
    swatches: ["#a0826d", "#7c8c6a", "#c4956a", "#8a7a6a", "#b8a088"],
    dark: generate({
      bg: "#181410", bgAlt: "#120e0a",
      surface: "#221e18", surfaceAlt: "#2a2620",
      text: "#f0e8dc", textSecondary: "#c8bca8", textMuted: "#8e8270", textFaint: "#665c4e",
      border: "#322c22", borderSubtle: "#3c342a",
      accent: "#a0826d", accentHover: "#8a705a", accentOn: "#ffffff",
      cornerBS: "#7c8c6a", cornerCX: "#c4956a", cornerLK: "#8a7a6a", cornerCC: "#b8a088",
    }),
    light: generate({
      bg: "#faf6f0", bgAlt: "#f4efe6",
      surface: "#ffffff", surfaceAlt: "#fbf8f4",
      text: "#2a2418", textSecondary: "#4a4232", textMuted: "#7a7060", textFaint: "#a89e90",
      border: "#e2dac8", borderSubtle: "#ece6d8",
      accent: "#7a6450", accentHover: "#665240", accentOn: "#ffffff",
      cornerBS: "#5a6a48", cornerCX: "#a07548", cornerLK: "#6a5c4e", cornerCC: "#9a8268",
    }),
  },
  {
    id: "deep-luxury",
    name: "Deep Luxury",
    description: "2026 deep red — oxblood, burgundy & gold, old-money gravitas.",
    swatches: ["#8b1a2b", "#c9a84c", "#6a2040", "#3a1a28", "#d4a04a"],
    dark: generate({
      bg: "#120a0e", bgAlt: "#0c0608",
      surface: "#1e1218", surfaceAlt: "#281a20",
      text: "#f5ece8", textSecondary: "#d0b8b0", textMuted: "#987078", textFaint: "#6a4850",
      border: "#321e28", borderSubtle: "#3e2832",
      accent: "#c83050", accentHover: "#a82840", accentOn: "#ffffff",
      cornerBS: "#c9a84c", cornerCX: "#6a2040", cornerLK: "#d4a04a", cornerCC: "#8b1a2b",
    }),
    light: generate({
      bg: "#fdf8f6", bgAlt: "#faf2ee",
      surface: "#ffffff", surfaceAlt: "#fefaf8",
      text: "#2a1018", textSecondary: "#4a2830", textMuted: "#7a5058", textFaint: "#a88088",
      border: "#e8d4d0", borderSubtle: "#f0e0dc",
      accent: "#8b1a2b", accentHover: "#701020", accentOn: "#ffffff",
      cornerBS: "#9a8030", cornerCX: "#501830", cornerLK: "#a88830", cornerCC: "#701020",
    }),
  },
  {
    id: "synthetic-neon",
    name: "Synthetic Neon",
    description: "2026 AI aesthetic — acid green, cyan, hyper-violet on OLED black.",
    swatches: ["#39ff14", "#00e5ff", "#bf00ff", "#ffea00", "#ff3d00"],
    dark: generate({
      bg: "#000000", bgAlt: "#000000",
      surface: "#0a0a0a", surfaceAlt: "#121212",
      text: "#f0fff0", textSecondary: "#c0e8c0", textMuted: "#70a870", textFaint: "#407840",
      border: "#1a2a1a", borderSubtle: "#223222",
      accent: "#39ff14", accentHover: "#28cc10", accentOn: "#000000",
      cornerBS: "#00e5ff", cornerCX: "#bf00ff", cornerLK: "#ffea00", cornerCC: "#ff3d00",
    }),
    light: generate({
      bg: "#f8fff8", bgAlt: "#f0faf0",
      surface: "#ffffff", surfaceAlt: "#f8fcf8",
      text: "#0a1a0a", textSecondary: "#1a3a1a", textMuted: "#4a6a4a", textFaint: "#80a080",
      border: "#d0e8d0", borderSubtle: "#e0f0e0",
      accent: "#1a8a0a", accentHover: "#146a08", accentOn: "#ffffff",
      cornerBS: "#0088aa", cornerCX: "#7800aa", cornerLK: "#998800", cornerCC: "#cc2800",
    }),
  },
  {
    id: "soft-teal",
    name: "Soft Teal",
    description: "Cloud Dancer meets teal — dusty teal accent on a serene neutral base.",
    swatches: ["#5eaaa8", "#5eaaa8", "#8e7cc3", "#7ab87a", "#e8a050"],
    dark: generate({
      bg: "#101816", bgAlt: "#0a1210",
      surface: "#18221e", surfaceAlt: "#202c28",
      text: "#e8f4f0", textSecondary: "#b0d0c8", textMuted: "#70988e", textFaint: "#4e726a",
      border: "#1e302a", borderSubtle: "#263a34",
      accent: "#5eaaa8", accentHover: "#4a908e", accentOn: "#ffffff",
      cornerBS: "#5eaaa8", cornerCX: "#8e7cc3", cornerLK: "#7ab87a", cornerCC: "#e8a050",
    }),
    light: generate({
      bg: "#f5fafa", bgAlt: "#eef6f5",
      surface: "#ffffff", surfaceAlt: "#f8fbfb",
      text: "#142220", textSecondary: "#2a4440", textMuted: "#5a7a74", textFaint: "#8aa8a2",
      border: "#c8e0dc", borderSubtle: "#daeae6",
      accent: "#3a8a88", accentHover: "#2e7270", accentOn: "#ffffff",
      cornerBS: "#3a8a88", cornerCX: "#6a5aa0", cornerLK: "#5a9058", cornerCC: "#c08030",
    }),
  },
];
