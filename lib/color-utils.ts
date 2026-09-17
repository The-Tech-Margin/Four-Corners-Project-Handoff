/**
 * Pure color utilities — hex/hsl/rgb conversion, WCAG contrast, harmony schemes.
 * No dependencies. Used by the palette editor.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

/* ----- hex / rgb -------------------------------------------------------- */

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [r, g, b]
      .map((c) => clamp(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

/* ----- hsl -------------------------------------------------------------- */

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hn < 60) {
    r1 = c;
    g1 = x;
  } else if (hn < 120) {
    r1 = x;
    g1 = c;
  } else if (hn < 180) {
    g1 = c;
    b1 = x;
  } else if (hn < 240) {
    g1 = x;
    b1 = c;
  } else if (hn < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
  };
}

export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

/* ----- WCAG contrast ---------------------------------------------------- */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return 0;
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WCAGLevel = "AAA" | "AA" | "AA Large" | "fail";

export function wcagLevel(ratio: number, large = false): WCAGLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (large && ratio >= 3) return "AA Large";
  return "fail";
}

/* ----- Harmony schemes -------------------------------------------------- */

export type HarmonyScheme = "complementary" | "triad" | "tetrad" | "analogous";

/** Returns the base + related colors (total length = scheme arity). */
export function harmony(baseHex: string, scheme: HarmonyScheme): string[] {
  const hsl = hexToHsl(baseHex);
  if (!hsl) return [baseHex];
  const at = (offset: number) => hslToHex({ ...hsl, h: hsl.h + offset });
  switch (scheme) {
    case "complementary":
      return [baseHex, at(180)];
    case "triad":
      return [baseHex, at(120), at(240)];
    case "tetrad":
      return [baseHex, at(90), at(180), at(270)];
    case "analogous":
      return [baseHex, at(-30), at(30)];
  }
}

/** Flip lightness around 0.5 — useful for generating inverse-mode swatches. */
export function inverseLightness(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  return hslToHex({ ...hsl, l: 1 - hsl.l });
}

/** Pick black or white text for best contrast against a background. */
export function pickTextForBg(bgHex: string): "#000000" | "#ffffff" {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#000000";
  const lum = relativeLuminance(rgb);
  return lum > 0.5 ? "#000000" : "#ffffff";
}

export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(hex.trim());
}
