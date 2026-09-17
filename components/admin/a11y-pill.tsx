/**
 * A11y pill — compact WCAG pass/fail badge with click-to-expand detail.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useMemo, useState } from "react";
import { Check, X, ChevronDown } from "lucide-react";
import { contrastRatio, wcagLevel } from "@/lib/color-utils";

export interface A11yPair {
  label: string;
  fgKey: string;
  bgKey: string;
  /** If true, allowed to use 3:1 (UI/large text). Otherwise 4.5:1 required. */
  large?: boolean;
}

/** Default pairs to check against any palette overrides. */
export const DEFAULT_A11Y_PAIRS: A11yPair[] = [
  { label: "Text / Bg", fgKey: "--fc-text", bgKey: "--fc-bg" },
  { label: "Text / Surface", fgKey: "--fc-text", bgKey: "--fc-surface" },
  { label: "Secondary / Bg", fgKey: "--fc-text-secondary", bgKey: "--fc-bg" },
  { label: "Muted / Bg", fgKey: "--fc-text-muted", bgKey: "--fc-bg", large: true },
  { label: "On-accent / Accent", fgKey: "--fc-accent-on", bgKey: "--fc-accent" },
  { label: "Accent / Bg", fgKey: "--fc-accent", bgKey: "--fc-bg", large: true },
  { label: "Backstory / Bg", fgKey: "--fc-corner-backstory", bgKey: "--fc-bg", large: true },
  { label: "Context / Bg", fgKey: "--fc-corner-context", bgKey: "--fc-bg", large: true },
  { label: "Links / Bg", fgKey: "--fc-corner-links", bgKey: "--fc-bg", large: true },
  { label: "CC / Bg", fgKey: "--fc-corner-cc", bgKey: "--fc-bg", large: true },
];

export interface A11yResult {
  pair: A11yPair;
  fg: string | null;
  bg: string | null;
  ratio: number;
  level: ReturnType<typeof wcagLevel>;
  pass: boolean;
}

export function computeA11yResults(
  overrides: Record<string, string>,
  pairs: A11yPair[] = DEFAULT_A11Y_PAIRS,
): A11yResult[] {
  return pairs.map((pair) => {
    const fg = overrides[pair.fgKey] ?? null;
    const bg = overrides[pair.bgKey] ?? null;
    if (!fg || !bg) {
      return {
        pair,
        fg,
        bg,
        ratio: 0,
        level: "fail" as const,
        pass: false,
      };
    }
    const ratio = contrastRatio(fg, bg);
    const level = wcagLevel(ratio, pair.large);
    return {
      pair,
      fg,
      bg,
      ratio,
      level,
      pass: level !== "fail",
    };
  });
}

interface Props {
  overrides: Record<string, string>;
}

export function A11yPill({ overrides }: Props) {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => computeA11yResults(overrides), [overrides]);

  const checkable = results.filter((r) => r.fg && r.bg);
  const passing = checkable.filter((r) => r.pass).length;
  const total = checkable.length;
  const allPass = total > 0 && passing === total;
  const noneCheckable = total === 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={noneCheckable}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium disabled:opacity-50"
        style={{
          background: noneCheckable
            ? "var(--fc-wash)"
            : allPass
              ? "color-mix(in srgb, #22c55e 15%, transparent)"
              : "color-mix(in srgb, var(--fc-danger) 12%, transparent)",
          color: noneCheckable
            ? "var(--fc-text-muted)"
            : allPass
              ? "#22c55e"
              : "var(--fc-danger)",
          border: `1px solid ${noneCheckable ? "var(--fc-border)" : allPass ? "#22c55e" : "var(--fc-danger)"}`,
        }}
        aria-expanded={open}
        aria-label="WCAG contrast report"
      >
        {noneCheckable
          ? "WCAG: n/a"
          : `WCAG ${passing}/${total}`}
        {!noneCheckable && (
          <ChevronDown
            size={10}
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease",
            }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
            width: 260,
          }}
        >
          <ul className="text-[11px]">
            {results.map((r, i) => (
              <li
                key={r.pair.label}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                style={{
                  borderTop:
                    i === 0
                      ? "none"
                      : "1px solid var(--fc-border-subtle)",
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {r.fg && r.bg ? (
                    <span
                      className="inline-flex items-center justify-center w-6 h-4 rounded shrink-0 text-[9px] font-semibold"
                      style={{ background: r.bg, color: r.fg }}
                    >
                      Aa
                    </span>
                  ) : (
                    <span className="w-6 h-4 rounded inline-block shrink-0 opacity-30 border border-current" />
                  )}
                  <span
                    className="truncate"
                    style={{ color: "var(--fc-text)" }}
                  >
                    {r.pair.label}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.fg && r.bg ? (
                    <>
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--fc-text-muted)" }}
                      >
                        {r.ratio.toFixed(1)}
                      </span>
                      {r.pass ? (
                        <Check size={11} style={{ color: "#22c55e" }} />
                      ) : (
                        <X size={11} style={{ color: "var(--fc-danger)" }} />
                      )}
                    </>
                  ) : (
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--fc-text-faint)" }}
                    >
                      n/a
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
