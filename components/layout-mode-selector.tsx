/**
 * Layout Mode Selector — switches between editor layout modes.
 *
 * Reads from the layout mode registry and renders available modes
 * as a button group. Uses existing CSS variables for styling.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useFourCornersStore } from "@/lib/store";
import { LAYOUT_MODES, getAvailableLayoutModes } from "@/lib/layout-modes";

export function LayoutModeSelector() {
  const { layoutMode, setLayoutMode, mode } = useFourCornersStore();
  const available = getAvailableLayoutModes(mode);

  return (
    <div className="flex items-center gap-1">
      {available.map((m) => (
        <button
          key={m.id}
          onClick={() => setLayoutMode(m.id)}
          className={`px-2 py-1 text-xs rounded transition-all ${
            layoutMode === m.id
              ? "bg-accent/20 text-accent border border-accent/30"
              : "text-gray-500 hover:text-gray-300 hover:bg-surface-alt/50 border border-transparent"
          }`}
          title={m.description}
          aria-label={`${m.label} layout mode: ${m.description}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
