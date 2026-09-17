/**
 * Admin Users — list all users (read-only cards), click for detail panel
 * with non-PII rollups and admin actions.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { SectionHeading } from "@/components/admin/stat-card";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import { InfoTooltip } from "@/components/info-tooltip";
import { StorageUsageBadge } from "@/components/storage-usage-badge";
import { PLAN_QUOTAS } from "@/lib/upload-limits";

interface UserWithRoles {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  banned: boolean;
  banned_until: string | null;
}

interface UsersResponse {
  users: UserWithRoles[];
  canManageRoles: boolean;
  canBanUsers: boolean;
  actor_id: string | null;
  actor_role: string | null;
}

/** Matches the shape returned by /api/admin/storage. */
interface StorageRow {
  userId: string;
  plan: string;
  used: number;
  limit: number;
  ratio: number;
  assetCount: number;
}

interface StorageResponse {
  users: StorageRow[];
  totalUsers: number;
  totalUsedBytes: number;
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "#eab308",
  admin: "var(--fc-danger)",
  moderator: "var(--fc-accent)",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Dev",
  admin: "Admin",
  moderator: "Mod",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide leading-none"
      style={{
        background: "var(--fc-wash)",
        color: ROLE_COLORS[role] ?? "var(--fc-text)",
        border: `1px solid ${ROLE_COLORS[role] ?? "var(--fc-border)"}`,
      }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function AdminUsers() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [storageByUser, setStorageByUser] = useState<Map<string, StorageRow>>(
    new Map(),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setError("");
    try {
      // Users + storage in parallel. Storage is non-critical: if it fails we
      // still show the user list (without bars) rather than blocking the page.
      const [usersRes, storageRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/storage?limit=200").catch(() => null),
      ]);
      if (!usersRes.ok) throw new Error("Failed to load users");
      const json = (await usersRes.json()) as UsersResponse;
      setData(json);

      if (storageRes && storageRes.ok) {
        const sj = (await storageRes.json()) as StorageResponse;
        const map = new Map<string, StorageRow>();
        for (const row of sj.users) map.set(row.userId, row);
        setStorageByUser(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handlePanelClose = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const handleAfterAction = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading && !data) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading users...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const filteredUsers = search.trim()
    ? data.users.filter((u) =>
        u.email.toLowerCase().includes(search.toLowerCase().trim()),
      )
    : data.users;

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--fc-text-muted)" }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email..."
          className="w-full pl-7 pr-2.5 py-1.5 rounded text-xs outline-none"
          style={{
            background: "var(--fc-bg)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
        />
      </div>

      {/* Users list */}
      <section>
        <SectionHeading
          aside={
            <InfoTooltip
              size="sm"
              accentColor="corner-links"
              title="User management"
              content="Click any user to view their non-PII profile: role, activity, content rollups, and admin actions. All destructive actions (block, revoke role) require confirmation and are only available to users with sufficient permissions."
            />
          }
        >
          Users ({filteredUsers.length}
          {search ? ` of ${data.users.length}` : ""})
        </SectionHeading>

        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {filteredUsers.length === 0 ? (
            <p
              className="text-xs py-6 text-center"
              style={{ color: "var(--fc-text-muted)" }}
            >
              No users match.
            </p>
          ) : (
            filteredUsers.map((u, idx) => {
              const isSelf = u.id === data.actor_id;
              const storage = storageByUser.get(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    borderTop:
                      idx === 0
                        ? "none"
                        : "1px solid var(--fc-border-subtle)",
                    opacity: u.banned ? 0.55 : 1,
                  }}
                >
                  {/* Email + meta */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-xs font-mono break-all sm:truncate"
                        style={{
                          color: "var(--fc-text)",
                          textDecoration: u.banned ? "line-through" : "none",
                        }}
                      >
                        {u.email}
                      </span>
                      {isSelf && (
                        <span
                          className="text-[9px] px-1 rounded uppercase tracking-wide shrink-0"
                          style={{
                            background: "var(--fc-wash)",
                            color: "var(--fc-text-faint)",
                          }}
                        >
                          you
                        </span>
                      )}
                      {u.banned && (
                        <span
                          className="text-[9px] px-1 rounded uppercase tracking-wide shrink-0"
                          style={{
                            background: "var(--fc-danger)",
                            color: "white",
                          }}
                        >
                          blocked
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      joined {relativeTime(u.created_at)} · last seen{" "}
                      {relativeTime(u.last_sign_in_at)}
                    </p>
                  </div>

                  {/* Storage — inline bar shown for every user so the row
                      layout is consistent. Users with no uploads default to
                      the free-tier limit and 0 bytes used, which renders an
                      empty bar rather than hiding the column. */}
                  <StorageUsageBadge
                    variant="inline"
                    className="sm:shrink-0"
                    data={
                      storage ?? {
                        used: 0,
                        limit: PLAN_QUOTAS.free,
                        plan: "free",
                      }
                    }
                  />

                  {/* Roles (read-only) — wrap on mobile, pinned right on desktop */}
                  <div className="flex items-center gap-1 flex-wrap sm:shrink-0">
                    {u.roles.map((r) => (
                      <RoleBadge key={r} role={r} />
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {error && data && (
        <p className="text-[11px]" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      )}

      {/* User detail slide-over */}
      {selectedUserId && (
        <UserDetailPanel
          userId={selectedUserId}
          actorRole={data.actor_role}
          actorId={data.actor_id}
          canManageRoles={data.canManageRoles}
          canBanUsers={data.canBanUsers}
          onClose={handlePanelClose}
          onAction={handleAfterAction}
        />
      )}
    </div>
  );
}
