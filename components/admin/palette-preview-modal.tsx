/**
 * Palette Preview Modal — centered modal with click-to-edit sample UI,
 * dark/light toggle, and WCAG report.
 *
 * Click any styled region to open a color picker for the underlying CSS var.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { X, Moon, Sun, Check } from "lucide-react";
import {
  computeA11yResults,
  DEFAULT_A11Y_PAIRS,
} from "@/components/admin/a11y-pill";
import { ColorWheelPopover } from "./color-wheel-popover";

type Mode = "dark" | "light";

interface Props {
  darkOverrides: Record<string, string>;
  lightOverrides: Record<string, string>;
  onClose: () => void;
  /**
   * Called when the user picks a color inside the modal. Editor applies
   * the patch to its own state so live updates reflect here too.
   */
  onPatch?: (mode: Mode, key: string, value: string) => void;
}

function paletteVars(overrides: Record<string, string>): CSSProperties {
  return overrides as unknown as CSSProperties;
}

/**
 * Clickable region — wraps children with a button that captures the var key
 * and bounding rect, then bubbles up to the modal to open a picker.
 */
function Hot({
  varKey,
  onPick,
  children,
  className = "",
  style,
  as = "button",
}: {
  varKey: string;
  onPick: (key: string, rect: DOMRect) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "button" | "div";
}) {
  const handleClick = (e: ReactMouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onPick(varKey, rect);
  };
  if (as === "div") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onPick(varKey, rect);
          }
        }}
        className={`fc-preview-hot ${className}`}
        style={{ cursor: "pointer", ...style }}
        title={`Edit ${varKey}`}
      >
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fc-preview-hot ${className}`}
      style={{ cursor: "pointer", textAlign: "left", ...style }}
      title={`Edit ${varKey}`}
    >
      {children}
    </button>
  );
}

export function PalettePreviewModal({
  darkOverrides,
  lightOverrides,
  onClose,
  onPatch,
}: Props) {
  const [mode, setMode] = useState<Mode>("dark");
  const [picker, setPicker] = useState<{
    key: string;
    anchorRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (picker) {
          setPicker(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, picker]);

  const overrides = mode === "dark" ? darkOverrides : lightOverrides;
  const results = computeA11yResults(overrides, DEFAULT_A11Y_PAIRS);
  const checkable = results.filter((r) => r.fg && r.bg);
  const passing = checkable.filter((r) => r.pass).length;

  const handlePick = useCallback((key: string, anchorRect: DOMRect) => {
    setPicker({ key, anchorRect });
  }, []);

  const handleWheelChange = useCallback(
    (hex: string) => {
      if (!picker || !onPatch) return;
      onPatch(mode, picker.key, hex);
    },
    [picker, mode, onPatch],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)" }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-label="Palette preview"
        className="relative rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{
            borderBottom: "1px solid var(--fc-border)",
            background: "var(--fc-bg)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--fc-text)" }}
            >
              Palette Preview
            </h2>
            <span
              className="text-[10px] hidden sm:inline"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Click any region to edit
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Mode toggle */}
            <div
              className="inline-flex rounded-md p-0.5 gap-0.5"
              style={{
                background: "var(--fc-wash)",
                border: "1px solid var(--fc-border)",
              }}
            >
              {(["dark", "light"] as const).map((m) => {
                const Icon = m === "dark" ? Moon : Sun;
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                    style={{
                      background: isActive ? "var(--fc-accent)" : "transparent",
                      color: isActive
                        ? "var(--fc-accent-on)"
                        : "var(--fc-text)",
                    }}
                  >
                    <Icon size={10} />
                    {m}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="fc-list__action"
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Sample app area — scoped with CSS vars */}
          <div
            className="p-3 space-y-3"
            style={{
              ...paletteVars(overrides),
              background: overrides["--fc-bg"] || "var(--fc-bg)",
              color: overrides["--fc-text"] || "var(--fc-text)",
              minHeight: 280,
            }}
          >
            {/* Mock header */}
            <Hot
              varKey="--fc-header-bg"
              onPick={handlePick}
              as="div"
              className="flex items-center justify-between px-3 py-2 rounded"
              style={{
                background:
                  overrides["--fc-header-bg"] || "var(--fc-header-bg)",
                color:
                  overrides["--fc-header-text"] || "var(--fc-header-text)",
                borderBottom: `1px solid ${
                  overrides["--fc-header-border"] || "var(--fc-border)"
                }`,
              }}
            >
              <div className="flex items-center gap-2">
                <Hot varKey="--fc-text" onPick={handlePick}>
                  <span className="font-semibold text-sm">Four Corners</span>
                </Hot>
                <Hot varKey="--fc-text-muted" onPick={handlePick}>
                  <span className="text-[11px] opacity-60">Gallery</span>
                </Hot>
              </div>
              <Hot
                varKey="--fc-accent"
                onPick={handlePick}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{
                  background: overrides["--fc-accent"] || "var(--fc-accent)",
                  color:
                    overrides["--fc-accent-on"] || "var(--fc-accent-on)",
                }}
              >
                New Project
              </Hot>
            </Hot>

            {/* Sample corners card + text samples */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Corners card */}
              <Hot
                varKey="--fc-surface"
                onPick={handlePick}
                as="div"
                className="relative rounded-lg p-4 aspect-[4/3] flex items-end"
                style={{
                  background:
                    overrides["--fc-surface"] || "var(--fc-surface)",
                  border: `1px solid ${
                    overrides["--fc-border"] || "var(--fc-border)"
                  }`,
                }}
              >
                {[
                  { key: "--fc-corner-backstory", pos: "top-2 left-2" },
                  { key: "--fc-corner-context", pos: "top-2 right-2" },
                  { key: "--fc-corner-links", pos: "bottom-2 left-2" },
                  { key: "--fc-corner-cc", pos: "bottom-2 right-2" },
                ].map(({ key, pos }) => (
                  <Hot
                    key={key}
                    varKey={key}
                    onPick={handlePick}
                    className={`absolute w-6 h-6 rounded ${pos}`}
                    style={{
                      background: overrides[key] || `var(${key})`,
                    }}
                  >
                    <span className="sr-only">{key}</span>
                  </Hot>
                ))}
                <div className="relative">
                  <Hot varKey="--fc-text" onPick={handlePick}>
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color: overrides["--fc-text"] || "var(--fc-text)",
                      }}
                    >
                      Project Title
                    </p>
                  </Hot>
                  <Hot varKey="--fc-text-muted" onPick={handlePick}>
                    <p
                      className="text-xs mt-0.5"
                      style={{
                        color:
                          overrides["--fc-text-muted"] ||
                          "var(--fc-text-muted)",
                      }}
                    >
                      Photographer Name · 2026
                    </p>
                  </Hot>
                </div>
              </Hot>

              {/* Text samples */}
              <Hot
                varKey="--fc-surface"
                onPick={handlePick}
                as="div"
                className="rounded-lg p-3 space-y-2"
                style={{
                  background:
                    overrides["--fc-surface"] || "var(--fc-surface)",
                  border: `1px solid ${
                    overrides["--fc-border"] || "var(--fc-border)"
                  }`,
                }}
              >
                <Hot varKey="--fc-text" onPick={handlePick}>
                  <p
                    className="text-sm font-semibold"
                    style={{
                      color: overrides["--fc-text"] || "var(--fc-text)",
                    }}
                  >
                    Primary heading
                  </p>
                </Hot>
                <Hot varKey="--fc-text-secondary" onPick={handlePick}>
                  <p
                    className="text-xs"
                    style={{
                      color:
                        overrides["--fc-text-secondary"] ||
                        "var(--fc-text-secondary)",
                    }}
                  >
                    Secondary paragraph text sits on the surface and should
                    pass WCAG AA for body copy.
                  </p>
                </Hot>
                <Hot varKey="--fc-text-muted" onPick={handlePick}>
                  <p
                    className="text-[11px]"
                    style={{
                      color:
                        overrides["--fc-text-muted"] ||
                        "var(--fc-text-muted)",
                    }}
                  >
                    Muted helper text for timestamps and labels.
                  </p>
                </Hot>
                <div className="flex gap-1.5 pt-1">
                  <Hot
                    varKey="--fc-accent"
                    onPick={handlePick}
                    className="px-2.5 py-1 rounded text-[11px] font-medium"
                    style={{
                      background:
                        overrides["--fc-accent"] || "var(--fc-accent)",
                      color:
                        overrides["--fc-accent-on"] || "var(--fc-accent-on)",
                    }}
                  >
                    Primary
                  </Hot>
                  <Hot
                    varKey="--fc-wash"
                    onPick={handlePick}
                    className="px-2.5 py-1 rounded text-[11px] font-medium"
                    style={{
                      background:
                        overrides["--fc-wash"] || "var(--fc-wash)",
                      color: overrides["--fc-text"] || "var(--fc-text)",
                      border: `1px solid ${
                        overrides["--fc-border"] || "var(--fc-border)"
                      }`,
                    }}
                  >
                    Secondary
                  </Hot>
                </div>
              </Hot>
            </div>
          </div>

          {/* WCAG report */}
          <div
            className="p-3 space-y-2"
            style={{
              borderTop: "1px solid var(--fc-border)",
              background: "var(--fc-surface)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--fc-text-muted)" }}
              >
                WCAG Contrast Report
              </h3>
              <span
                className="text-[11px]"
                style={{
                  color:
                    passing === checkable.length
                      ? "#22c55e"
                      : "var(--fc-danger)",
                }}
              >
                {passing} / {checkable.length} passing
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {results.map((r) => (
                <li
                  key={r.pair.label}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px]"
                  style={{
                    background: "var(--fc-bg)",
                    border: "1px solid var(--fc-border-subtle)",
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {r.fg && r.bg ? (
                      <span
                        className="inline-flex items-center justify-center w-7 h-5 rounded shrink-0 text-[10px] font-semibold"
                        style={{ background: r.bg, color: r.fg }}
                      >
                        Aa
                      </span>
                    ) : (
                      <span className="w-7 h-5 rounded shrink-0 opacity-30 border border-current" />
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
                          {r.ratio.toFixed(2)}
                        </span>
                        {r.pass ? (
                          <Check size={12} style={{ color: "#22c55e" }} />
                        ) : (
                          <X size={12} style={{ color: "var(--fc-danger)" }} />
                        )}
                        <span
                          className="text-[9px] font-semibold uppercase"
                          style={{
                            color: r.pass ? "#22c55e" : "var(--fc-danger)",
                          }}
                        >
                          {r.level}
                        </span>
                      </>
                    ) : (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--fc-text-faint)" }}
                      >
                        not set
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Color picker popover rendered as child of the overlay */}
      {picker && (
        <ColorWheelPopover
          value={overrides[picker.key] || "#84cc16"}
          onChange={handleWheelChange}
          onClose={() => setPicker(null)}
          anchorRect={picker.anchorRect}
        />
      )}
    </div>
  );
}
