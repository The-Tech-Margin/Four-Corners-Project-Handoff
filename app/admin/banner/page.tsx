/**
 * Admin Banner — site-wide maintenance banner management (super-admin only).
 *
 * List ↔ edit state machine. The list is the maintenance_banners table only
 * (no code-defined fallback — populate with scripts/seed-maintenance-banners.ts)
 * rendered with the shared dashboard fc-list styling (fc-list--admin variant).
 * Full CRUD: create (New banner), update (Edit → Update in library), delete
 * (custom rows; presets protected), plus one-click Activate which writes the
 * live config to app_settings via the settings API.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useEffect, useState } from "react";
import { Power, Pencil, Trash2, Plus, Globe, Lock } from "lucide-react";
import { useAccess } from "@/components/access-provider";
import { MaintenanceBannerEditor } from "@/components/admin/maintenance-banner-editor";
import { SeverityIcon } from "@/components/maintenance-banner";
import { SectionHeading } from "@/components/admin/stat-card";
import {
  MAINTENANCE_BANNER_KEY,
  DEFAULT_BANNER,
  parseBanner,
  type MaintenanceBanner,
} from "@/lib/maintenance-banner";

type View = "list" | "edit";

/** Row from the maintenance_banners library (see /api/admin/banners). */
interface LibraryBanner {
  slug: string;
  label: string;
  config: MaintenanceBanner;
  is_preset: boolean;
}

/** What the editor is working on: a library row, a copy, or the live config. */
interface EditTarget {
  config: MaintenanceBanner;
  /** Set when updating an existing library row in place. */
  slug?: string;
  label?: string;
  /** Live-config edit (from the Current banner card) — no library save UI. */
  liveOnly?: boolean;
}

export default function AdminBannerPage() {
  const { isSuperAdmin } = useAccess();
  const [view, setView] = useState<View>("list");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [live, setLive] = useState<MaintenanceBanner | null>(null);
  const [library, setLibrary] = useState<LibraryBanner[] | null>(null);
  const [pendingMigration, setPendingMigration] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState(false);

  // Load the live config + the library whenever we (re-)enter list view.
  useEffect(() => {
    if (view !== "list") return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/settings/${MAINTENANCE_BANNER_KEY}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/admin/banners").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([liveData, libData]) => {
        if (cancelled) return;
        setLive(parseBanner(liveData?.value));
        const rows = Array.isArray(libData?.banners) ? libData.banners : [];
        setLibrary(
          rows.map(
            (b: { slug: string; label: string; config: unknown; is_preset: boolean }) => ({
              slug: String(b.slug),
              label: String(b.label),
              config: parseBanner(b.config),
              is_preset: !!b.is_preset,
            }),
          ),
        );
        setPendingMigration(!!libData?.pendingMigration);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [view, refreshKey]);

  async function activate(row: LibraryBanner) {
    setBusySlug(row.slug);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/settings/${MAINTENANCE_BANNER_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { ...row.config, enabled: true } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Activate failed");
    } finally {
      setBusySlug(null);
    }
  }

  async function deleteFromLibrary(slug: string) {
    setBusySlug(slug);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/banners?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setLibrary((prev) => (prev ?? []).filter((b) => b.slug !== slug));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusySlug(null);
    }
  }

  async function turnOff() {
    if (!live) return;
    setTurningOff(true);
    try {
      const res = await fetch(`/api/admin/settings/${MAINTENANCE_BANNER_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { ...live, enabled: false } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setTurningOff(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <h2
          className="text-base font-semibold mb-4"
          style={{ color: "var(--fc-text)" }}
        >
          Maintenance Banner
        </h2>
        <p className="text-sm" style={{ color: "var(--fc-text-muted)" }}>
          Managing the site-wide banner requires the super admin role.
        </p>
      </div>
    );
  }

  if (view === "edit" && editTarget) {
    return (
      <div>
        <h2
          className="text-base font-semibold mb-4"
          style={{ color: "var(--fc-text)" }}
        >
          {editTarget.slug
            ? `Edit “${editTarget.label}”`
            : editTarget.liveOnly
              ? "Edit live banner"
              : "New banner"}
        </h2>
        <MaintenanceBannerEditor
          initial={editTarget.config}
          library={
            editTarget.liveOnly
              ? undefined
              : { slug: editTarget.slug, label: editTarget.label }
          }
          onSaved={() => {
            setView("list");
            setEditTarget(null);
            setRefreshKey((k) => k + 1);
          }}
          onCancel={() => {
            setView("list");
            setEditTarget(null);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <h2
        className="text-base font-semibold mb-4"
        style={{ color: "var(--fc-text)" }}
      >
        Maintenance Banner
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--fc-text-muted)" }}>
        Site-wide notice shown to every visitor — use it to signal scheduled
        maintenance, security updates, or incidents.
      </p>

      {loadError && (
        <p className="text-xs mb-3" style={{ color: "var(--fc-danger)" }} role="alert">
          {loadError}
        </p>
      )}

      <SectionHeading>Current banner</SectionHeading>
      <div className="fc-list fc-list--admin mb-6">
        <div className="fc-list__body" role="list">
          {live ? (
            <div role="listitem" className="fc-list__row">
              <div className="fc-list__cell" title={`Severity: ${live.severity}`}>
                <SeverityIcon severity={live.severity} />
              </div>
              {/* The banner's own text is the row title — the Active/Off
                  badge carries the state. */}
              <div className="fc-list__cell fc-list__cell--title">
                <span className="fc-list__title">
                  {live.message
                    ? live.message.length > 100
                      ? `${live.message.slice(0, 100)}...`
                      : live.message
                    : "(no message set)"}
                </span>
                {live.linkLabel && live.linkHref && (
                  <span className="fc-list__description">
                    Link: {live.linkLabel} → {live.linkHref}
                  </span>
                )}
              </div>
              <div className="fc-list__cell fc-list__cell--metadata">
                {live.enabled ? (
                  <span
                    className="fc-list__badge fc-list__badge--public"
                    title="Visible to all visitors"
                  >
                    <Globe size={12} /> Active
                  </span>
                ) : (
                  <span className="fc-list__badge fc-list__badge--private" title="Hidden">
                    <Lock size={12} /> Off
                  </span>
                )}
              </div>
              <div className="fc-list__cell fc-list__cell--actions">
                <button
                  onClick={() => {
                    setEditTarget({ config: live, liveOnly: true });
                    setView("edit");
                  }}
                  className="fc-list__action fc-list__action--edit"
                  aria-label="Edit live banner"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                {live.enabled && (
                  <button
                    onClick={turnOff}
                    disabled={turningOff}
                    className="fc-list__action fc-list__action--delete"
                    aria-label="Turn off banner"
                    title="Turn off"
                  >
                    {turningOff ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Power size={16} />
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs px-4 py-3" style={{ color: "var(--fc-text-muted)", margin: 0 }}>
              Loading…
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <SectionHeading>Banner library</SectionHeading>
        <button
          type="button"
          onClick={() => {
            setEditTarget({ config: { ...DEFAULT_BANNER }, label: "" });
            setView("edit");
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all active:scale-95"
          style={{
            background: "var(--fc-accent)",
            color: "var(--fc-accent-on)",
          }}
        >
          <Plus size={14} />
          New banner
        </button>
      </div>

      {/* Library — shared dashboard list styling (fc-list--admin variant). */}
      <div className="fc-list fc-list--admin">
        <div className="fc-list__header">
          <div className="fc-list__header-cell" />
          <div className="fc-list__header-cell">Name / Message</div>
          <div className="fc-list__header-cell">Tags</div>
          <div className="fc-list__header-cell">Actions</div>
        </div>
        <div className="fc-list__body" role="list">
          {library === null ? (
            <p className="text-xs px-4 py-3" style={{ color: "var(--fc-text-muted)" }}>
              Loading…
            </p>
          ) : library.length === 0 ? (
            <p className="text-xs px-4 py-3" style={{ color: "var(--fc-text-muted)" }}>
              {pendingMigration
                ? "The maintenance_banners table hasn't been migrated yet (054). After migrating, populate it with: npx tsx scripts/seed-maintenance-banners.ts"
                : "No banners in the library. Populate the presets with: npx tsx scripts/seed-maintenance-banners.ts — or create one with New banner."}
            </p>
          ) : (
            library.map((b) => {
              const busy = busySlug === b.slug;
              return (
                <div key={b.slug} role="listitem" className="fc-list__row">
                  <div className="fc-list__cell" title={`Severity: ${b.config.severity}`}>
                    <SeverityIcon severity={b.config.severity} />
                  </div>
                  <div className="fc-list__cell fc-list__cell--title">
                    <span className="fc-list__title">{b.label}</span>
                    {b.config.message && (
                      <span className="fc-list__description">
                        {b.config.message.length > 80
                          ? `${b.config.message.slice(0, 80)}...`
                          : b.config.message}
                      </span>
                    )}
                  </div>
                  <div className="fc-list__cell fc-list__cell--metadata">
                    <span className="fc-list__chip">
                      {b.is_preset ? "Preset" : "Custom"}
                    </span>
                    <span className="fc-list__chip">
                      {b.config.dismissible ? "Dismissible" : "Persistent"}
                    </span>
                  </div>
                  <div className="fc-list__cell fc-list__cell--actions">
                    <button
                      onClick={() => activate(b)}
                      disabled={busy}
                      className="fc-list__action fc-list__action--view"
                      aria-label={`Turn on ${b.label}`}
                      title="Turn on"
                    >
                      <Power size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setEditTarget({
                          config: { ...b.config },
                          slug: b.slug,
                          label: b.label,
                        });
                        setView("edit");
                      }}
                      disabled={busy}
                      className="fc-list__action fc-list__action--edit"
                      aria-label={`Edit ${b.label}`}
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => deleteFromLibrary(b.slug)}
                      disabled={busy}
                      className="fc-list__action fc-list__action--delete"
                      aria-label={`Delete ${b.label}`}
                      title="Delete"
                    >
                      {busy ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
