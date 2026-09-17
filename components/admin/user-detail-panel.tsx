/**
 * User detail slide-over — non-PII rollups + safe admin actions.
 *
 * All destructive actions require explicit confirmation. Designed to
 * prevent accidental ban/role-change clicks from a list view.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Ban, ShieldCheck, AlertTriangle } from "lucide-react";
import { StatCard, SectionHeading } from "@/components/admin/stat-card";
import { StorageUsageBadge } from "@/components/storage-usage-badge";
import { InfoTooltip } from "@/components/info-tooltip";
import { formatBytes, PLAN_QUOTAS, type UserPlan } from "@/lib/upload-limits";

interface UserDetail {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned: boolean;
  banned_until: string | null;
  provider: string;
  roles: string[];
  stats: {
    projects_total: number;
    projects_published: number;
    projects_in_gallery: number;
    context_items: number;
    voice_transcriptions: number;
    last_project_at: string | null;
  };
  storage?: {
    plan: string;
    custom_limit_bytes: number | null;
    used: number;
    limit: number;
    ratio: number;
  };
}

interface ErrorBody {
  error?: string;
}

interface Props {
  userId: string;
  actorId: string | null;
  actorRole: string | null;
  canManageRoles: boolean;
  canBanUsers: boolean;
  onClose: () => void;
  onAction: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Developer",
  admin: "Admin",
  moderator: "Moderator",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserDetailPanel({
  userId,
  actorId,
  actorRole,
  canManageRoles,
  canBanUsers,
  onClose,
  onAction,
}: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    | { type: "ban" | "unban" }
    | { type: "revoke"; role: string }
    | { type: "grant"; role: "moderator" | "admin" | "super_admin" }
    | { type: "change_plan"; plan: UserPlan }
    | null
  >(null);
  const [mutating, setMutating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load user");
        return (await r.json()) as UserDetail;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingAction) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pendingAction]);

  const performAction = useCallback(async () => {
    if (!pendingAction || !detail) return;
    setMutating(true);
    try {
      const body: Record<string, unknown> = {
        user_id: detail.id,
        action: pendingAction.type,
      };
      if (pendingAction.type === "revoke" || pendingAction.type === "grant") {
        body.role = pendingAction.role;
      }
      if (pendingAction.type === "change_plan") {
        body.plan = pendingAction.plan;
        // Always null custom_limit_bytes on a plan change — keeps the model
        // simple. Custom overrides are a separate (future) admin action.
        body.custom_limit_bytes = null;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as ErrorBody;
        throw new Error(errBody.error || "Action failed");
      }
      // Refresh detail in place
      const refreshed = await fetch(`/api/admin/users/${userId}`).then((r) =>
        r.ok ? (r.json() as Promise<UserDetail>) : null,
      );
      if (refreshed) setDetail(refreshed);
      onAction();
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMutating(false);
    }
  }, [pendingAction, detail, userId, onAction]);

  const isSelf = detail?.id === actorId;
  const isTargetSuper = detail?.roles.includes("super_admin") ?? false;
  const isTargetAdmin = detail?.roles.includes("admin") ?? false;
  const cantBanThis =
    isSelf ||
    isTargetSuper ||
    (isTargetAdmin && actorRole !== "super_admin");

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendingAction) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)" }}
      />

      {/* Panel */}
      <aside
        className="relative w-full max-w-md h-full overflow-y-auto"
        style={{
          background: "var(--fc-bg)",
          borderLeft: "1px solid var(--fc-border)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
          style={{
            background: "var(--fc-bg)",
            borderBottom: "1px solid var(--fc-border)",
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--fc-text)" }}
          >
            User Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="fc-list__action"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {loading && (
            <p
              className="text-xs text-center py-8"
              style={{ color: "var(--fc-text-muted)" }}
            >
              Loading...
            </p>
          )}

          {error && !detail && (
            <p
              className="text-xs text-center py-8"
              style={{ color: "var(--fc-danger)" }}
            >
              {error}
            </p>
          )}

          {detail && (
            <>
              {/* Identity */}
              <section>
                <p
                  className="text-xs font-mono break-all"
                  style={{
                    color: "var(--fc-text)",
                    textDecoration: detail.banned ? "line-through" : "none",
                  }}
                >
                  {detail.email}
                </p>
                <p
                  className="text-[10px] font-mono mt-1"
                  style={{ color: "var(--fc-text-faint)" }}
                >
                  ID: {detail.id}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {detail.banned && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase"
                      style={{
                        background: "var(--fc-danger)",
                        color: "white",
                      }}
                    >
                      Blocked
                    </span>
                  )}
                  {detail.roles.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase"
                      style={{
                        background: "var(--fc-wash)",
                        color: "var(--fc-text)",
                        border: "1px solid var(--fc-border)",
                      }}
                    >
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded uppercase"
                    style={{
                      color: "var(--fc-text-muted)",
                      border: "1px solid var(--fc-border-subtle)",
                    }}
                  >
                    via {detail.provider}
                  </span>
                </div>
              </section>

              {/* Activity */}
              <section>
                <SectionHeading>Activity</SectionHeading>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="Joined"
                    value={formatDate(detail.created_at)}
                  />
                  <StatCard
                    label="Last Seen"
                    value={formatDate(detail.last_sign_in_at)}
                  />
                  <StatCard
                    label="Email Verified"
                    value={detail.email_confirmed_at ? "Yes" : "No"}
                    accent={
                      detail.email_confirmed_at
                        ? "#10b981"
                        : "var(--fc-text-muted)"
                    }
                  />
                  <StatCard
                    label="Last Project"
                    value={formatDate(detail.stats.last_project_at)}
                  />
                </div>
              </section>

              {/* Content rollups */}
              <section>
                <SectionHeading>Content</SectionHeading>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="Projects"
                    value={detail.stats.projects_total}
                    accent="var(--fc-accent)"
                  />
                  <StatCard
                    label="Published"
                    value={detail.stats.projects_published}
                    accent="#10b981"
                  />
                  <StatCard
                    label="In Gallery"
                    value={detail.stats.projects_in_gallery}
                  />
                  <StatCard
                    label="Context Items"
                    value={detail.stats.context_items}
                  />
                  <StatCard
                    label="Voice Notes"
                    value={detail.stats.voice_transcriptions}
                    sub="Whisper transcriptions"
                  />
                </div>
              </section>

              {/* Storage — current usage + plan. Plan change is an admin
                  action below. */}
              {detail.storage && (
                <section>
                  <SectionHeading>Storage</SectionHeading>
                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: "var(--fc-surface)",
                      border: "1px solid var(--fc-border)",
                    }}
                  >
                    <StorageUsageBadge
                      data={{
                        used: detail.storage.used,
                        limit: detail.storage.limit,
                        plan: detail.storage.plan,
                      }}
                      className="w-full"
                    />
                    <p
                      className="text-[10px] mt-2 uppercase tracking-wider"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      Current plan: {detail.storage.plan}
                      {detail.storage.custom_limit_bytes != null &&
                        ` · custom cap ${formatBytes(detail.storage.custom_limit_bytes)}`}
                    </p>
                  </div>
                </section>
              )}

              {/* Actions */}
              {(canBanUsers || canManageRoles) && !isSelf && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <h2
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      Admin Actions
                    </h2>
                    <InfoTooltip
                      size="sm"
                      accentColor="corner-cc"
                      title="Permissions"
                      content="Only developers can grant or revoke roles. Admins can block moderators and regular users but cannot change roles. Nobody can block a developer or themselves. Every destructive action requires explicit confirmation."
                    />
                  </div>

                  {pendingAction ? (
                    /* Confirmation panel */
                    <div
                      className="rounded-lg p-3 space-y-3"
                      style={{
                        background:
                          "color-mix(in srgb, var(--fc-danger) 8%, var(--fc-surface))",
                        border: "1px solid var(--fc-danger)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          size={14}
                          style={{ color: "var(--fc-danger)" }}
                          className="shrink-0 mt-0.5"
                        />
                        <p
                          className="text-xs"
                          style={{ color: "var(--fc-text)" }}
                        >
                          {pendingAction.type === "ban" &&
                            `Block ${detail.email}? They will lose access immediately and cannot sign in until unblocked.`}
                          {pendingAction.type === "unban" &&
                            `Unblock ${detail.email}? They will regain full access immediately.`}
                          {pendingAction.type === "revoke" &&
                            `Revoke ${ROLE_LABELS[pendingAction.role] ?? pendingAction.role} from ${detail.email}?`}
                          {pendingAction.type === "grant" &&
                            `Grant ${ROLE_LABELS[pendingAction.role] ?? pendingAction.role} to ${detail.email}? They will gain elevated access immediately.`}
                          {pendingAction.type === "change_plan" &&
                            `Change ${detail.email} to the ${pendingAction.plan} plan (${formatBytes(PLAN_QUOTAS[pendingAction.plan])} storage)? This takes effect immediately.`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={performAction}
                          disabled={mutating}
                          className="flex-1 px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-50"
                          style={{
                            background: "var(--fc-danger)",
                            color: "white",
                          }}
                        >
                          {mutating ? "Working..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingAction(null)}
                          disabled={mutating}
                          className="flex-1 px-2 py-1 rounded text-[11px] font-medium"
                          style={{
                            background: "var(--fc-wash)",
                            color: "var(--fc-text)",
                            border: "1px solid var(--fc-border)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Ban / Unban */}
                      {canBanUsers && (
                        <>
                          {detail.banned ? (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: "unban" })}
                              disabled={cantBanThis}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--fc-accent) 12%, transparent)",
                                color: "var(--fc-accent)",
                                border: "1px solid var(--fc-accent)",
                              }}
                            >
                              <ShieldCheck size={13} />
                              Unblock User
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: "ban" })}
                              disabled={cantBanThis}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--fc-danger) 10%, transparent)",
                                color: "var(--fc-danger)",
                                border: "1px solid var(--fc-danger)",
                              }}
                            >
                              <Ban size={13} />
                              Block User
                            </button>
                          )}
                          {cantBanThis && !isSelf && (
                            <p
                              className="text-[10px]"
                              style={{ color: "var(--fc-text-muted)" }}
                            >
                              {isTargetSuper
                                ? "Developers cannot be blocked."
                                : "Only developers can block other admins."}
                            </p>
                          )}
                        </>
                      )}

                      {/* Revoke roles — super_admin only */}
                      {canManageRoles &&
                        detail.roles
                          .filter((r) => r !== "super_admin")
                          .map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() =>
                                setPendingAction({ type: "revoke", role: r })
                              }
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                              style={{
                                background: "var(--fc-wash)",
                                color: "var(--fc-text)",
                                border: "1px solid var(--fc-border)",
                              }}
                            >
                              Revoke {ROLE_LABELS[r] ?? r}
                            </button>
                          ))}

                      {/* Change storage plan — super_admin only. Lists every
                          plan except the user's current one. */}
                      {canManageRoles && detail.storage && (
                        <div
                          className="space-y-1.5 pt-1"
                          style={{
                            borderTop:
                              "1px solid var(--fc-border-subtle)",
                          }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider pt-1"
                            style={{ color: "var(--fc-text-muted)" }}
                          >
                            Change storage plan
                          </p>
                          {(Object.keys(PLAN_QUOTAS) as UserPlan[])
                            .filter((p) => p !== detail.storage?.plan)
                            .map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  setPendingAction({ type: "change_plan", plan: p })
                                }
                                className="w-full inline-flex items-center justify-between gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                                style={{
                                  background: "var(--fc-wash)",
                                  color: "var(--fc-text)",
                                  border: "1px solid var(--fc-border)",
                                }}
                              >
                                <span className="capitalize">{p}</span>
                                <span
                                  className="text-[10px] tabular-nums"
                                  style={{ color: "var(--fc-text-muted)" }}
                                >
                                  {p === "unlimited"
                                    ? "no cap"
                                    : formatBytes(PLAN_QUOTAS[p])}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}

                      {/* Grant roles — super_admin only; hide roles already held */}
                      {canManageRoles && (
                        <div
                          className="space-y-1.5 pt-1"
                          style={{
                            borderTop:
                              "1px solid var(--fc-border-subtle)",
                          }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider pt-1"
                            style={{ color: "var(--fc-text-muted)" }}
                          >
                            Grant role
                          </p>
                          {(
                            [
                              "moderator",
                              "admin",
                              "super_admin",
                            ] as const
                          )
                            .filter((r) => !detail.roles.includes(r))
                            .map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() =>
                                  setPendingAction({ type: "grant", role: r })
                                }
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                                style={{
                                  background:
                                    "color-mix(in srgb, var(--fc-accent) 10%, transparent)",
                                  color: "var(--fc-accent)",
                                  border: "1px solid var(--fc-accent)",
                                }}
                              >
                                Grant {ROLE_LABELS[r] ?? r}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {error && detail && (
                    <p
                      className="text-[11px] mt-2"
                      style={{ color: "var(--fc-danger)" }}
                    >
                      {error}
                    </p>
                  )}
                </section>
              )}

              {isSelf && (
                <p
                  className="text-[10px] text-center"
                  style={{ color: "var(--fc-text-faint)" }}
                >
                  You cannot perform admin actions on your own account.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
