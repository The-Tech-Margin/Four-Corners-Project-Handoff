/**
 * Shared admin dashboard components — StatCard, StatTile, SectionHeading.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * StatCard — padded card with large value, used for primary KPIs.
 */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-md px-2.5 py-1.5"
      style={{
        background: "var(--fc-surface)",
        border: "1px solid var(--fc-border)",
      }}
    >
      <p
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--fc-text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-lg font-semibold tabular-nums leading-tight"
        style={{ color: accent ?? "var(--fc-text)" }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="text-[10px] mt-0.5 leading-tight truncate"
          style={{ color: "var(--fc-text-muted)" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * StatTile — ultra-dense two-line label/value tile.
 * Label sits above the value so long labels like "With Context" don't get
 * truncated into "W...".
 */
export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div
      className="rounded px-2 py-1.5 flex flex-col gap-0.5 min-w-0"
      style={{
        background: "var(--fc-surface)",
        border: "1px solid var(--fc-border)",
      }}
    >
      <span
        className="text-[9px] uppercase tracking-wider leading-tight"
        style={{ color: "var(--fc-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-sm font-semibold tabular-nums leading-tight truncate"
        style={{ color: accent ?? "var(--fc-text)" }}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * SectionHeading — optionally clickable (as a link) heading for admin sections.
 */
export function SectionHeading({
  children,
  href,
  aside,
}: {
  children: ReactNode;
  href?: string;
  aside?: ReactNode;
}) {
  const content = (
    <h2
      className="text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
      style={{ color: "var(--fc-text-muted)" }}
    >
      {children}
      {href && <span aria-hidden>→</span>}
    </h2>
  );
  return (
    <div className="flex items-center justify-between mb-1.5">
      {href ? (
        <Link
          href={href}
          className="hover:opacity-80 transition-opacity"
          style={{ textDecoration: "none" }}
        >
          {content}
        </Link>
      ) : (
        content
      )}
      {aside}
    </div>
  );
}
