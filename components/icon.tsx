/**
 * Icon — renders a locally-hosted SVG from `public/dashboard-199707/svg` as
 * a CSS mask so the fill color follows the current palette.
 *
 * Use `name` to look up a file, `size` for pixel dimensions, and optionally
 * override `color` / `bg`. Default color is `var(--fc-icon)` which updates
 * with the active persona palette.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import type { CSSProperties } from "react";

/** Semantic name → file basename under public/dashboard-199707/svg. */
export const ICONS = {
  overview: "noun-diagram-5918692",
  "rate-limits": "noun-clock-5918736",
  design: "noun-image-5918727",
  content: "noun-document-5918699",
  users: "noun-thumb-5918726",
  performance: "noun-speed-5918725",
  analytics: "noun-funnel-5918724",
  menu: "noun-navigation-5918701",
  arrow: "noun-arrow-5918703",
  award: "noun-award-5918698",
  bell: "noun-bell-5918747",
  book: "noun-book-5918706",
  cable: "noun-cable-5918731",
  chain: "noun-chain-5918719",
  clock: "noun-clock-5918736",
  "cloud-talk": "noun-cloud-talk-5918720",
  document: "noun-document-5918699",
  download: "noun-download-5918734",
  eye: "noun-eye-5918707",
  funnel: "noun-funnel-5918724",
  heart: "noun-heart-5918728",
  image: "noun-image-5918727",
  letter: "noun-letter-5918693",
  navigation: "noun-navigation-5918701",
  pencil: "noun-pencil-5918713",
  pin: "noun-pin-5918737",
  puzzle: "noun-puzzle-5918718",
  smartphone: "noun-smartphone-5918709",
  speed: "noun-speed-5918725",
  sponge: "noun-sponge-5918705",
  tablets: "noun-tablets-5918697",
  thumb: "noun-thumb-5918726",
  trash: "noun-trash-5918695",
  water: "noun-water-5918732",
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  /** CSS color or var. Defaults to `var(--fc-icon)`. */
  color?: string;
  /** Optional background behind the icon (useful for pill buttons). */
  bg?: string;
  /** Pixel padding inside the background box. */
  padding?: number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  title?: string;
}

export function Icon({
  name,
  size = 16,
  color,
  bg,
  padding = 0,
  className = "",
  style,
  "aria-label": ariaLabel,
  title,
}: IconProps) {
  const file = ICONS[name];
  const url = `/dashboard-199707/svg/${file}.svg`;
  const box = size + padding * 2;

  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      title={title}
      className={`fc-icon ${className}`}
      style={{
        display: "inline-block",
        width: box,
        height: box,
        background: bg,
        padding,
        borderRadius: bg ? 4 : undefined,
        ...style,
      }}
    >
      <span
        style={{
          display: "block",
          width: size,
          height: size,
          backgroundColor: color ?? "var(--fc-icon)",
          WebkitMask: `url("${url}") center / contain no-repeat`,
          mask: `url("${url}") center / contain no-repeat`,
        }}
      />
    </span>
  );
}
