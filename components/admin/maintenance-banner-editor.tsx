/**
 * Maintenance banner editor — super-admin-only control for the site-wide
 * notice. Reads/writes the `maintenance_banner` key via the admin settings API
 * (server gates writes to super_admin and validates against the schema).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/admin/stat-card";
import {
  MAINTENANCE_BANNER_KEY,
  DEFAULT_BANNER,
  parseBanner,
  type MaintenanceBanner,
} from "@/lib/maintenance-banner";

const inputStyle = {
  background: "var(--fc-bg)",
  color: "var(--fc-text)",
  border: "1px solid var(--fc-border)",
} as const;

/** Labeled switch — same pattern as the admin settings feature-flag toggles. */
function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
        style={{
          background: checked ? "var(--fc-accent)" : "var(--fc-wash)",
          border: `1px solid ${checked ? "var(--fc-accent)" : "var(--fc-border)"}`,
        }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full transition-transform"
          style={{
            background: checked ? "var(--fc-accent-on)" : "var(--fc-text-muted)",
            transform: checked ? "translateX(22px)" : "translateX(4px)",
          }}
        />
      </button>
      <div className="min-w-0">
        <p
          className="text-sm leading-none"
          style={{ color: "var(--fc-text)", margin: 0 }}
        >
          {label}
        </p>
        {description && (
          <p
            className="text-xs mt-1"
            style={{ color: "var(--fc-text-muted)", margin: 0 }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

interface MaintenanceBannerEditorProps {
  /** Seed the form (e.g. from a preset row). Omit to load the live config. */
  initial?: MaintenanceBanner;
  /** Called after a successful save (e.g. return to the list view). */
  onSaved?: (saved: MaintenanceBanner) => void;
  /** When provided, renders a Cancel button alongside Save. */
  onCancel?: () => void;
  /**
   * Library mode: the single Save button upserts a maintenance_banners row
   * (a Name field appears in the form). Pass `slug`/`label` when editing an
   * existing row so it updates in place; omit `slug` to create a new row.
   * Without this prop, Save writes the LIVE config to app_settings.
   */
  library?: { slug?: string; label?: string };
}

export function MaintenanceBannerEditor({
  initial,
  onSaved,
  onCancel,
  library,
}: MaintenanceBannerEditorProps = {}) {
  const [banner, setBanner] = useState<MaintenanceBanner>(
    initial ?? DEFAULT_BANNER,
  );
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryLabel, setLibraryLabel] = useState(library?.label ?? "");

  useEffect(() => {
    if (initial) return; // seeded by the caller — nothing to load
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/settings/${MAINTENANCE_BANNER_KEY}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setBanner(parseBanner(data?.value));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  function patch(next: Partial<MaintenanceBanner>) {
    setBanner((prev) => ({ ...prev, ...next }));
    setStatus(null);
  }


  /**
   * Single save: library mode upserts the maintenance_banners row; live mode
   * writes the active config to app_settings.
   */
  async function save() {
    const label = libraryLabel.trim();
    if (library && !label) {
      setError("Enter a name for this banner");
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      if (library) {
        const res = await fetch("/api/admin/banners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // slug present → update that row in place; absent → create new.
          body: JSON.stringify({ slug: library.slug, label, config: banner }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        setStatus(library.slug ? `Updated "${label}"` : `Saved "${label}"`);
        onSaved?.(banner);
      } else {
        const res = await fetch(`/api/admin/settings/${MAINTENANCE_BANNER_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: banner }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        const saved = parseBanner(data?.value);
        setBanner(saved);
        setStatus("Saved");
        onSaved?.(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <SectionHeading>Maintenance banner</SectionHeading>
      <p className="text-xs mb-3" style={{ color: "var(--fc-text-muted)" }}>
        Site-wide notice shown to every visitor. Use it to signal scheduled
        maintenance or key rotations. Super-admin only.
      </p>

      <div
        className="rounded-md p-4 flex flex-col gap-4"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {/* Name — library mode only; identifies the row in the list. */}
        {library && (
          <label className="block">
            <span
              className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Name
            </span>
            <input
              type="text"
              value={libraryLabel}
              disabled={loading}
              onChange={(e) => setLibraryLabel(e.target.value)}
              placeholder="e.g. Friday deploy window"
              className="w-full px-2.5 py-1.5 rounded outline-none text-sm"
              style={inputStyle}
            />
          </label>
        )}

        {/* Enabled */}
        <Toggle
          label="Enabled"
          description="Visible to all visitors when on"
          checked={banner.enabled}
          disabled={loading}
          onChange={(next) => patch({ enabled: next })}
        />

        {/* Message */}
        <label className="block">
          <span
            className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Message
          </span>
          <textarea
            value={banner.message}
            disabled={loading}
            onChange={(e) => patch({ message: e.target.value })}
            rows={2}
            className="w-full px-2.5 py-1.5 rounded outline-none text-sm resize-y"
            style={inputStyle}
            placeholder="Scheduled maintenance in progress…"
          />
        </label>

        {/* Severity + allow dismiss */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span
              className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Severity
            </span>
            <select
              value={banner.severity}
              disabled={loading}
              onChange={(e) =>
                patch({
                  severity: e.target.value as MaintenanceBanner["severity"],
                })
              }
              className="w-full px-2.5 py-1.5 rounded outline-none text-sm"
              style={inputStyle}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <div className="flex items-end pb-1">
            <Toggle
              label="Allow dismiss"
              description="Visitors can close the banner"
              checked={banner.dismissible}
              disabled={loading}
              onChange={(next) => patch({ dismissible: next })}
            />
          </div>
        </div>

        {/* Optional link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span
              className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Link label (optional)
            </span>
            <input
              type="text"
              value={banner.linkLabel ?? ""}
              disabled={loading}
              onChange={(e) => patch({ linkLabel: e.target.value || undefined })}
              className="w-full px-2.5 py-1.5 rounded outline-none text-sm"
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span
              className="block text-[10px] font-medium mb-1 uppercase tracking-wider"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Link URL (optional)
            </span>
            <input
              type="text"
              value={banner.linkHref ?? ""}
              disabled={loading}
              onChange={(e) => patch({ linkHref: e.target.value || undefined })}
              className="w-full px-2.5 py-1.5 rounded outline-none text-sm"
              style={inputStyle}
              placeholder="https://status.example.com"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: "var(--fc-bg)",
                color: "var(--fc-text)",
                border: "1px solid var(--fc-border)",
              }}
            >
              Cancel
            </button>
          )}
          {status && (
            <span className="text-xs" style={{ color: "var(--fc-text-muted)" }}>
              {status}
            </span>
          )}
          {error && (
            <span className="text-xs" style={{ color: "var(--fc-danger)" }} role="alert">
              {error}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
