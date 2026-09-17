/**
 * Theme picker. Reads the built-in presets in lib/palette-presets.ts and
 * stores the choice per browser — no account, no server round-trip.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import Modal from "./modal";
import { applyPalette, resetPalette } from "@/lib/palette";
import { PALETTE_PRESETS, type PalettePreset } from "@/lib/palette-presets";
import {
  PERSONA_STORAGE_KEY,
  readStoredPersona,
} from "@/lib/persona-preference";

export interface PalettePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a preset is applied (or null for the built-in default). */
  onApplied?: (presetId: string | null) => void;
}

/**
 * Apply a preset immediately and sync the caches the blocking script in
 * app/layout.tsx and PersonaProvider read, so dark/light and reloads stay
 * consistent without a page refresh.
 */
function applyAndCache(preset: PalettePreset | null): void {
  resetPalette();

  try {
    if (preset) {
      const darkJson = JSON.stringify(preset.dark);
      const lightJson = JSON.stringify(preset.light);
      sessionStorage.setItem("fc-palette-dark", darkJson);
      sessionStorage.setItem("fc-palette-light", lightJson);
      localStorage.setItem("fc-palette-dark", darkJson);
      localStorage.setItem("fc-palette-light", lightJson);
      sessionStorage.setItem("fc-persona", preset.id);
      localStorage.setItem(PERSONA_STORAGE_KEY, preset.id);
    } else {
      sessionStorage.removeItem("fc-palette-dark");
      sessionStorage.removeItem("fc-palette-light");
      localStorage.removeItem("fc-palette-dark");
      localStorage.removeItem("fc-palette-light");
      sessionStorage.removeItem("fc-persona");
      localStorage.removeItem(PERSONA_STORAGE_KEY);
    }
  } catch {
    /* storage disabled or full — the applied palette below still holds */
  }

  if (preset) {
    const isLight = document.documentElement.classList.contains("light");
    applyPalette(isLight ? preset.light : preset.dark);
  }

  window.dispatchEvent(
    new CustomEvent("fc:palette-changed", {
      detail: {
        dark: preset?.dark ?? {},
        light: preset?.light ?? {},
        slug: preset?.id ?? null,
      },
    }),
  );
}

export function PalettePickerModal({
  isOpen,
  onClose,
  onApplied,
}: PalettePickerModalProps) {
  const [currentId, setCurrentId] = useState<string | null>(() =>
    readStoredPersona(),
  );

  const selectPreset = useCallback(
    (presetId: string | null) => {
      const preset = presetId
        ? (PALETTE_PRESETS.find((p) => p.id === presetId) ?? null)
        : null;
      applyAndCache(preset);
      setCurrentId(preset?.id ?? null);
      onApplied?.(preset?.id ?? null);
      onClose();
    },
    [onApplied, onClose],
  );

  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("light");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose Theme" maxWidth="lg">
      <div className="p-4 sm:p-6">
        <div className="space-y-3">
          <button
            onClick={() => selectPreset(null)}
            className="w-full text-left flex items-center justify-between p-4 rounded-lg transition-colors"
            style={{
              background:
                currentId === null
                  ? "var(--fc-surface-alt)"
                  : "var(--fc-surface)",
              border:
                currentId === null
                  ? "2px solid var(--fc-accent)"
                  : "1px solid var(--fc-border)",
            }}
          >
            <div>
              <span className="font-medium">Default</span>
              <span
                className="block text-xs mt-0.5"
                style={{ color: "var(--fc-text-muted)" }}
              >
                Use the built-in palette
              </span>
            </div>
            {currentId === null && (
              <Check size={18} style={{ color: "var(--fc-accent)" }} />
            )}
          </button>

          {PALETTE_PRESETS.map((preset) => {
            const isSelected = currentId === preset.id;
            const overrides = isLight ? preset.light : preset.dark;

            return (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset.id)}
                className="w-full text-left flex items-center justify-between p-4 rounded-lg transition-colors"
                style={{
                  background: isSelected
                    ? "var(--fc-surface-alt)"
                    : "var(--fc-surface)",
                  border: isSelected
                    ? "2px solid var(--fc-accent)"
                    : "1px solid var(--fc-border)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex gap-1.5 shrink-0">
                    {SWATCH_KEYS.map((key) => {
                      const color = overrides[key];
                      return color ? (
                        <span
                          key={key}
                          className="w-5 h-5 rounded-full inline-block"
                          style={{
                            background: color,
                            border: "1px solid rgba(128,128,128,0.3)",
                          }}
                          title={key.replace("--fc-", "")}
                        />
                      ) : null;
                    })}
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium truncate block">
                      {preset.name}
                    </span>
                    <span
                      className="block text-xs mt-0.5 truncate"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      {preset.description}
                    </span>
                  </div>
                </div>
                {isSelected && (
                  <Check
                    size={18}
                    className="shrink-0 ml-2"
                    style={{ color: "var(--fc-accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

const SWATCH_KEYS = [
  "--fc-corner-backstory",
  "--fc-corner-context",
  "--fc-corner-links",
  "--fc-corner-cc",
  "--fc-accent",
];
