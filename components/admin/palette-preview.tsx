/**
 * Live palette preview — scoped container showing key UI elements.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

export function PalettePreview({
  overrides,
}: {
  overrides: Record<string, string>;
}) {
  return (
    <div
      className="rounded-lg p-4 space-y-3 mt-4"
      style={{
        ...overrides,
        background: overrides["--fc-bg"] || "var(--fc-bg)",
        color: overrides["--fc-text"] || "var(--fc-text)",
        border: `1px solid ${overrides["--fc-border"] || "var(--fc-border)"}`,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
        Preview
      </p>

      <div
        className="flex items-center gap-3 px-3 py-2 rounded"
        style={{
          background: overrides["--fc-header-bg"] || "var(--fc-header-bg)",
          color: overrides["--fc-header-text"] || "var(--fc-header-text)",
        }}
      >
        <span className="font-semibold text-sm">Four Corners</span>
        <span className="ml-auto text-xs opacity-60">Header</span>
      </div>

      <button
        className="px-4 py-1.5 rounded text-sm font-medium"
        style={{
          background: overrides["--fc-accent"] || "var(--fc-accent)",
          color: overrides["--fc-accent-on"] || "var(--fc-accent-on)",
        }}
      >
        Accent Button
      </button>

      <div className="flex gap-2">
        {[
          { key: "--fc-corner-backstory", label: "BS" },
          { key: "--fc-corner-context", label: "CX" },
          { key: "--fc-corner-links", label: "LK" },
          { key: "--fc-corner-cc", label: "CC" },
        ].map(({ key, label }) => (
          <div
            key={key}
            className="w-10 h-10 rounded flex items-center justify-center text-xs font-bold"
            style={{
              background: overrides[key] || `var(${key})`,
              color: "#fff",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-sm" style={{ color: overrides["--fc-text"] || "var(--fc-text)" }}>
          Primary text
        </p>
        <p className="text-sm" style={{ color: overrides["--fc-text-secondary"] || "var(--fc-text-secondary)" }}>
          Secondary text
        </p>
        <p className="text-sm" style={{ color: overrides["--fc-text-muted"] || "var(--fc-text-muted)" }}>
          Muted text
        </p>
      </div>

      <div
        className="p-3 rounded"
        style={{
          background: overrides["--fc-surface"] || "var(--fc-surface)",
          border: `1px solid ${overrides["--fc-border"] || "var(--fc-border)"}`,
        }}
      >
        <span className="text-sm">Surface card</span>
      </div>
    </div>
  );
}
