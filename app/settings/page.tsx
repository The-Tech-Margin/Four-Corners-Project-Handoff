"use client";

import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/app-header";
import { Check } from "lucide-react";

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

export default function SettingsPage() {
  const [palettes, setPalettes] = useState<PaletteOption[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/palettes").then((r) => r.json()),
      fetch("/api/user/preferences").then((r) => r.json()),
    ])
      .then(async ([slugList, prefs]) => {
        setCurrentSlug(prefs.palette_slug ?? null);

        // Fetch full palette data for swatches
        const paletteSlugs: { slug: string; name: string }[] = Array.isArray(slugList) ? slugList : [];
        const full = await Promise.all(
          paletteSlugs.map(async (p) => {
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
        setPalettes(full.filter(Boolean) as PaletteOption[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectPalette = useCallback(
    async (slug: string | null) => {
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palette_slug: slug }),
        });
        if (!res.ok) throw new Error("Failed to save");
        setCurrentSlug(slug);
        setMessage(slug ? "Palette saved — reload to apply." : "Reset to default — reload to apply.");
      } catch {
        setMessage("Failed to save preference.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const isLight = typeof document !== "undefined" && document.documentElement.classList.contains("light");

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <div className="h-14 sm:h-16" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-sm mb-8" style={{ color: "var(--fc-text-muted)" }}>
          Choose a palette to override the default site theme when you&apos;re logged in.
        </p>

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
                background: currentSlug === null ? "var(--fc-surface-alt)" : "var(--fc-surface)",
                border: currentSlug === null
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
              const overrides = isLight ? p.light_overrides : p.dark_overrides;

              return (
                <button
                  key={p.slug}
                  onClick={() => selectPalette(p.slug)}
                  disabled={saving}
                  className="w-full text-left flex items-center justify-between p-4 rounded-lg transition-colors"
                  style={{
                    background: isSelected ? "var(--fc-surface-alt)" : "var(--fc-surface)",
                    border: isSelected
                      ? "2px solid var(--fc-accent)"
                      : "1px solid var(--fc-border)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Corner color swatches */}
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
                    <Check size={18} className="shrink-0 ml-2" style={{ color: "var(--fc-accent)" }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {message && (
          <p
            className="mt-4 text-sm font-medium"
            style={{ color: "var(--fc-accent)" }}
          >
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
