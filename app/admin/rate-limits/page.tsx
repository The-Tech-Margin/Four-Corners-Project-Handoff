/**
 * Admin Rate Limits dashboard — request volume and violation metrics.
 * No PII displayed — identifiers are truncated hashes.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { StatTile, SectionHeading } from "@/components/admin/stat-card";
import { TimeSeriesChart, type TimeSeriesPoint } from "@/components/admin/charts";

interface TierBreakdown {
  tier: string;
  total: number;
  blocked: number;
}

interface BlockedEndpoint {
  endpoint: string;
  tier: string;
  block_count: number;
}

interface Violation {
  identifier_short: string;
  endpoint: string;
  tier: string;
  created_at: string;
}

interface RateLimitStats {
  total_requests: number;
  total_blocked: number;
  by_tier: TierBreakdown[];
  top_blocked: BlockedEndpoint[];
  recent_violations: Violation[];
  since: string;
  generated_at: string;
  request_series: TimeSeriesPoint[];
  blocked_series: TimeSeriesPoint[];
}

const TIER_COLORS: Record<string, string> = {
  ai: "var(--fc-ai)",
  write: "var(--fc-corner-cc)",
  read: "var(--fc-corner-backstory)",
  admin: "var(--fc-corner-links)",
};

const TIER_LABELS: Record<string, string> = {
  ai: "AI",
  write: "Write",
  read: "Read",
  admin: "Admin",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function RateLimitsPage() {
  const [stats, setStats] = useState<RateLimitStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [cleaning, setCleaning] = useState(false);

  const fetchStats = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/rate-limits?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to load rate limit stats");
      setStats((await res.json()) as RateLimitStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCleanup = useCallback(async () => {
    if (!window.confirm("Delete log entries older than 72h?")) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/admin/rate-limits", { method: "POST" });
      const data = (await res.json()) as { deleted?: number };
      if (data.deleted !== undefined) {
        window.alert(`Cleaned up ${data.deleted} entries`);
      }
      fetchStats();
    } catch {
      window.alert("Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }, [fetchStats]);

  if (loading && !stats) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading rate limit data...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!stats) return null;

  const blockRate =
    stats.total_requests > 0
      ? ((stats.total_blocked / stats.total_requests) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-4">
      {/* Time range selector */}
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--fc-text-muted)" }}
        >
          Range
        </span>
        <div
          className="inline-flex rounded"
          style={{
            background: "var(--fc-wash)",
            border: "1px solid var(--fc-border)",
            padding: 1,
            gap: 1,
          }}
        >
          {[1, 6, 24, 72, 168].map((h) => {
            const isActive = hours === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className="rounded text-[10px] font-medium transition-colors"
                style={{
                  padding: "2px 6px",
                  background: isActive ? "var(--fc-accent)" : "transparent",
                  color: isActive
                    ? "var(--fc-accent-on)"
                    : "var(--fc-text-muted)",
                }}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time-series chart */}
      <section>
        <SectionHeading>Requests Over Time</SectionHeading>
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          <TimeSeriesChart
            data={stats.request_series}
            color="var(--fc-accent)"
            height={70}
          />
          {stats.total_blocked > 0 && (
            <>
              <p
                className="text-[10px] uppercase tracking-wider mt-3 mb-1"
                style={{ color: "var(--fc-text-muted)" }}
              >
                Blocked
              </p>
              <TimeSeriesChart
                data={stats.blocked_series}
                color="var(--fc-danger)"
                height={40}
              />
            </>
          )}
        </div>
      </section>

      {/* Overview */}
      <section>
        <SectionHeading>Overview</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatTile
            label="Requests"
            value={stats.total_requests.toLocaleString()}
            accent="var(--fc-accent)"
          />
          <StatTile
            label="Blocked"
            value={stats.total_blocked.toLocaleString()}
            accent={stats.total_blocked > 0 ? "var(--fc-danger)" : undefined}
          />
          <StatTile
            label="Block %"
            value={`${blockRate}%`}
            accent={parseFloat(blockRate) > 5 ? "var(--fc-danger)" : undefined}
          />
          <StatTile label="Tiers" value={stats.by_tier.length} />
        </div>
      </section>

      {/* Per-tier breakdown */}
      {stats.by_tier.length > 0 && (
        <section>
          <SectionHeading>By Tier</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {stats.by_tier.map((t) => (
              <StatTile
                key={t.tier}
                label={TIER_LABELS[t.tier] || t.tier}
                value={`${t.total.toLocaleString()}${t.blocked > 0 ? ` · ${t.blocked} blk` : ""}`}
                accent={TIER_COLORS[t.tier]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Top blocked endpoints */}
      {stats.top_blocked.length > 0 && (
        <section>
          <SectionHeading>Top Blocked Endpoints</SectionHeading>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {stats.top_blocked.map((row, i) => (
              <div
                key={`${row.endpoint}-${i}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--fc-border-subtle)",
                }}
              >
                <span
                  className="font-mono text-[11px] flex-1 min-w-0 break-all sm:truncate"
                  style={{ color: "var(--fc-text)" }}
                >
                  {row.endpoint}
                </span>
                <span
                  className="text-[10px] font-medium uppercase shrink-0"
                  style={{ color: TIER_COLORS[row.tier] || "var(--fc-text)" }}
                >
                  {TIER_LABELS[row.tier] || row.tier}
                </span>
                <span
                  className="text-xs tabular-nums font-semibold shrink-0"
                  style={{ color: "var(--fc-danger)" }}
                >
                  {row.block_count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent violations */}
      {stats.recent_violations.length > 0 && (
        <section>
          <SectionHeading>Recent Violations</SectionHeading>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {stats.recent_violations.map((v, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5"
                style={{
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--fc-border-subtle)",
                }}
              >
                <span
                  className="text-[10px] w-8 shrink-0"
                  style={{ color: "var(--fc-text-muted)" }}
                >
                  {relativeTime(v.created_at)}
                </span>
                <span
                  className="font-mono text-[10px] w-14 shrink-0 truncate"
                  style={{ color: "var(--fc-text-faint)" }}
                >
                  {v.identifier_short}
                </span>
                <span
                  className="font-mono text-[11px] flex-1 min-w-0 break-all sm:truncate"
                  style={{ color: "var(--fc-text)" }}
                >
                  {v.endpoint}
                </span>
                <span
                  className="text-[10px] font-medium uppercase shrink-0"
                  style={{ color: TIER_COLORS[v.tier] || "var(--fc-text)" }}
                >
                  {TIER_LABELS[v.tier] || v.tier}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[10px]" style={{ color: "var(--fc-text-muted)" }}>
          Since {new Date(stats.since).toLocaleString()}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCleanup}
            disabled={cleaning}
            className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-50"
            style={{
              background: "var(--fc-wash)",
              color: "var(--fc-text-muted)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {cleaning ? "Cleaning..." : "Cleanup"}
          </button>
          <button
            type="button"
            onClick={fetchStats}
            disabled={loading}
            className="px-2.5 py-1 rounded text-[11px] font-medium disabled:opacity-50"
            style={{
              background: "var(--fc-wash)",
              color: "var(--fc-text)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
