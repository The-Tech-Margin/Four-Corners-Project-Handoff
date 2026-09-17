/**
 * Admin Tickets dashboard — list submitted tickets and (super-admin) triage them.
 *
 * Any admin can view the list, screenshots, and diagnostics. Super-admins also
 * get triage controls (status / priority / assignee / resolution) and a comment
 * box; every change is recorded in the ticket's additive event thread, and
 * resolving a ticket deletes its private screenshot.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, ChevronDown } from "lucide-react";
import { StatTile, SectionHeading } from "@/components/admin/stat-card";
import { fetchAdminStatus, getCachedAdminStatus } from "@/lib/admin-status";
import {
  ISSUE_SEVERITY_INFO,
  ISSUE_TYPES,
  ISSUE_TYPE_LABELS,
  type IssueType,
} from "@/lib/issue-schema";
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  type IssueStatus,
} from "@/lib/issue-triage-schema";
import type { InteractionEntry } from "@/lib/interaction-buffer";
import type { NetworkEntry } from "@/lib/network-buffer";

interface IssueRow {
  id: string;
  status: IssueStatus;
  type: string;
  severity: number;
  title: string | null;
  description: string;
  steps: string | null;
  extra: string | null;
  reporter_email: string | null;
  url: string | null;
  route: string | null;
  app_state: Record<string, unknown>;
  device: Record<string, unknown>;
  build: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  user_agent: string | null;
  screenshot_path: string | null;
  screenshotUrl: string | null;
  priority: number | null;
  assignee: string | null;
  resolution: string | null;
  resolved_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

interface TicketEvent {
  id: string;
  author_kind: "reporter" | "admin";
  kind: string;
  body: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

const SEVERITY_ACCENT: Record<number, string> = {
  5: "var(--fc-danger)",
  4: "var(--fc-corner-cc)",
  3: "var(--fc-text-secondary)",
  2: "var(--fc-text-muted)",
  1: "var(--fc-text-faint)",
};

const STATUS_ACCENT: Record<IssueStatus, string> = {
  open: "var(--fc-accent)",
  triaged: "var(--fc-text-secondary)",
  in_progress: "var(--fc-corner-cc)",
  resolved: "var(--fc-success)",
  wont_fix: "var(--fc-text-muted)",
  duplicate: "var(--fc-text-muted)",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "Xs/Xm before report" for buffer timestamps, anchored to ticket creation. */
function beforeReport(ts: number, createdAt: string): string {
  const secs = Math.max(0, Math.round((new Date(createdAt).getTime() - ts) / 1000));
  if (secs < 120) return `${secs}s before`;
  return `${Math.round(secs / 60)}m before`;
}

/** Sort modes encode key + direction explicitly — one menu item per mode. */
type SortMode =
  | "created-desc"
  | "created-asc"
  | "severity-desc"
  | "severity-asc"
  | "priority-desc"
  | "priority-asc"
  | "reporter-asc"
  | "reporter-desc";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
  { value: "severity-desc", label: "Severity (high → low)" },
  { value: "severity-asc", label: "Severity (low → high)" },
  { value: "priority-desc", label: "Priority (high → low)" },
  { value: "priority-asc", label: "Priority (low → high)" },
  { value: "reporter-asc", label: "Reporter (A–Z)" },
  { value: "reporter-desc", label: "Reporter (Z–A)" },
];

const SEVERITY_FILTER_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Any severity" },
  { value: 3, label: "Severity 3+" },
  { value: 4, label: "Severity 4+" },
  { value: 5, label: "Severity 5 only" },
];

export default function AdminIssuesPage() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState<IssueStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [minSeverity, setMinSeverity] = useState(1);
  // "all" | "anon" | a reporter email from the loaded rows
  const [reporterFilter, setReporterFilter] = useState("all");
  const [sort, setSort] = useState<SortMode>("created-desc");
  // Only one toolbar dropdown open at a time
  const [openMenu, setOpenMenu] = useState<"status" | "sort" | "filter" | null>(
    null,
  );
  const [isSuper, setIsSuper] = useState(
    () => getCachedAdminStatus()?.role === "super_admin",
  );

  // Resolve whether the viewer can triage (super-admin). Read-only otherwise.
  // Cached helper: a rate-limited 429 rejects (state kept) instead of
  // silently demoting a super-admin to read-only.
  useEffect(() => {
    let cancelled = false;
    fetchAdminStatus()
      .then((status) => {
        if (!cancelled) setIsSuper(status.role === "super_admin");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/issues");
        const data = await res.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setIssues(data.issues ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const openCount = issues.filter((i) => i.status === "open").length;
  const blockerCount = issues.filter((i) => i.severity >= 4).length;

  // Distinct reporter emails present in the loaded rows, for the filter menu.
  const reporters = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) if (i.reporter_email) set.add(i.reporter_email);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [issues]);
  const hasAnon = useMemo(
    () => issues.some((i) => !i.reporter_email),
    [issues],
  );

  // Filter + sort client-side: the list endpoint returns the whole capped
  // dataset (≤200 newest rows) in one response, so server-side sort params
  // would add API surface with no functional gain until pagination exists.
  const shown = useMemo(() => {
    let rows = filter === "all" ? issues : issues.filter((i) => i.status === filter);
    if (typeFilter !== "all") rows = rows.filter((i) => i.type === typeFilter);
    if (minSeverity > 1) rows = rows.filter((i) => i.severity >= minSeverity);
    if (reporterFilter === "anon") rows = rows.filter((i) => !i.reporter_email);
    else if (reporterFilter !== "all")
      rows = rows.filter((i) => i.reporter_email === reporterFilter);

    const [sortKey, sortDir] = sort.split("-") as [string, "asc" | "desc"];
    const dir = sortDir === "asc" ? 1 : -1;
    const newestFirst = (a: IssueRow, b: IssueRow) =>
      b.created_at.localeCompare(a.created_at);

    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "severity":
          return dir * (a.severity - b.severity) || newestFirst(a, b);
        case "priority":
          return dir * ((a.priority ?? -1) - (b.priority ?? -1)) || newestFirst(a, b);
        case "reporter": {
          // Anonymous reporters sort last regardless of direction.
          const ae = a.reporter_email?.toLowerCase() ?? null;
          const be = b.reporter_email?.toLowerCase() ?? null;
          if (ae === null && be === null) return newestFirst(a, b);
          if (ae === null) return 1;
          if (be === null) return -1;
          return dir * ae.localeCompare(be) || newestFirst(a, b);
        }
        default:
          return dir * a.created_at.localeCompare(b.created_at);
      }
    });
  }, [issues, filter, typeFilter, minSeverity, reporterFilter, sort]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (minSeverity > 1 ? 1 : 0) +
    (reporterFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setTypeFilter("all");
    setMinSeverity(1);
    setReporterFilter("all");
  };

  return (
    <div className="space-y-4">
      <SectionHeading aside={<RefreshButton onClick={refresh} />}>Tickets</SectionHeading>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Total" value={issues.length} />
        <StatTile label="Open" value={openCount} />
        <StatTile
          label="Urgent (sev 4–5)"
          value={blockerCount}
          accent={blockerCount > 0 ? "var(--fc-danger)" : undefined}
        />
      </div>

      {/* Compact toolbar — status / sort / filter dropdowns (gallery pattern) */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Ticket list controls"
      >
        <ToolbarDropdown
          label={`Status: ${filter === "all" ? "All" : ISSUE_STATUS_LABELS[filter]}`}
          ariaLabel={`Filter by status, currently ${filter === "all" ? "all" : ISSUE_STATUS_LABELS[filter]}`}
          open={openMenu === "status"}
          setOpen={(v) => setOpenMenu(v ? "status" : null)}
        >
          <div className="fc-dropdown-menu__header">Status</div>
          {(["all", ...ISSUE_STATUSES] as const).map((s) => (
            <MenuItem
              key={s}
              active={filter === s}
              onClick={() => {
                setFilter(s);
                setOpenMenu(null);
              }}
            >
              {s === "all" ? "All statuses" : ISSUE_STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </ToolbarDropdown>

        <ToolbarDropdown
          label={`Sort: ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Newest first"}`}
          ariaLabel={`Sort tickets, currently ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "newest first"}`}
          open={openMenu === "sort"}
          setOpen={(v) => setOpenMenu(v ? "sort" : null)}
        >
          <div className="fc-dropdown-menu__header">Sort</div>
          {SORT_OPTIONS.map((o) => (
            <MenuItem
              key={o.value}
              active={sort === o.value}
              onClick={() => {
                setSort(o.value);
                setOpenMenu(null);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </ToolbarDropdown>

        <ToolbarDropdown
          label="Filter"
          ariaLabel={
            activeFilterCount > 0
              ? `Filter tickets (${activeFilterCount} active)`
              : "Filter tickets"
          }
          badge={activeFilterCount}
          open={openMenu === "filter"}
          setOpen={(v) => setOpenMenu(v ? "filter" : null)}
        >
          <div className="fc-dropdown-menu__header">Type</div>
          <MenuItem active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All types
          </MenuItem>
          {ISSUE_TYPES.map((t) => (
            <MenuItem
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {ISSUE_TYPE_LABELS[t]}
            </MenuItem>
          ))}
          <div className="fc-dropdown-menu__divider" />
          <div className="fc-dropdown-menu__header">Severity</div>
          {SEVERITY_FILTER_OPTIONS.map((o) => (
            <MenuItem
              key={o.value}
              active={minSeverity === o.value}
              onClick={() => setMinSeverity(o.value)}
            >
              {o.label}
            </MenuItem>
          ))}
          <div className="fc-dropdown-menu__divider" />
          <div className="fc-dropdown-menu__header">Reporter</div>
          <MenuItem
            active={reporterFilter === "all"}
            onClick={() => setReporterFilter("all")}
          >
            All reporters
          </MenuItem>
          {hasAnon && (
            <MenuItem
              active={reporterFilter === "anon"}
              onClick={() => setReporterFilter("anon")}
            >
              Anonymous
            </MenuItem>
          )}
          {reporters.map((email) => (
            <MenuItem
              key={email}
              active={reporterFilter === email}
              onClick={() => setReporterFilter(email)}
            >
              {email}
            </MenuItem>
          ))}
          {activeFilterCount > 0 && (
            <>
              <div className="fc-dropdown-menu__divider" />
              <MenuItem
                active={false}
                onClick={() => {
                  clearFilters();
                  setOpenMenu(null);
                }}
              >
                Clear filters
              </MenuItem>
            </>
          )}
        </ToolbarDropdown>
      </div>

      {loading && <p className="text-sm" style={{ color: "var(--fc-text-muted)" }}>Loading…</p>}
      {error && <p className="text-sm" style={{ color: "var(--fc-danger)" }}>{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="text-sm" style={{ color: "var(--fc-text-muted)" }}>No tickets here.</p>
      )}

      <div className="space-y-2">
        {shown.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            expanded={expanded === issue.id}
            onToggle={() => setExpanded(expanded === issue.id ? null : issue.id)}
            canTriage={isSuper}
            onChanged={refresh}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact toolbar dropdown — the gallery FCViewControls pattern
 * (dashboard-toolbar__view-btn trigger + fc-dropdown-menu popover), plus
 * Escape-to-close. Whenever the menu closes (selection, Escape, backdrop),
 * focus returns to the trigger so keyboard users keep their place.
 */
function ToolbarDropdown({
  label,
  ariaLabel,
  badge,
  open,
  setOpen,
  children,
}: {
  label: string;
  ariaLabel: string;
  badge?: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Restore focus to the trigger on any open → closed transition.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`dashboard-toolbar__view-btn ${open ? "dashboard-toolbar__view-btn--active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{ gap: 3 }}
      >
        <span style={{ fontSize: 12 }}>{label}</span>
        {badge ? (
          <span
            aria-hidden="true"
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1,
              minWidth: 12,
              height: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "var(--fc-accent)",
              color: "var(--fc-bg)",
              marginLeft: 1,
            }}
          >
            {badge}
          </span>
        ) : null}
        <ChevronDown
          size={11}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="fc-dropdown-menu" style={{ left: 0, right: "auto" }}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`fc-dropdown-menu__item ${active ? "fc-dropdown-menu__item--active" : ""}`}
    >
      <span>{children}</span>
      {active && <Check size={12} aria-hidden="true" />}
    </button>
  );
}

function IssueCard({
  issue,
  expanded,
  onToggle,
  canTriage,
  onChanged,
}: {
  issue: IssueRow;
  expanded: boolean;
  onToggle: () => void;
  canTriage: boolean;
  onChanged: () => void;
}) {
  const [events, setEvents] = useState<TicketEvent[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the event thread when expanded (and after a triage action). State is
  // only set after the await, so nothing is set synchronously in the effect.
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/issues/${issue.id}`);
        const data = await res.json();
        if (!cancelled && res.ok) setEvents(data.events ?? []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, reloadKey, issue.id]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--fc-border)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-3 py-2.5 flex items-start gap-3"
      >
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate" style={{ color: "var(--fc-text)" }}>
            {issue.title || issue.description.slice(0, 80) || "(no title)"}
          </span>
          <span className="text-[11px]" style={{ color: "var(--fc-text-muted)" }}>
            {issue.route || "—"} · {issue.reporter_email || "anon"} · {relativeTime(issue.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge>{issue.type}</Badge>
          <Badge accent={SEVERITY_ACCENT[issue.severity]}>
            {ISSUE_SEVERITY_INFO[issue.severity]?.label ?? `S${issue.severity}`}
          </Badge>
          {issue.priority !== null && issue.priority > 0 && (
            <Badge>P: {ISSUE_PRIORITY_LABELS[issue.priority]}</Badge>
          )}
          <Badge accent={STATUS_ACCENT[issue.status]}>{ISSUE_STATUS_LABELS[issue.status]}</Badge>
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-3 space-y-3 text-xs" style={{ borderTop: "1px solid var(--fc-border)" }}>
          {/* Labels mirror the reporter form questions */}
          <Field label="Trying to do">{issue.description}</Field>
          {issue.steps && <Field label="Entered / clicked">{issue.steps}</Field>}
          {issue.extra && <Field label="Link / extra">{issue.extra}</Field>}
          {issue.url && <Field label="URL">{issue.url}</Field>}

          {issue.screenshotUrl && (
            <div className="space-y-1">
              <FieldLabel>Screenshot</FieldLabel>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={issue.screenshotUrl}
                alt="Ticket screenshot"
                className="rounded-md max-h-72 w-auto"
                style={{ border: "1px solid var(--fc-border)" }}
              />
            </div>
          )}

          <RecentActivity issue={issue} />

          {events && events.length > 0 && <EventThread events={events} />}

          {canTriage && (
            <TriagePanel
              issue={issue}
              onChanged={() => {
                setReloadKey((k) => k + 1);
                onChanged();
              }}
            />
          )}

          <details>
            <summary className="cursor-pointer" style={{ color: "var(--fc-text-secondary)" }}>
              Context (app state · device · build · diagnostics)
            </summary>
            <pre
              className="mt-1.5 overflow-auto max-h-72 whitespace-pre-wrap break-words rounded p-2"
              style={{
                color: "var(--fc-text-muted)",
                background: "var(--fc-surface)",
                fontFamily: "var(--font-geist-mono), monospace",
              }}
            >
              {JSON.stringify(
                {
                  app_state: issue.app_state,
                  device: issue.device,
                  build: issue.build,
                  diagnostics: issue.diagnostics,
                  user_agent: issue.user_agent,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * Formatted view of the captured interaction/network buffers — the user's
 * last actions and failed requests leading up to the report. Older tickets
 * predate these buffers, so everything guards on presence.
 */
function RecentActivity({ issue }: { issue: IssueRow }) {
  const diag = issue.diagnostics ?? {};
  const interactions = (
    Array.isArray(diag.interactions) ? diag.interactions : []
  ) as InteractionEntry[];
  const network = (
    Array.isArray(diag.network) ? diag.network : []
  ) as NetworkEntry[];
  if (interactions.length === 0 && network.length === 0) return null;

  const describe = (e: InteractionEntry): string => {
    if (e.kind === "nav") return `→ ${e.route ?? "?"}`;
    const what = e.label || e.field?.name || e.target || "?";
    if (e.kind === "input") return `changed ${what}`;
    if (e.kind === "submit") return `submitted ${what}`;
    return `clicked ${what}`;
  };

  return (
    <div className="space-y-2">
      {interactions.length > 0 && (
        <div className="space-y-1">
          <FieldLabel>Last actions</FieldLabel>
          <ul
            aria-label="Reporter's last actions before the report"
            className="rounded p-2 space-y-0.5 max-h-48 overflow-auto list-none m-0"
            style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}
          >
            {interactions.slice(-15).map((e, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="shrink-0 tabular-nums" style={{ color: "var(--fc-text-muted)" }}>
                  {typeof e.ts === "number" ? beforeReport(e.ts, issue.created_at) : "—"}
                </span>
                <span className="truncate" style={{ color: "var(--fc-text-secondary)" }}>
                  {describe(e)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {network.length > 0 && (
        <div className="space-y-1">
          <FieldLabel>Failed requests</FieldLabel>
          <ul
            aria-label="Failed network requests before the report"
            className="rounded p-2 space-y-0.5 max-h-32 overflow-auto list-none m-0"
            style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}
          >
            {network.slice(-10).map((e, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="shrink-0 font-semibold" style={{ color: "var(--fc-danger)" }}>
                  {e.status ?? "ERR"}
                </span>
                <span className="truncate" style={{ color: "var(--fc-text-secondary)" }}>
                  {e.method} {e.url} ({e.durationMs}ms){e.error ? ` — ${e.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EventThread({ events }: { events: TicketEvent[] }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>Activity</FieldLabel>
      <div className="space-y-1.5">
        {events.map((e) => (
          <div key={e.id} className="rounded p-2" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}>
            <div className="text-[10px] mb-0.5" style={{ color: "var(--fc-text-muted)" }}>
              {e.author_kind === "admin" ? "Team" : "Reporter"} · {relativeTime(e.created_at)}
            </div>
            {e.kind === "comment" ? (
              <p className="whitespace-pre-wrap break-words" style={{ color: "var(--fc-text)" }}>{e.body}</p>
            ) : (
              e.changes && (
                <p style={{ color: "var(--fc-text-secondary)" }}>
                  {Object.entries(e.changes).map(([f, c]) => (
                    <span key={f}>{f}: {String(c.from ?? "—")} → {String(c.to ?? "—")}</span>
                  ))}
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TriagePanel({ issue, onChanged }: { issue: IssueRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [comment, setComment] = useState("");

  const inputStyle = {
    background: "var(--fc-surface)",
    border: "1px solid var(--fc-border)",
    color: "var(--fc-text)",
  } as const;

  const patch = useCallback(
    async (payload: Record<string, unknown>, successMsg: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/issues/${issue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast.success(successMsg);
        setComment("");
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Triage failed");
      } finally {
        setBusy(false);
      }
    },
    [issue.id, onChanged],
  );

  return (
    <div className="space-y-2 rounded-lg p-3" style={{ border: "1px solid var(--fc-accent)" }}>
      <FieldLabel>Triage</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--fc-text-secondary)" }}>
          Status
          <select
            value={issue.status}
            disabled={busy}
            onChange={(e) => patch({ status: e.target.value }, "Status updated")}
            className="rounded px-2 py-1 text-xs"
            style={inputStyle}
          >
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--fc-text-secondary)" }}>
          Type
          <select
            value={issue.type}
            disabled={busy}
            onChange={(e) => patch({ type: e.target.value }, "Type updated")}
            className="rounded px-2 py-1 text-xs"
            style={inputStyle}
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--fc-text-secondary)" }}>
          Priority
          <select
            value={issue.priority ?? 0}
            disabled={busy}
            onChange={(e) => patch({ priority: Number(e.target.value) }, "Priority updated")}
            className="rounded px-2 py-1 text-xs"
            style={inputStyle}
          >
            {ISSUE_PRIORITIES.map((p) => (
              <option key={p} value={p}>{ISSUE_PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ assignee: issue.assignee ? null : "me" }, issue.assignee ? "Unassigned" : "Assigned to you")}
          className="text-[11px] px-2 py-1 rounded disabled:opacity-50"
          style={inputStyle}
        >
          {issue.assignee ? "Unassign" : "Assign to me"}
        </button>
      </div>

      <div className="flex gap-2 items-end">
        <textarea
          aria-label="Resolution note"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={1}
          placeholder="Resolution note…"
          className="flex-1 rounded px-2 py-1 text-xs resize-y"
          style={inputStyle}
        />
        <button
          type="button"
          disabled={busy || resolution.trim() === (issue.resolution ?? "")}
          onClick={() => patch({ resolution: resolution.trim() || null }, "Resolution saved")}
          className="text-[11px] px-2 py-1 rounded disabled:opacity-50"
          style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
        >
          Save
        </button>
      </div>

      <div className="flex gap-2 items-end">
        <textarea
          aria-label="Internal comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={1}
          placeholder="Add an internal comment…"
          className="flex-1 rounded px-2 py-1 text-xs resize-y"
          style={inputStyle}
        />
        <button
          type="button"
          disabled={busy || !comment.trim()}
          onClick={() => patch({ comment: comment.trim() }, "Comment added")}
          className="text-[11px] px-2 py-1 rounded disabled:opacity-50"
          style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
        >
          Comment
        </button>
      </div>
    </div>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2 py-1 rounded transition-colors"
      style={{ color: "var(--fc-text-secondary)", border: "1px solid var(--fc-border)" }}
    >
      Refresh
    </button>
  );
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        color: accent ?? "var(--fc-text-muted)",
        border: `1px solid ${accent ?? "var(--fc-border)"}`,
      }}
    >
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--fc-text-muted)" }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <FieldLabel>{label}</FieldLabel>
      <p className="whitespace-pre-wrap break-words" style={{ color: "var(--fc-text)" }}>
        {children}
      </p>
    </div>
  );
}
