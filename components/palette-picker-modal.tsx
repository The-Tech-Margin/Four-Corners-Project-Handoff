"use client";

import { useEffect, useState, useCallback } from "react";
import { Check } from "lucide-react";
import Modal from "./modal";
import { applyPalette, resetPalette } from "@/lib/palette";
import { recordThemeSelection } from "@/lib/theme-prompt";

interface PaletteOption {
  slug: string;
  name: string;
  dark_overrides: Record<string, string>;
  light_overrides: Record<string, string>;
}

const SWATCH_KEYS = [
  "--fc-corner-backstory",
  "--fc-corner-context",
  "--fc-corner-links",
  "--fc-corner-cc",
  "--fc-accent",
];

export interface PalettePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, title becomes "Do you want to set a custom theme?" */
  promptMode?: boolean;
  /** Called after a palette is applied (or null for default). */
  onApplied?: (slug: string | null) => void;
}

/**
 * Apply palette overrides immediately and sync all caches so
 * PersonaProvider, the blocking script, and dark/light toggle
 * all stay consistent without a page reload.
 */
function applyAndCache(palette: PaletteOption | null) {
  resetPalette();

  if (palette) {
    const isLight = document.documentElement.classList.contains("light");
    const overrides = isLight ? palette.light_overrides : palette.dark_overrides;
    if (Object.keys(overrides).length > 0) {
      applyPalette(overrides);
    }

    // Sync storage caches
    try {
      const darkJson = JSON.stringify(palette.dark_overrides);
      const lightJson = JSON.stringify(palette.light_overrides);
      sessionStorage.setItem("fc-palette-dark", darkJson);
      sessionStorage.setItem("fc-palette-light", lightJson);
      localStorage.setItem("fc-palette-dark", darkJson);
      localStorage.setItem("fc-palette-light", lightJson);
      sessionStorage.setItem("fc-persona", palette.slug);
    } catch { /* quota */ }

    // Notify PersonaProvider so its paletteRef stays current
    window.dispatchEvent(
      new CustomEvent("fc:palette-changed", {
        detail: {
          dark: palette.dark_overrides,
          light: palette.light_overrides,
          slug: palette.slug,
        },
      }),
    );
  } else {
    // "Default" — clear caches and load global
    try {
      sessionStorage.removeItem("fc-palette-dark");
      sessionStorage.removeItem("fc-palette-light");
      localStorage.removeItem("fc-palette-dark");
      localStorage.removeItem("fc-palette-light");
      sessionStorage.removeItem("fc-persona");
    } catch { /* ignore */ }

    // Load global palette and apply it
    fetch("/api/palettes/global", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.dark_overrides || data?.light_overrides) {
          const isLight = document.documentElement.classList.contains("light");
          const overrides = isLight
            ? (data.light_overrides || {})
            : (data.dark_overrides || {});
          if (Object.keys(overrides).length > 0) {
            applyPalette(overrides);
          }
          try {
            sessionStorage.setItem("fc-palette-dark", JSON.stringify(data.dark_overrides || {}));
            sessionStorage.setItem("fc-palette-light", JSON.stringify(data.light_overrides || {}));
            localStorage.setItem("fc-palette-dark", JSON.stringify(data.dark_overrides || {}));
            localStorage.setItem("fc-palette-light", JSON.stringify(data.light_overrides || {}));
            if (data.slug) sessionStorage.setItem("fc-persona", data.slug);
          } catch { /* quota */ }

          window.dispatchEvent(
            new CustomEvent("fc:palette-changed", {
              detail: {
                dark: data.dark_overrides || {},
                light: data.light_overrides || {},
                slug: data.slug || null,
              },
            }),
          );
        }
      })
      .catch(() => { /* graceful — already reset */ });
  }
}

export function PalettePickerModal({
  isOpen,
  onClose,
  promptMode = false,
  onApplied,
}: PalettePickerModalProps) {
  const [palettes, setPalettes] = useState<PaletteOption[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load palettes + current preference when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch("/api/palettes").then((r) => r.json()),
      fetch("/api/user/preferences").then((r) => r.json()),
    ])
      .then(async ([slugList, prefs]) => {
        if (cancelled) return;
        setCurrentSlug(prefs.palette_slug ?? null);

        const list: { slug: string; name: string }[] = Array.isArray(slugList) ? slugList : [];
        const full = await Promise.all(
          list.map(async (p) => {
            const res = await fetch(`/api/palettes/${encodeURIComponent(p.slug)}`);
            if (!res.ok) return null;
            const data = await res.json();
            return {
              slug: p.slug,
              name: p.name,
              dark_overrides: data.dark_overrides || {},
              light_overrides: data.light_overrides || {},
            } as PaletteOption;
          }),
        );
        if (!cancelled) setPalettes(full.filter(Boolean) as PaletteOption[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen]);

  const selectPalette = useCallback(
    async (slug: string | null) => {
      setSaving(true);
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palette_slug: slug }),
        });
        if (!res.ok) throw new Error("Failed to save");

        setCurrentSlug(slug);

        // Apply immediately — no reload needed
        const palette = slug ? palettes.find((p) => p.slug === slug) ?? null : null;
        applyAndCache(palette);

        // Any selection (including Default) means the user has engaged
        // with the theme picker — suppress future prompts permanently.
        recordThemeSelection();

        onApplied?.(slug);
        onClose();
      } catch {
        // Keep modal open so user can retry
      } finally {
        setSaving(false);
      }
    },
    [palettes, onApplied, onClose],
  );

  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("light");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={promptMode ? "Do you want to set a custom theme?" : "Choose Theme"}
      maxWidth="lg"
    >
      <div className="p-4 sm:p-6">
        {loading ? (
          <p style={{ color: "var(--fc-text-muted)" }}>Loading palettes...</p>
        ) : palettes.length === 0 ? (
          <p style={{ color: "var(--fc-text-muted)" }}>No palettes available.</p>
        ) : (
          <div className="space-y-3">
            {/* Default / reset option */}
            <button
              onClick={() => selectPalette(null)}
              disabled={saving}
              className="w-full text-left flex items-center justify-between p-4 rounded-lg transition-colors"
              style={{
                background:
                  currentSlug === null
                    ? "var(--fc-surface-alt)"
                    : "var(--fc-surface)",
                border:
                  currentSlug === null
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
                  Use the site&apos;s global palette
                </span>
              </div>
              {currentSlug === null && (
                <Check size={18} style={{ color: "var(--fc-accent)" }} />
              )}
            </button>

            {palettes.map((p) => {
              const isSelected = currentSlug === p.slug;
              const overrides = isLight
                ? p.light_overrides
                : p.dark_overrides;

              return (
                <button
                  key={p.slug}
                  onClick={() => selectPalette(p.slug)}
                  disabled={saving}
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
                    <span className="font-medium truncate">{p.name}</span>
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
        )}
      </div>
    </Modal>
  );
}
