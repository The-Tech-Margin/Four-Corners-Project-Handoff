"use client";

import { InfoTooltip } from "./info-tooltip";

interface SectionHeaderProps {
  title: string;
  color: string;
  cornerLabel: string;
  tooltipTitle: string;
  tooltipContent: string;
  className?: string;
  children?: React.ReactNode;
  /** Optional id so callers can wire `aria-labelledby` on the wrapping region. */
  id?: string;
  /** Heading level — defaults to h2 since editor sections sit beneath the h1. */
  level?: 2 | 3;
}

export function SectionHeader({
  title,
  color,
  cornerLabel,
  tooltipTitle,
  tooltipContent,
  className = "mb-3",
  children,
  id,
  level = 2,
}: SectionHeaderProps) {
  const Heading = (level === 3 ? "h3" : "h2") as "h2" | "h3";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`w-2 h-2 rounded-sm bg-${color}`}
        aria-hidden="true"
      />
      <Heading
        id={id}
        // Inline style on margin: globals.css applies `margin-bottom: 0.5em`
        // to every heading (WCAG line-height pass), and unlayered CSS beats
        // Tailwind's `m-0` utility, which would otherwise leak a 7px shift
        // beneath every section title. Inline trumps both.
        style={{ margin: 0, lineHeight: "inherit" }}
        className={`text-xs font-medium text-${color} uppercase tracking-wide`}
      >
        {title}
      </Heading>
      <span className="corner-label" aria-hidden="true">
        {cornerLabel}
      </span>
      <InfoTooltip
        title={tooltipTitle}
        content={tooltipContent}
        accentColor={color}
      />
      {children}
    </div>
  );
}
