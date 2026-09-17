/**
 * Four Corners logo — four coloured quadrants.
 * Fills use --fc-corner-* CSS variables so persona
 * palette overrides apply automatically.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export function FourCornersLogo({
  className = "w-12 h-12",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Four Corners Logo"
    >
      {/* Top-left — Backstory */}
      <rect x="5" y="5" width="40" height="40" rx="4"
        style={{ fill: "var(--fc-corner-backstory)" }} />

      {/* Top-right — Context */}
      <rect x="55" y="5" width="40" height="40" rx="4"
        style={{ fill: "var(--fc-corner-context)" }} />

      {/* Bottom-left — Links */}
      <rect x="5" y="55" width="40" height="40" rx="4"
        style={{ fill: "var(--fc-corner-links)" }} />

      {/* Bottom-right — Creative Commons */}
      <rect x="55" y="55" width="40" height="40" rx="4"
        style={{ fill: "var(--fc-corner-cc)" }} />
    </svg>
  );
}
