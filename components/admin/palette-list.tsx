/**
 * Palette list with CRUD actions — compact list view with icon buttons.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Globe, Eye, Pencil, Trash2, Plus, Download, Copy, Upload } from "lucide-react";
import type { PersonaPalette } from "@/lib/persona";
import { InfoTooltip } from "@/components/info-tooltip";
import { downloadPalette, parsePaletteImport, uniqueSlug } from "@/lib/palette-io";

interface Props {
  onEdit: (palette: PersonaPalette) => void;
  onNew: () => void;
  refreshKey: number;
}

const SWATCH_KEYS = [
  "--fc-accent",
  "--fc-corner-backstory",
  "--fc-corner-context",
  "--fc-corner-links",
  "--fc-corner-cc",
];

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

interface GlobalResponse {
  global_slug: string | null;
}

type LoadState =
  | { status: "loading"; refreshKey: number }
  | {
      status: "ready";
      refreshKey: number;
      palettes: PersonaPalette[];
      globalSlug: string | null;
    }
  | { status: "error"; refreshKey: number };

export function PaletteList({ onEdit, onNew, refreshKey }: Props) {
  const [state, setState] = useState<LoadState>({
    status: "loading",
    refreshKey,
  });
  const [actionError, setActionError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If refreshKey changes mid-render, the stale state will trigger a re-render
  // through the effect below — no synchronous setState in the effect body.
  const isStale = state.refreshKey !== refreshKey;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/palettes").then((r) => r.json() as Promise<PersonaPalette[]>),
      fetch("/api/admin/palettes/global")
        .then((r) => r.json() as Promise<GlobalResponse>)
        .catch<GlobalResponse>(() => ({ global_slug: null })),
    ])
      .then(([data, global]) => {
        if (cancelled) return;
        setState({
          status: "ready",
          refreshKey,
          palettes: Array.isArray(data) ? data : [],
          globalSlug: global?.global_slug ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", refreshKey });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const palettes =
    state.status === "ready" && !isStale ? state.palettes : [];
  const globalSlug =
    state.status === "ready" && !isStale ? state.globalSlug : null;
  const loading = state.status === "loading" || isStale;

  const setGlobalSlug = useCallback((slug: string | null) => {
    setState((prev) =>
      prev.status === "ready" ? { ...prev, globalSlug: slug } : prev,
    );
  }, []);

  const handleDelete = useCallback(
    async (slug: string) => {
      if (!confirm(`Delete palette "${slug}"?`)) return;
      await fetch(`/api/admin/palettes/${slug}`, { method: "DELETE" });
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          ...prev,
          palettes: prev.palettes.filter((p) => p.slug !== slug),
          globalSlug: prev.globalSlug === slug ? null : prev.globalSlug,
        };
      });
    },
    [],
  );

  const handleSetGlobal = useCallback(
    async (slug: string | null) => {
      await fetch("/api/admin/palettes/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      setGlobalSlug(slug);
    },
    [setGlobalSlug],
  );

  /** Insert a freshly-created palette into the list, sorted by name. */
  const insertPalette = useCallback((created: PersonaPalette) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = [...prev.palettes, created].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { ...prev, palettes: next };
    });
  }, []);

  /** POST a new palette and add it to the list; returns true on success. */
  const createPalette = useCallback(
    async (body: {
      slug: string;
      name: string;
      dark_overrides: Record<string, string>;
      light_overrides: Record<string, string>;
    }): Promise<boolean> => {
      setActionError("");
      try {
        const res = await fetch("/api/admin/palettes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setActionError(data.error || "Save failed");
          return false;
        }
        const created = (await res.json()) as PersonaPalette;
        insertPalette(created);
        return true;
      } catch {
        setActionError("Network error");
        return false;
      }
    },
    [insertPalette],
  );

  const handleCopy = useCallback(
    (p: PersonaPalette) => {
      setState((prev) => {
        const slugs =
          prev.status === "ready" ? prev.palettes.map((x) => x.slug) : [];
        void createPalette({
          slug: uniqueSlug(p.slug, slugs),
          name: `${p.name} (copy)`,
          dark_overrides: p.dark_overrides || {},
          light_overrides: p.light_overrides || {},
        });
        return prev;
      });
    },
    [createPalette],
  );

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-importing the same file
      if (!file) return;
      setActionError("");
      try {
        const parsed = parsePaletteImport(JSON.parse(await file.text()));
        const slugs =
          state.status === "ready" ? state.palettes.map((x) => x.slug) : [];
        await createPalette({
          slug: uniqueSlug(parsed.slug, slugs),
          name: parsed.name,
          dark_overrides: parsed.dark_overrides,
          light_overrides: parsed.light_overrides,
        });
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not read palette file.",
        );
      }
    },
    [createPalette, state],
  );

  if (loading) {
    return <p style={{ color: "var(--fc-text-muted)" }}>Loading palettes...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">Persona Palettes</h2>
          <InfoTooltip
            size="sm"
            accentColor="corner-context"
            title="Persona Palettes"
            content="Each palette overrides CSS custom properties for a specific persona. Users can switch palettes via ?persona=slug in the URL, or you can set one as the global default for all visitors."
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium text-sm"
            style={{
              color: "var(--fc-text)",
              border: "1px solid var(--fc-border)",
            }}
            aria-label="Import palette from JSON file"
          >
            <Upload size={14} />
            Import
          </button>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium text-sm"
            style={{
              background: "var(--fc-accent)",
              color: "var(--fc-accent-on)",
            }}
          >
            <Plus size={14} />
            New Palette
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-xs mb-2" style={{ color: "var(--fc-danger)" }}>
          {actionError}
        </p>
      )}

      {palettes.length === 0 ? (
        <p style={{ color: "var(--fc-text-muted)" }}>
          No palettes yet. Create one to get started.
        </p>
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {palettes.map((p, idx) => {
            const isGlobal = globalSlug === p.slug;
            return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3"
                style={{
                  borderTop:
                    idx === 0 ? "none" : "1px solid var(--fc-border-subtle)",
                }}
              >
                {/* Line 1 (mobile): swatches + name + badge */}
                <div className="flex items-center gap-3 sm:contents min-w-0">
                  {/* Swatches */}
                  <div className="flex gap-1 shrink-0">
                    {SWATCH_KEYS.map((key) => {
                      const color = p.dark_overrides?.[key];
                      return (
                        <span
                          key={key}
                          className="w-4 h-4 rounded-full inline-block"
                          style={{
                            background: color || "transparent",
                            border: color
                              ? "1px solid rgba(128,128,128,0.25)"
                              : "1px dashed rgba(128,128,128,0.3)",
                          }}
                          title={key}
                        />
                      );
                    })}
                  </div>

                  {/* Name + global badge */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 sm:w-48 sm:flex-none sm:shrink-0">
                    <span className="font-medium truncate">{p.name}</span>
                    {isGlobal && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0"
                        style={{
                          background: "var(--fc-accent)",
                          color: "var(--fc-accent-on)",
                        }}
                      >
                        Global
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata — flex grow, wraps below swatches on mobile */}
                <div
                  className="flex-1 min-w-0 text-xs flex flex-wrap gap-x-2 gap-y-0.5 sm:truncate sm:block"
                  style={{ color: "var(--fc-text-muted)" }}
                >
                  {p.created_by_email && (
                    <span
                      className="truncate max-w-full"
                      title={`Creator: ${p.created_by_email}`}
                    >
                      {p.created_by_email}
                    </span>
                  )}
                  {p.created_by_email && p.created_at && (
                    <span className="hidden sm:inline mx-2 opacity-50">·</span>
                  )}
                  {p.created_at && (
                    <span title={new Date(p.created_at).toLocaleString()}>
                      {formatDate(p.created_at)}
                    </span>
                  )}
                  {p.updated_at && p.updated_at !== p.created_at && (
                    <>
                      <span className="hidden sm:inline mx-2 opacity-50">·</span>
                      <span
                        title={`Updated ${new Date(p.updated_at).toLocaleString()}`}
                      >
                        upd. {formatDate(p.updated_at)}
                      </span>
                    </>
                  )}
                </div>

                {/* Action icons — pinned right on desktop, right on mobile */}
                <div className="flex items-center gap-0.5 self-end sm:self-auto sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = isGlobal
                        ? `Clear "${p.name}" as the global default palette? All visitors will revert to the built-in theme.`
                        : `Set "${p.name}" as the global default palette? This will change the default theme for ALL visitors.`;
                      if (!window.confirm(msg)) return;
                      handleSetGlobal(isGlobal ? null : p.slug);
                    }}
                    className="fc-list__action"
                    style={
                      isGlobal
                        ? {
                            color: "var(--fc-accent)",
                            background: "color-mix(in srgb, var(--fc-accent) 12%, transparent)",
                          }
                        : undefined
                    }
                    aria-label={
                      isGlobal
                        ? "Clear global palette (affects all visitors)"
                        : "Set as global palette (affects all visitors)"
                    }
                    title={
                      isGlobal
                        ? "Clear global — affects all visitors"
                        : "Set global — affects all visitors"
                    }
                  >
                    <Globe size={14} />
                  </button>
                  <a
                    href={`/gallery?persona=${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fc-list__action"
                    aria-label="Preview palette in gallery"
                  >
                    <Eye size={16} />
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadPalette(p)}
                    className="fc-list__action"
                    aria-label="Export palette as JSON"
                    title="Export as JSON"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(p)}
                    className="fc-list__action"
                    aria-label="Save a copy of this palette"
                    title="Save as a copy"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="fc-list__action fc-list__action--edit"
                    aria-label="Edit palette"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.slug)}
                    className="fc-list__action fc-list__action--delete"
                    aria-label="Delete palette"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
