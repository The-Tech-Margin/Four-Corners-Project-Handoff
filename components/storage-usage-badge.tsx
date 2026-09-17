"use client";

/**
 * StorageUsageBadge — compact "X of Y used" indicator backed by the user's
 * plan and the sum of their user_assets.file_size rows.
 *
 * Variants:
 *   default — pill with text + bar (dashboard toolbar, user menu)
 *   compact — thin bar + % only (library modal footer)
 *   inline  — thin bar + % + very small text, one-liner (admin users list)
 *
 * Data sources (in precedence order):
 *   1. `data` prop — caller supplies { used, limit, plan }; no fetch. Used by
 *      the admin view which already has per-user numbers pre-joined.
 *   2. auto-fetch via getUserQuota(currentUserId) — the signed-in-user case.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserQuota, type UserQuota } from "@/lib/db/user-storage";
import {
  formatBytes,
  USAGE_CRITICAL_RATIO,
  USAGE_WARN_RATIO,
} from "@/lib/upload-limits";

type Variant = "default" | "compact" | "inline";

interface StorageUsageBadgeProps {
  variant?: Variant;
  className?: string;
  /** Pre-fetched quota data; disables the self-fetch path. */
  data?: { used: number; limit: number; plan: string };
}

/**
 * Colour ramp — amber ≥ 80 %, red ≥ 95 %, accent otherwise. Uses --fc-*
 * tokens so dark/light and persona swaps follow.
 */
function fillColor(ratio: number): string {
  if (ratio >= USAGE_CRITICAL_RATIO) return "var(--fc-danger)";
  if (ratio >= USAGE_WARN_RATIO) return "#f59e0b";
  return "var(--fc-accent)";
}

const TRACK = "color-mix(in srgb, var(--fc-border) 60%, transparent)";

export function StorageUsageBadge({
  variant = "default",
  className = "",
  data,
}: StorageUsageBadgeProps) {
  const [selfQuota, setSelfQuota] = useState<UserQuota | null>(null);
  const [loading, setLoading] = useState(!data); // skip fetch when data is supplied

  useEffect(() => {
    // Caller-supplied data path — no self-fetch.
    if (data) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const q = await getUserQuota(user.id);
      if (!cancelled) {
        setSelfQuota(q);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Merge the two data sources into a single quota shape.
  const quota: UserQuota | null = data
    ? {
        used: data.used,
        limit: data.limit,
        plan: data.plan,
        ratio: data.limit > 0 ? Math.min(1, data.used / data.limit) : 0,
      }
    : selfQuota;

  if (loading || !quota) return null;

  const fill = fillColor(quota.ratio);
  const pct = Math.round(quota.ratio * 100);
  const hover = `${formatBytes(quota.used)} of ${formatBytes(quota.limit)} used (${pct}% · ${quota.plan} plan)`;

  if (variant === "compact") {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        title={hover}
        aria-label={`Storage: ${pct}% used`}
      >
        <div className="h-1 w-16 rounded-full overflow-hidden" style={{ background: TRACK }}>
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--fc-text-muted)" }}>
          {pct}%
        </span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-1.5 ${className}`}
        title={hover}
        aria-label={`Storage: ${pct}% used`}
      >
        <div className="h-1 w-12 rounded-full overflow-hidden shrink-0" style={{ background: TRACK }}>
          <div className="h-full" style={{ width: `${pct}%`, background: fill }} />
        </div>
        <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: "var(--fc-text-muted)" }}>
          {formatBytes(quota.used)} · {pct}%
        </span>
      </div>
    );
  }

  // Default pill
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${className}`}
      style={{ borderColor: "var(--fc-border)", background: "var(--fc-surface-alt)" }}
      title={hover}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className="text-[11px] leading-none tabular-nums whitespace-nowrap"
          style={{ color: "var(--fc-text-secondary)" }}
        >
          {formatBytes(quota.used)} of {formatBytes(quota.limit)}
        </span>
        <div className="h-1 w-32 rounded-full overflow-hidden" style={{ background: TRACK }}>
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
      </div>
    </div>
  );
}
