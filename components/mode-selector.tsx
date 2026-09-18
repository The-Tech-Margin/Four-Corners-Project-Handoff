"use client";

import { useFourCornersStore } from "@/lib/store";

export function ModeSelector() {
  const { mode, setMode } = useFourCornersStore();

  const dot = (active: boolean, cssVar: string) => (
    <div
      className="w-1.5 h-1.5 rounded-sm transition-colors"
      style={{ background: active ? `var(${cssVar})` : "var(--fc-text-faint)" }}
    />
  );

  const btn = (
    modeType: "minimal" | "standard" | "complete",
    borderVar: string,
    children: React.ReactNode,
    label: string,
    title: string,
  ) => {
    const isActive = mode === modeType;
    return (
      <button
        onClick={() => setMode(modeType)}
        className="group relative p-1.5 rounded transition-all"
        style={
          isActive
            ? {
                background: `color-mix(in srgb, var(${borderVar}) 15%, transparent)`,
                border: `1px solid color-mix(in srgb, var(${borderVar}) 45%, transparent)`,
              }
            : { border: "1px solid transparent" }
        }
        title={title}
        aria-label={label}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1">
      {btn(
        "minimal",
        "--fc-corner-cc",
        <div className="flex gap-0.5 w-3 h-4 items-center justify-center">
          {dot(mode === "minimal", "--fc-corner-cc")}
        </div>,
        "Minimal mode: Authorship required + choose 1-2 additional corners",
        "Minimal: Authorship + 1-2 corners",
      )}
      {btn(
        "standard",
        "--fc-accent",
        <div className="grid grid-cols-3 gap-0.5 w-6 h-4 items-center">
          {dot(mode === "standard", "--fc-corner-backstory")}
          {dot(mode === "standard", "--fc-corner-context")}
          {dot(mode === "standard", "--fc-corner-links")}
        </div>,
        "Standard mode: All four corners available",
        "Standard: All four corners available",
      )}
      {btn(
        "complete",
        "--fc-accent",
        <div className="grid grid-cols-4 gap-0.5 w-8 h-4 items-center">
          {dot(mode === "complete", "--fc-corner-backstory")}
          {dot(mode === "complete", "--fc-corner-context")}
          {dot(mode === "complete", "--fc-corner-links")}
          {dot(mode === "complete", "--fc-corner-cc")}
        </div>,
        "Complete mode: All four corners + subject protection fields",
        "Complete: All corners + subject protection fields",
      )}
    </div>
  );
}
