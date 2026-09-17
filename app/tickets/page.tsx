/**
 * /tickets — a signed-in user's own issue tickets.
 *
 * Lists the tickets the user has filed, with an expandable detail showing the
 * additive event thread (comments + changes), a comment box, and an editor for
 * their user-facing fields. Inherits the app theme via --fc-* / fc-view-*.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppHeader } from "@/components/app-header";
import { VoiceTextarea } from "@/components/voice-textarea";
import {
  ISSUE_TYPES,
  ISSUE_SEVERITY_LEVELS,
  ISSUE_TYPE_LABELS,
  ISSUE_SEVERITY_INFO,
  type IssueType,
  type IssueSeverity,
} from "@/lib/issue-schema";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/issue-triage-schema";

interface TicketRow {
  id: string;
  status: IssueStatus;
  type: IssueType;
  severity: IssueSeverity;
  title: string | null;
  description: string;
  route: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketEvent {
  id: string;
  author_kind: "reporter" | "admin";
  kind: string;
  body: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

interface TicketDetail {
  issue: TicketRow & { steps: string | null };
  events: TicketEvent[];
}

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

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState<"loading" | "signedout" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/issues");
      if (res.status === 401) {
        setStatus("signedout");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setTickets(data.tickets ?? []);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <AppHeader />
      <div className="h-14 sm:h-16" />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold fc-view-heading mb-2 leading-tight">
          My tickets
        </h1>
        <p className="fc-view-subtext text-sm mb-8 leading-relaxed">
          Issues you&rsquo;ve filed. Open one to follow its progress, add a
          comment, or update the details.
        </p>

        {status === "loading" && (
          <p className="fc-view-subtext text-sm">Loading…</p>
        )}
        {status === "error" && (
          <p className="text-sm" style={{ color: "var(--fc-danger)" }}>
            {error}
          </p>
        )}
        {status === "signedout" && (
          <p className="fc-view-subtext text-sm">
            Sign in to view the tickets you&rsquo;ve filed.
          </p>
        )}
        {status === "ready" && tickets.length === 0 && (
          <p className="fc-view-subtext text-sm">
            You haven&rsquo;t filed any tickets yet. Use “Report an issue” from
            the menu or press Shift+I.
          </p>
        )}

        <div className="space-y-2">
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onChanged={load}
            />
          ))}
        </div>
      </main>
    </div>
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

function TicketCard({
  ticket,
  expanded,
  onToggle,
  onChanged,
}: {
  ticket: TicketRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Fetch detail when expanded (and after a comment/edit). State is only set
  // after the await, so nothing is set synchronously in the effect body.
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/issues/${ticket.id}`);
        const data = await res.json();
        if (!cancelled && res.ok) setDetail(data);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, reloadKey, ticket.id]);

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
            {ticket.title || ticket.description.slice(0, 80) || "(untitled)"}
          </span>
          <span className="text-[11px]" style={{ color: "var(--fc-text-muted)" }}>
            {ticket.route || "—"} · filed {relativeTime(ticket.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge>{ISSUE_TYPE_LABELS[ticket.type]}</Badge>
          <Badge accent={STATUS_ACCENT[ticket.status]}>
            {ISSUE_STATUS_LABELS[ticket.status]}
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-3 space-y-4 text-xs" style={{ borderTop: "1px solid var(--fc-border)" }}>
          {!detail && <p style={{ color: "var(--fc-text-muted)" }}>Loading…</p>}
          {detail && (
            <>
              <EventThread events={detail.events} description={detail.issue.description} createdAt={detail.issue.created_at} />
              <CommentBox ticketId={ticket.id} onPosted={() => { reload(); onChanged(); }} />
              <EditDetails
                ticket={detail.issue}
                onSaved={() => { reload(); onChanged(); }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function fieldLabel(f: string): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function EventThread({
  events,
  description,
  createdAt,
}: {
  events: TicketEvent[];
  description: string;
  createdAt: string;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--fc-text-muted)" }}>
        Activity
      </span>
      <div className="space-y-2">
        {/* Original report */}
        <div className="rounded p-2" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--fc-text-muted)" }}>
            You filed this · {relativeTime(createdAt)}
          </div>
          <p className="whitespace-pre-wrap break-words" style={{ color: "var(--fc-text)" }}>
            {description}
          </p>
        </div>
        {events.map((e) => (
          <div key={e.id} className="rounded p-2" style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}>
            <div className="text-[10px] mb-1" style={{ color: "var(--fc-text-muted)" }}>
              {e.author_kind === "admin" ? "Team" : "You"} · {relativeTime(e.created_at)}
            </div>
            {e.kind === "comment" && (
              <p className="whitespace-pre-wrap break-words" style={{ color: "var(--fc-text)" }}>
                {e.body}
              </p>
            )}
            {e.kind !== "comment" && e.changes && (
              <p style={{ color: "var(--fc-text-secondary)" }}>
                {Object.entries(e.changes).map(([field, c]) => (
                  <span key={field}>
                    {fieldLabel(field)}: {String(c.from ?? "—")} → {String(c.to ?? "—")}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentBox({ ticketId, onPosted }: { ticketId: string; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/issues/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: body.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      setBody("");
      toast.success("Comment added");
      onPosted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to comment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--fc-text-muted)" }}>
        Add a comment
      </span>
      <VoiceTextarea
        value={body}
        onChange={setBody}
        placeholder="Add more detail or a follow-up…"
        ariaLabel="Add a comment"
        rows={2}
        fieldId={`ticket-comment-${ticketId}`}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}
        >
          {busy ? "Sending…" : "Comment"}
        </button>
      </div>
    </div>
  );
}

function EditDetails({
  ticket,
  onSaved,
}: {
  ticket: TicketRow & { steps: string | null };
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IssueType>(ticket.type);
  const [severity, setSeverity] = useState<IssueSeverity>(ticket.severity);
  const [title, setTitle] = useState(ticket.title ?? "");
  const [description, setDescription] = useState(ticket.description);
  const [steps, setSteps] = useState(ticket.steps ?? "");
  const [busy, setBusy] = useState(false);

  const inputStyle = {
    background: "var(--fc-surface)",
    border: "1px solid var(--fc-border)",
    color: "var(--fc-text)",
  } as const;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/issues/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit: {
            type,
            severity,
            title: title.trim() || undefined,
            description: description.trim(),
            steps: steps.trim() || undefined,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      toast.success("Ticket updated");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="text-[11px] font-medium"
        style={{ color: "var(--fc-text-secondary)" }}
      >
        + Edit details
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg p-3" style={{ border: "1px solid var(--fc-border)" }}>
      <div className="flex gap-2">
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as IssueType)} className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={inputStyle}>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select aria-label="Severity (1–5)" value={severity} onChange={(e) => setSeverity(Number(e.target.value) as IssueSeverity)} className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={inputStyle}>
          {ISSUE_SEVERITY_LEVELS.map((s) => (
            <option key={s} value={s}>{s} — {ISSUE_SEVERITY_INFO[s].label}</option>
          ))}
        </select>
      </div>
      <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full rounded-lg px-2 py-1.5 text-xs" style={inputStyle} />
      <textarea aria-label="What were you trying to do?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What were you trying to do?" className="w-full rounded-lg px-2 py-1.5 text-xs resize-y" style={inputStyle} />
      <textarea aria-label="What did you enter or click?" value={steps} onChange={(e) => setSteps(e.target.value)} rows={2} placeholder="What did you enter or click? (optional)" className="w-full rounded-lg px-2 py-1.5 text-xs resize-y" style={inputStyle} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: "var(--fc-text-secondary)" }}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !description.trim()} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 disabled:opacity-50" style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
