/**
 * Admin Invites — review pending requests, approve/deny, or create direct invites.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { SectionHeading } from "@/components/admin/stat-card";
import { InfoTooltip } from "@/components/info-tooltip";
import { clearAdminStatusCache } from "@/lib/admin-status";

const INVITE_HELP =
  "Pending requests need review. Approve generates a one-time signup link and emails it to the user; Deny sends a polite decline. Once approved: Resend re-emails the same link, and Revoke cancels it (only before they accept). Use 'Invite someone' to send an approved invite directly without a request. User-facing responses are intentionally the same for new, duplicate, and already-registered emails — anti-enumeration.";

interface InviteRow {
  id: string;
  email: string;
  full_name: string;
  organization: string | null;
  status: "pending" | "approved" | "denied" | "accepted" | "revoked";
  invite_token: string | null;
  token_expires_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  accepted_user_id: string | null;
}

const STATUS_FILTERS = [
  "pending",
  "approved",
  "accepted",
  "denied",
  "revoked",
  "all",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_COLORS: Record<InviteRow["status"], string> = {
  pending: "var(--fc-accent)",
  approved: "#10b981",
  accepted: "#737373",
  denied: "var(--fc-danger)",
  revoked: "var(--fc-text-muted)",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminInvites() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchInvites = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/invites");
      if (!res.ok) throw new Error("Failed to load invites");
      const data = await res.json();
      setInvites(data.invites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const filtered = useMemo(() => {
    if (filter === "all") return invites;
    return invites.filter((i) => i.status === filter);
  }, [invites, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invites.length };
    for (const i of invites) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [invites]);

  const act = useCallback(
    async (action: string, id: string) => {
      setBusy(id);
      try {
        const res = await fetch("/api/admin/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Action failed");
          return;
        }
        // Surface email-delivery failure so the admin doesn't silently
        // assume the user got their link. Approve / resend / create-direct
        // all return emailSent in the response.
        if (
          (action === "approve" ||
            action === "resend" ||
            action === "create") &&
          data?.emailSent === false
        ) {
          toast.error(
            `The DB was updated but the email did not send: ${
              data.emailError ?? "unknown reason"
            }. Check Vercel logs for [invites] FAILED... and confirm RESEND_API_KEY + RESEND_FROM_EMAIL (verified domain) in env settings.`,
            { duration: 10000 },
          );
        }
        // Drop the cached admin status so the pending-invite badge in the
        // sidebar/menu reflects this action on the next check.
        clearAdminStatusCache();
        await fetchInvites();
      } finally {
        setBusy(null);
      }
    },
    [fetchInvites],
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading invites…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <SectionHeading>Invites</SectionHeading>
          <InfoTooltip size="sm" title="Invite actions" content={INVITE_HELP} />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded text-xs font-medium px-2.5 py-1"
          style={{
            background: "var(--fc-accent)",
            color: "var(--fc-accent-on)",
          }}
        >
          Invite someone
        </button>
      </section>

      <div className="flex items-center flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => {
          const isActive = filter === s;
          const count = counts[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className="rounded text-[11px] font-medium px-2 py-0.5"
              style={{
                background: isActive ? "var(--fc-accent)" : "var(--fc-wash)",
                color: isActive
                  ? "var(--fc-accent-on)"
                  : "var(--fc-text-secondary)",
                border: `1px solid ${
                  isActive ? "var(--fc-accent)" : "var(--fc-border)"
                }`,
                textTransform: "capitalize",
              }}
            >
              {s} <span style={{ opacity: 0.7 }}>· {count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p
          className="text-center text-xs py-12"
          style={{ color: "var(--fc-text-muted)" }}
        >
          No {filter === "all" ? "" : filter} invites.
        </p>
      ) : (
        <ul
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {filtered.map((inv, idx) => (
            <li
              key={inv.id}
              className="flex items-start justify-between gap-3 p-3 text-sm"
              style={{
                borderBottom:
                  idx < filtered.length - 1
                    ? "1px solid var(--fc-border)"
                    : "none",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-medium"
                    style={{ color: "var(--fc-text)" }}
                  >
                    {inv.full_name}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{
                      color: STATUS_COLORS[inv.status],
                      border: `1px solid ${STATUS_COLORS[inv.status]}`,
                    }}
                  >
                    {inv.status}
                  </span>
                </div>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--fc-text-secondary)" }}
                >
                  {inv.email}
                  {inv.organization ? ` · ${inv.organization}` : ""}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "var(--fc-text-muted)" }}
                >
                  Requested {relativeTime(inv.requested_at)}
                </p>
                {inv.reviewed_at && (
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--fc-text-muted)" }}
                    title={new Date(inv.reviewed_at).toISOString()}
                  >
                    Reviewed
                    {inv.reviewed_by_name ? ` by ${inv.reviewed_by_name}` : ""}
                    {" · "}
                    {absoluteTime(inv.reviewed_at)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {inv.status === "pending" && (
                  <>
                    <ActionBtn
                      label="Approve"
                      onClick={() => act("approve", inv.id)}
                      disabled={busy === inv.id}
                      kind="primary"
                    />
                    <ActionBtn
                      label="Deny"
                      onClick={() => act("deny", inv.id)}
                      disabled={busy === inv.id}
                      kind="danger"
                    />
                  </>
                )}
                {inv.status === "approved" && (
                  <>
                    <ActionBtn
                      label="Resend"
                      onClick={() => act("resend", inv.id)}
                      disabled={busy === inv.id}
                    />
                    <ActionBtn
                      label="Revoke"
                      onClick={() => act("revoke", inv.id)}
                      disabled={busy === inv.id}
                      kind="danger"
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateInviteModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await fetchInvites();
          }}
        />
      )}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  kind = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  kind?: "default" | "primary" | "danger";
}) {
  const bg =
    kind === "primary"
      ? "var(--fc-accent)"
      : kind === "danger"
        ? "color-mix(in srgb, var(--fc-danger) 18%, transparent)"
        : "var(--fc-wash)";
  const color =
    kind === "primary"
      ? "var(--fc-accent-on)"
      : kind === "danger"
        ? "var(--fc-danger)"
        : "var(--fc-text)";
  const border =
    kind === "primary"
      ? "var(--fc-accent)"
      : kind === "danger"
        ? "var(--fc-danger)"
        : "var(--fc-border)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[11px] font-medium px-2 py-0.5 rounded disabled:opacity-50"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </button>
  );
}

function CreateInviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          full_name: fullName,
          email,
          organization: organization || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create invite");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--fc-border)" }}
        >
          <h2 className="text-sm font-medium" style={{ color: "var(--fc-text)" }}>
            Invite someone
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--fc-text)" }}
            >
              Full name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              className="modal-input w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--fc-text)" }}
            >
              Organization
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              maxLength={160}
              className="modal-input w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--fc-text)" }}
            >
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              className="modal-input w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          {error && (
            <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded"
              style={{
                background: "var(--fc-wash)",
                color: "var(--fc-text-secondary)",
                border: "1px solid var(--fc-border)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
              style={{
                background: "var(--fc-accent)",
                color: "var(--fc-accent-on)",
              }}
            >
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
