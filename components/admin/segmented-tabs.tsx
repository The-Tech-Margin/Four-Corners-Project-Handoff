/**
 * SegmentedTabs — compact pill tab group for admin filter bars.
 *
 * Implements the ARIA tabs pattern properly: roving tabindex (one tab stop
 * for the whole group), ArrowLeft/ArrowRight/Home/End move focus AND select
 * (selection follows focus), Tab leaves the group. Styling matches the
 * existing admin pill groups (wash background, accent active pill).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useRef, type KeyboardEvent } from "react";

export interface SegmentedTabsProps<K extends string | number> {
  /** Accessible name for the group. */
  label: string;
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}

export function SegmentedTabs<K extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedTabsProps<K>) {
  const ref = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.key === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next === -1) return;
    e.preventDefault();
    onChange(options[next].key);
    // Selection follows focus — move focus to the newly active tab.
    requestAnimationFrame(() => {
      ref.current
        ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
        ?.focus();
    });
  };

  return (
    <div
      ref={ref}
      className="inline-flex rounded"
      style={{
        background: "var(--fc-wash)",
        border: "1px solid var(--fc-border)",
        padding: 1,
        gap: 1,
      }}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={String(opt.key)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.key)}
            className="rounded text-[10px] font-medium transition-colors"
            style={{
              padding: "2px 6px",
              background: isActive ? "var(--fc-accent)" : "transparent",
              color: isActive ? "var(--fc-accent-on)" : "var(--fc-text-muted)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
