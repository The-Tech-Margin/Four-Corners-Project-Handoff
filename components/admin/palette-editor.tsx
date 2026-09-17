/**
 * Palette editor — preset picker, variable editor, color wheel popovers,
 * accent harmony picker, WCAG a11y pill, preview modal.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Download, Eye, Moon, Sun, X } from "lucide-react";
import { downloadPalette } from "@/lib/palette-io";
import { FC_VARIABLE_GROUPS } from "@/lib/persona";
import { PALETTE_PRESETS } from "@/lib/palette-presets";
import { inverseLightness, isValidHex } from "@/lib/color-utils";
import type { PersonaPalette } from "@/lib/persona";
import { ColorWheelPopover } from "./color-wheel-popover";
import { A11yPill } from "./a11y-pill";
import { PalettePreviewModal } from "./palette-preview-modal";
import { InfoTooltip } from "@/components/info-tooltip";

interface Props {
  palette?: PersonaPalette | null;
  onSave: () => void;
  onCancel: () => void;
}

type Mode = "dark" | "light";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const CORNER_KEYS = [
  "--fc-corner-backstory",
  "--fc-corner-context",
  "--fc-corner-links",
  "--fc-corner-cc",
];

interface SaveErrorBody {
  error?: string;
}

interface WheelState {
  key: string;
  anchorRect: DOMRect | null;
  /** When true, applying a harmony scheme bulk-fills accent + corners in both modes. */
  bulkAccent: boolean;
}

export function PaletteEditor({ palette, onSave, onCancel }: Props) {
  const [name, setName] = useState(palette?.name || "");
  const [slug, setSlug] = useState(palette?.slug || "");
  const [autoSlug, setAutoSlug] = useState(!palette);
  const [darkOverrides, setDarkOverrides] = useState<Record<string, string>>(
    palette?.dark_overrides || {},
  );
  const [lightOverrides, setLightOverrides] = useState<Record<string, string>>(
    palette?.light_overrides || {},
  );
  const [mode, setMode] = useState<Mode>("dark");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [uniformCorners, setUniformCorners] = useState(false);
  const [wheel, setWheel] = useState<WheelState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Buttons that trigger the wheel — so we can get anchor rects
  const swatchRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const overrides = mode === "dark" ? darkOverrides : lightOverrides;
  const setOverrides = mode === "dark" ? setDarkOverrides : setLightOverrides;

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setName(val);
      if (autoSlug) setSlug(slugify(val));
    },
    [autoSlug],
  );

  const handleSlugChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setAutoSlug(false);
    setSlug(e.target.value);
  }, []);

  const setVar = useCallback(
    (key: string, value: string) => {
      setActivePreset(null);
      if (uniformCorners && CORNER_KEYS.includes(key)) {
        setOverrides((prev) => {
          const next = { ...prev };
          for (const ck of CORNER_KEYS) next[ck] = value;
          return next;
        });
      } else {
        setOverrides((prev) => ({ ...prev, [key]: value }));
      }
    },
    [uniformCorners, setOverrides],
  );

  const clearVar = useCallback(
    (key: string) => {
      setActivePreset(null);
      if (uniformCorners && CORNER_KEYS.includes(key)) {
        setOverrides((prev) => {
          const next = { ...prev };
          for (const ck of CORNER_KEYS) delete next[ck];
          return next;
        });
      } else {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [uniformCorners, setOverrides],
  );

  const applyPreset = useCallback((presetId: string) => {
    const preset = PALETTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDarkOverrides({ ...preset.dark });
    setLightOverrides({ ...preset.light });
    setActivePreset(presetId);
  }, []);

  const clearAll = useCallback(() => {
    setDarkOverrides({});
    setLightOverrides({});
    setActivePreset(null);
  }, []);

  const openWheel = useCallback(
    (key: string, e: ReactMouseEvent<HTMLButtonElement>, bulkAccent = false) => {
      e.stopPropagation();
      const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setWheel({ key, anchorRect, bulkAccent });
    },
    [],
  );

  const closeWheel = useCallback(() => setWheel(null), []);

  const handleWheelChange = useCallback(
    (hex: string) => {
      if (!wheel) return;
      setVar(wheel.key, hex);
    },
    [wheel, setVar],
  );

  /**
   * When "Apply scheme" is clicked on the accent wheel, fill accent + corners
   * in BOTH modes (with inverted lightness for the other mode).
   */
  const handleApplyAccentScheme = useCallback(
    (colors: string[]) => {
      if (colors.length === 0) return;
      const [accent, ...rest] = colors;
      const corners: string[] = [];
      while (corners.length < 4) corners.push(rest[corners.length % rest.length] ?? accent);

      const fill = (targetMode: Mode) => {
        const isBaseMode = targetMode === mode;
        const map = (c: string) => (isBaseMode ? c : inverseLightness(c));
        const patch: Record<string, string> = {
          "--fc-accent": map(accent),
          "--fc-corner-backstory": map(corners[0]),
          "--fc-corner-context": map(corners[1]),
          "--fc-corner-links": map(corners[2]),
          "--fc-corner-cc": map(corners[3]),
        };
        if (targetMode === "dark") {
          setDarkOverrides((prev) => ({ ...prev, ...patch }));
        } else {
          setLightOverrides((prev) => ({ ...prev, ...patch }));
        }
      };

      fill("dark");
      fill("light");
      setActivePreset(null);
      setWheel(null);
    },
    [mode],
  );

  const handleSave = useCallback(async () => {
    if (!name || !slug) {
      setError("Name and slug are required");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const isEdit = !!palette;
      const url = isEdit
        ? `/api/admin/palettes/${palette.slug}`
        : "/api/admin/palettes";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          dark_overrides: darkOverrides,
          light_overrides: lightOverrides,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as SaveErrorBody;
        setError(data.error || "Save failed");
        return;
      }

      onSave();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [name, slug, palette, darkOverrides, lightOverrides, onSave]);

  const overrideCount =
    Object.keys(darkOverrides).length + Object.keys(lightOverrides).length;

  const inputStyle = {
    background: "var(--fc-bg)",
    color: "var(--fc-text)",
    border: "1px solid var(--fc-border)",
  } as const;

  const accentSwatch = overrides["--fc-accent"] || "#84cc16";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {palette ? palette.name : "New Palette"}
          </h2>
          {palette && (
            <p
              className="text-[11px] font-mono mt-0.5"
              style={{ color: "var(--fc-text-muted)" }}
            >
              {palette.slug}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <A11yPill overrides={overrides} />
          <InfoTooltip
            size="sm"
            accentColor="corner-cc"
            title="WCAG contrast"
            content="Checks key color pairs for WCAG AA/AAA compliance. Ratios of 4.5+ pass for body text, 3.0+ pass for large text and UI elements."
          />
          <span
            className="text-[11px]"
            style={{ color: "var(--fc-text-faint)" }}
          >
            {overrideCount} override{overrideCount !== 1 ? "s" : ""}
          </span>
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] px-2 py-1 rounded"
              style={{
                color: "var(--fc-danger)",
                border: "1px solid var(--fc-border)",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Name + slug */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span
            className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="Reuters"
            className="w-full px-2.5 py-1.5 rounded outline-none text-xs"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span
            className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Slug
          </span>
          <input
            type="text"
            value={slug}
            onChange={handleSlugChange}
            placeholder="reuters"
            disabled={!!palette}
            className="w-full px-2.5 py-1.5 rounded outline-none font-mono text-xs disabled:opacity-50"
            style={inputStyle}
          />
        </label>
      </div>

      {/* Presets */}
      <section>
        <h3
          className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "var(--fc-text-muted)" }}
        >
          Start from a preset
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {PALETTE_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="px-2.5 py-2 rounded-md text-left transition-colors"
                style={{
                  background: isActive
                    ? "color-mix(in srgb, var(--fc-accent) 12%, transparent)"
                    : "var(--fc-surface)",
                  border: isActive
                    ? "1px solid var(--fc-accent)"
                    : "1px solid var(--fc-border)",
                }}
              >
                <div className="flex gap-1 mb-1.5">
                  {preset.swatches.map((sw, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded-full inline-block"
                      style={{
                        background: sw,
                        border: "1px solid rgba(128,128,128,0.25)",
                      }}
                    />
                  ))}
                </div>
                <div
                  className="text-[11px] font-medium leading-tight truncate"
                  style={{ color: "var(--fc-text)" }}
                >
                  {preset.name}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Accent harmony picker */}
      <section>
        <div className="flex items-center gap-1.5 mb-1.5">
          <h3
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Accent &amp; Corners
          </h3>
          <InfoTooltip
            size="sm"
            accentColor="corner-links"
            title="Harmony schemes"
            content="Pick an accent color, then choose complementary, triad, or tetrad. Clicking 'Apply scheme' fills the accent and all four corners in both dark and light modes — light mode gets inverse lightness for accessibility."
          />
        </div>
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          <button
            ref={(el) => {
              swatchRefs.current["__accent-picker__"] = el;
            }}
            type="button"
            onClick={(e) => openWheel("--fc-accent", e, true)}
            className="w-10 h-10 rounded shrink-0"
            style={{
              background: accentSwatch,
              border: "1px solid var(--fc-border)",
            }}
            aria-label="Pick accent color and apply harmony scheme"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11px]" style={{ color: "var(--fc-text)" }}>
              Pick an accent, choose a harmony scheme, then click{" "}
              <strong>Apply scheme</strong> in the popover to auto-fill the
              accent and four corners in both dark and light modes.
            </p>
            <p
              className="text-[10px] mt-0.5"
              style={{ color: "var(--fc-text-faint)" }}
            >
              Light mode gets inverse lightness for accessibility.
            </p>
          </div>
        </div>
      </section>

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
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors"
              style={{
                background: isActive ? "var(--fc-accent)" : "transparent",
                color: isActive ? "var(--fc-accent-on)" : "var(--fc-text)",
              }}
              aria-pressed={isActive}
            >
              <Icon size={11} />
              {m}
            </button>
          );
        })}
      </div>

      {/* Variable groups */}
      <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1 -mr-1">
        {FC_VARIABLE_GROUPS.map((group) => (
          <section key={group.label}>
            <div className="flex items-center gap-3 mb-1.5">
              <h3
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--fc-text-muted)" }}
              >
                {group.label}
              </h3>
              {group.label === "Corners" && (
                <div className="flex items-center gap-1 ml-auto">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uniformCorners}
                      onChange={(e) => setUniformCorners(e.target.checked)}
                      className="accent-[var(--fc-accent)] w-3 h-3"
                    />
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      Same colour
                    </span>
                  </label>
                  <InfoTooltip
                    size="sm"
                    accentColor="corner-backstory"
                    title="Uniform corners"
                    content="When enabled, editing any corner color applies it to all four corners at once (backstory, context, links, CC)."
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {group.vars.map((v) => {
                const value = overrides[v.key] || "";
                const hasValue = !!value;
                const displayValue = value || "#000000";
                const canUseWheel = !value || isValidHex(value);
                return (
                  <div
                    key={v.key}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded"
                    style={{
                      background: "var(--fc-surface)",
                      border: "1px solid var(--fc-border)",
                    }}
                  >
                    <label
                      className="flex-1 text-[11px] truncate"
                      title={v.key}
                      style={{
                        color: hasValue
                          ? "var(--fc-text)"
                          : "var(--fc-text-muted)",
                      }}
                    >
                      {v.label}
                    </label>
                    {canUseWheel ? (
                      <button
                        ref={(el) => {
                          swatchRefs.current[v.key] = el;
                        }}
                        type="button"
                        onClick={(e) => openWheel(v.key, e)}
                        className="w-6 h-6 rounded cursor-pointer shrink-0"
                        style={{
                          background: displayValue,
                          border: "1px solid var(--fc-border)",
                        }}
                        aria-label={`Pick ${v.label} color`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setVar(v.key, e.target.value)}
                        className="w-20 px-1 py-0.5 rounded text-[10px] font-mono outline-none"
                        style={inputStyle}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => clearVar(v.key)}
                      disabled={!hasValue}
                      className="fc-list__action fc-list__action--delete shrink-0 disabled:opacity-30"
                      aria-label={`Clear ${v.label} override`}
                      style={{ padding: "4px" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      )}

      {/* Footer actions */}
      <div
        className="flex gap-2 pt-3 flex-wrap"
        style={{ borderTop: "1px solid var(--fc-border-subtle)" }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded font-medium text-xs disabled:opacity-50"
          style={{
            background: "var(--fc-accent)",
            color: "var(--fc-accent-on)",
          }}
        >
          {saving ? "Saving..." : "Save Palette"}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs"
          style={{
            background: "var(--fc-wash)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
        >
          <Eye size={12} />
          Preview
        </button>
        <button
          type="button"
          onClick={() =>
            downloadPalette({
              name: name || "palette",
              slug: slug || "palette",
              dark_overrides: darkOverrides,
              light_overrides: lightOverrides,
            })
          }
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs"
          style={{
            background: "var(--fc-wash)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
          aria-label="Export palette as JSON"
        >
          <Download size={12} />
          Export
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs"
          style={{
            color: "var(--fc-text-muted)",
            border: "1px solid var(--fc-border)",
          }}
        >
          Cancel
        </button>
      </div>

      {/* Color wheel popover */}
      {wheel && (
        <ColorWheelPopover
          value={overrides[wheel.key] || "#84cc16"}
          onChange={handleWheelChange}
          onApplyScheme={
            wheel.bulkAccent ? handleApplyAccentScheme : undefined
          }
          onClose={closeWheel}
          anchorRect={wheel.anchorRect}
        />
      )}

      {/* Preview modal */}
      {previewOpen && (
        <PalettePreviewModal
          darkOverrides={darkOverrides}
          lightOverrides={lightOverrides}
          onClose={() => setPreviewOpen(false)}
          onPatch={(patchMode, key, value) => {
            setActivePreset(null);
            if (patchMode === "dark") {
              setDarkOverrides((prev) => ({ ...prev, [key]: value }));
            } else {
              setLightOverrides((prev) => ({ ...prev, [key]: value }));
            }
          }}
        />
      )}
    </div>
  );
}
