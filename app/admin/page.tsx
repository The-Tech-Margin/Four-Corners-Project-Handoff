/**
 * Admin Overview — compact rollup dashboard combining stats from every
 * admin section (accounts, projects, content, traffic, performance).
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatTile, SectionHeading } from "@/components/admin/stat-card";
import { SegmentedTabs } from "@/components/admin/segmented-tabs";
import { TimeSeriesChart, type TimeSeriesPoint } from "@/components/admin/charts";
import { WorldMap, type GeoPoint } from "@/components/admin/world-map";
import { getCentroid } from "@/components/admin/country-centroids";
import { InfoTooltip } from "@/components/info-tooltip";

interface AdminStats {
  users: {
    total: number;
    newLast7Days: number;
    admins: number;
    banned?: number;
  };
  projects: {
    total: number;
    published: number;
    gallery: number;
    private: number;
    newLast7Days: number;
  };
  content: {
    contextItems: number;
    projectsWithContext: number;
    transcriptions: number;
  };
  cachedAt: string | null;
  refreshedAt: string;
}

interface ContentStats {
  tags: { tag: string; count: number }[];
  equipment: { make: string; model: string; count: number }[];
}

interface RateLimitStats {
  total_requests: number;
  total_blocked: number;
  by_tier: { tier: string; total: number; blocked: number }[];
  request_series: TimeSeriesPoint[];
  blocked_series: TimeSeriesPoint[];
}

interface PerfSummary {
  metric: string;
  p50: number;
  p75: number;
  p95: number;
  count: number;
}

interface DeviceRow {
  device: string;
  count: number;
  lcp_p75: number | null;
}

interface PerfStats {
  summary: PerfSummary[];
  byDevice: DeviceRow[];
  byGeo: GeoPoint[];
  total: number;
}

interface Rollup {
  stats: AdminStats | null;
  content: ContentStats | null;
  traffic: RateLimitStats | null;
  perf: PerfStats | null;
}

function formatVital(metric: string, value: number | null): string {
  if (value == null) return "—";
  if (metric === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

// Time-range choices for the traffic + performance panels. Matches the set
// offered on /admin/analytics so operators get the same mental model.
const RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
  { hours: 720, label: "30d" },
] as const;

// Visibility filter scopes projects + content rollups to public / private / all.
// Accounts stats are global and unaffected.
type VisibilityFilter = "all" | "published" | "private";
const VISIBILITY_OPTIONS: { key: VisibilityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "private", label: "Private" },
];

export default function AdminOverview() {
  const [rollup, setRollup] = useState<Rollup>({
    stats: null,
    content: null,
    traffic: null,
    perf: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24);
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      // Traffic + performance respect the range selector. Stats + content
      // are global counters and stay all-time — the range pill group notes
      // this with a "Traffic & performance" scope label.
      const [statsRes, contentRes, trafficRes, perfRes] = await Promise.all([
        fetch("/api/admin/stats").then((r) =>
          r.ok ? (r.json() as Promise<AdminStats>) : null,
        ),
        fetch("/api/admin/content").then((r) =>
          r.ok ? (r.json() as Promise<ContentStats>) : null,
        ),
        fetch(`/api/admin/rate-limits?hours=${hours}`).then((r) =>
          r.ok ? (r.json() as Promise<RateLimitStats>) : null,
        ),
        fetch(`/api/admin/performance?hours=${hours}`).then((r) =>
          r.ok ? (r.json() as Promise<PerfStats>) : null,
        ),
      ]);
      setRollup({
        stats: statsRes,
        content: contentRes,
        traffic: trafficRes,
        perf: perfRes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading && !rollup.stats) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading rollup...
      </div>
    );
  }

  if (error && !rollup.stats) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  const { stats, content, traffic, perf } = rollup;
  if (!stats) return null;

  // Current range label — threaded into every range-bound section heading so
  // the copy always matches what the data reflects.
  const rangeLabel =
    RANGES.find((r) => r.hours === hours)?.label ?? `${hours}h`;

  const publishedPct =
    stats.projects.total > 0
      ? Math.round((stats.projects.published / stats.projects.total) * 100)
      : 0;

  const blockRate =
    traffic && traffic.total_requests > 0
      ? ((traffic.total_blocked / traffic.total_requests) * 100).toFixed(1)
      : "0.0";

  const topTier = traffic
    ? [...traffic.by_tier].sort((a, b) => b.total - a.total)[0]
    : null;

  const topTag = content?.tags[0] ?? null;
  const topEquipment = content?.equipment[0] ?? null;

  // Derive top visitor country from speed_insights geo data
  const topCountry = (() => {
    if (!perf?.byGeo || perf.byGeo.length === 0) return null;
    const counts = new Map<string, number>();
    for (const p of perf.byGeo) {
      if (!p.country) continue;
      const code = p.country.toUpperCase();
      counts.set(code, (counts.get(code) ?? 0) + p.count);
    }
    let bestCode: string | null = null;
    let max = 0;
    for (const [code, n] of counts)
      if (n > max) {
        bestCode = code;
        max = n;
      }
    if (!bestCode) return null;
    const name = getCentroid(bestCode)?.name ?? bestCode;
    return { name, count: max };
  })();

  const perfByMetric = new Map(perf?.summary.map((s) => [s.metric, s]) ?? []);
  const lcp = perfByMetric.get("LCP");
  const cls = perfByMetric.get("CLS");
  const inp = perfByMetric.get("INP");

  return (
    <div className="space-y-4">
      {/* Filter bar — range + visibility scope.
          RANGE → traffic, performance, devices, visitor geography (re-fetches).
          VISIBILITY → accents the matching Projects tile.
          Section order is deliberate: everything the controls change renders
          directly beneath them (the live dashboard); the all-time totals
          (Accounts / Projects / Content / Database) follow below, labelled
          "(all time)" so the controls aren't read as filtering them. */}
      <section
        className="flex items-center gap-3 rounded-lg px-3 py-2"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
      >
        {/* Controls cluster — no text labels (the pill values are
            self-explanatory; tablists carry aria-labels). Wraps internally on
            very narrow screens; the refresh icon is a sibling so it stays on
            the first row instead of claiming one of its own. Arrow keys move +
            select (SegmentedTabs implements ARIA tabs roving tabindex). */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <SegmentedTabs
            label="Traffic and performance time range"
            options={RANGES.map((r) => ({ key: r.hours, label: r.label }))}
            value={hours}
            onChange={setHours}
          />
          <SegmentedTabs
            label="Project visibility filter"
            options={VISIBILITY_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
            value={visibility}
            onChange={setVisibility}
          />
        </div>

        {/* Refresh — icon-only to keep the bar a single row; spins while a
            manual refetch is in flight. */}
        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto inline-flex items-center justify-center rounded transition-colors disabled:opacity-60 flex-shrink-0"
          style={{
            width: 24,
            height: 24,
            background: "var(--fc-wash)",
            color: "var(--fc-text-secondary)",
            border: "1px solid var(--fc-border)",
          }}
          aria-label={loading ? "Refreshing data" : "Refresh data"}
          title="Refresh data"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
        </button>
      </section>

      {/* Traffic */}
      {traffic && (
        <section>
          <SectionHeading
            href="/admin/rate-limits"
            aside={
              <InfoTooltip
                size="sm"
                title="Traffic"
                content="Rate-limit activity over the selected range. Requests counts every API call proxied through lib/rate-limit.ts. Blocked is the subset that hit a limit. Block % is blocked ÷ requests. Top tier is the rate-limit bucket with the most hits — one of ai (10/min), write (30/min), read (100/min), or admin (30/min). High block % usually means a misbehaving client, not a user problem."
              />
            }
          >
            Traffic ({rangeLabel})
          </SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
            <StatTile
              label="Requests"
              value={traffic.total_requests.toLocaleString()}
              accent="var(--fc-accent)"
            />
            <StatTile
              label="Blocked"
              value={traffic.total_blocked.toLocaleString()}
              accent={
                traffic.total_blocked > 0 ? "var(--fc-danger)" : undefined
              }
            />
            <StatTile
              label="Block %"
              value={`${blockRate}%`}
              accent={
                parseFloat(blockRate) > 5 ? "var(--fc-danger)" : undefined
              }
            />
            <StatTile
              label="Top tier"
              value={topTier ? `${topTier.tier} (${topTier.total})` : "—"}
            />
          </div>
          {traffic.request_series.length > 0 && (
            <div
              className="rounded-md p-2"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
              }}
            >
              <TimeSeriesChart
                data={traffic.request_series}
                color="var(--fc-accent)"
                height={48}
              />
            </div>
          )}
        </section>
      )}

      {/* Performance */}
      {perf && perf.total > 0 && (
        <section>
          <SectionHeading
            href="/admin/performance"
            aside={
              <InfoTooltip
                size="sm"
                title="Performance"
                content="Core Web Vitals p75 over the selected range, sampled from real visitors via Vercel Speed Insights. LCP (Largest Contentful Paint) should be under 2.5s on good connections. CLS (Cumulative Layout Shift) should stay under 0.1. INP (Interaction to Next Paint) should stay under 200ms. Samples is the number of reports that fed the percentiles."
              />
            }
          >
            Performance ({rangeLabel})
          </SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <StatTile
              label="LCP p75"
              value={lcp ? formatVital("LCP", lcp.p75) : "—"}
            />
            <StatTile
              label="CLS p75"
              value={cls ? formatVital("CLS", cls.p75) : "—"}
            />
            <StatTile
              label="INP p75"
              value={inp ? formatVital("INP", inp.p75) : "—"}
            />
            <StatTile label="Samples" value={perf.total} />
          </div>
        </section>
      )}

      {/* Devices */}
      {perf && perf.byDevice && perf.byDevice.length > 0 && (
        <section>
          <SectionHeading
            href="/admin/performance"
            aside={
              <InfoTooltip
                size="sm"
                title="Devices"
                content="Share of visitor samples by device class over the selected range. Classes come from the User-Agent header at page-view time. 'Unclassified' is where the header was missing or ambiguous."
              />
            }
          >
            Devices ({rangeLabel})
          </SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {perf.byDevice.map((d) => {
              const pct =
                perf.total > 0
                  ? Math.round((d.count / perf.total) * 100)
                  : 0;
              const rawLabel = (d.device ?? "unknown").toLowerCase();
              const label =
                rawLabel === "unknown" || rawLabel === ""
                  ? "Unclassified"
                  : rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
              return (
                <StatTile
                  key={d.device || "unknown"}
                  label={label}
                  value={`${d.count.toLocaleString()} · ${pct}%`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Visitor Geography */}
      {perf && perf.byGeo && perf.byGeo.length > 0 && (
        <section>
          <SectionHeading
            href="/admin/performance"
            aside={
              <InfoTooltip
                size="sm"
                title="Visitor Geography"
                content="Map of visitor locations over the selected range. Bubbles are sized by sqrt(count). The list below is a drill-down for one country at a time — click any bubble to switch. The bottom-left badge notes visitors from regions without a country centroid (e.g. VPNs)."
              />
            }
          >
            Visitor Geography ({rangeLabel})
          </SectionHeading>
          <div
            className="rounded-md overflow-hidden p-2"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            <WorldMap
              data={perf.byGeo}
              height={220}
              selectedCountry={selectedCountry}
              onSelectCountry={(code) =>
                setSelectedCountry((prev) => (prev === code ? null : code))
              }
            />
          </div>

          {/* Drill-down list for the selected (or top) country */}
          {(() => {
            const focusCode =
              selectedCountry ??
              (() => {
                const counts = new Map<string, number>();
                for (const p of perf.byGeo) {
                  if (!p.country) continue;
                  counts.set(
                    p.country.toUpperCase(),
                    (counts.get(p.country.toUpperCase()) ?? 0) + p.count,
                  );
                }
                let top: string | null = null;
                let max = 0;
                for (const [c, n] of counts)
                  if (n > max) {
                    top = c;
                    max = n;
                  }
                return top;
              })();
            if (!focusCode) return null;
            const name = getCentroid(focusCode)?.name ?? focusCode;
            const cities = perf.byGeo
              .filter(
                (p) =>
                  p.country?.toUpperCase() === focusCode && p.city,
              )
              .sort((a, b) => b.count - a.count)
              .slice(0, 8);
            const totalInCountry = perf.byGeo
              .filter((p) => p.country?.toUpperCase() === focusCode)
              .reduce((s, p) => s + p.count, 0);
            return (
              <div
                className="mt-1.5 rounded-md p-2"
                style={{
                  background: "var(--fc-surface)",
                  border: "1px solid var(--fc-border)",
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: "var(--fc-text)" }}
                  >
                    {name}{" "}
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--fc-text-muted)" }}
                    >
                      · {totalInCountry.toLocaleString()}
                    </span>
                  </span>
                  {selectedCountry && (
                    <button
                      type="button"
                      onClick={() => setSelectedCountry(null)}
                      className="text-[10px]"
                      style={{ color: "var(--fc-text-faint)" }}
                    >
                      clear
                    </button>
                  )}
                </div>
                {cities.length === 0 ? (
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--fc-text-faint)" }}
                  >
                    No city-level data yet
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {cities.map((c, i) => (
                      <li
                        key={`${c.city}-${i}`}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span
                          className="truncate"
                          style={{ color: "var(--fc-text-secondary)" }}
                        >
                          {c.city}
                          {c.region ? ` · ${c.region}` : ""}
                        </span>
                        <span
                          className="tabular-nums shrink-0"
                          style={{ color: "var(--fc-text-muted)" }}
                        >
                          {c.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* Accounts */}
      <section>
        <SectionHeading
          href="/admin/users"
          aside={
            <InfoTooltip
              size="sm"
              title="Accounts"
              content="All-time account counts from auth.users. Total is every signed-up user. New 7d is users whose auth record was created in the last seven days. Admins counts rows in user_roles with the admin or developer role. Blocked is users with an active Supabase ban."
            />
          }
        >
          Accounts (all time)
        </SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatTile
            label="Total"
            value={stats.users.total}
            accent="var(--fc-accent)"
          />
          <StatTile label="New 7d" value={stats.users.newLast7Days} />
          <StatTile label="Admins" value={stats.users.admins} />
          <StatTile
            label="Blocked"
            value={stats.users.banned ?? 0}
            accent={
              (stats.users.banned ?? 0) > 0 ? "var(--fc-danger)" : undefined
            }
          />
        </div>
      </section>

      {/* Projects — visibility filter surfaces the matching tile. When
          "Published" is active we highlight the Published tile, etc. */}
      <section>
        <SectionHeading
          aside={
            <InfoTooltip
              size="sm"
              title="Projects"
              content="All-time project counts from the projects table. Published is projects with a share link. Gallery is projects also listed in the public /gallery. Private is unpublished. New 7d counts projects created in the last seven days. Visibility filter above accents the matching tile."
            />
          }
        >
          Projects (all time)
        </SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          <StatTile
            label="Total"
            value={stats.projects.total}
            accent={visibility === "all" ? "var(--fc-accent)" : undefined}
          />
          <StatTile
            label={`Published`}
            value={`${stats.projects.published} (${publishedPct}%)`}
            accent={visibility === "published" ? "var(--fc-accent)" : "#10b981"}
          />
          <StatTile label="Gallery" value={stats.projects.gallery} />
          <StatTile
            label="Private"
            value={stats.projects.private}
            accent={visibility === "private" ? "var(--fc-accent)" : undefined}
          />
          <StatTile label="New 7d" value={stats.projects.newLast7Days} />
        </div>
      </section>

      {/* Content */}
      <section>
        <SectionHeading
          href="/admin/content"
          aside={
            <InfoTooltip
              size="sm"
              title="Content"
              content="All-time content counts across every project. Context = related imagery items attached to projects. Voice = Whisper-transcribed recordings. Top tag / top equipment summarise the most common tag label and camera model in saved projects. Top country is sourced from performance analytics, not project metadata."
            />
          }
        >
          Content (all time)
        </SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatTile label="Context" value={stats.content.contextItems} />
          <StatTile label="Voice" value={stats.content.transcriptions} />
          <StatTile
            label="Top tag"
            value={topTag ? `${topTag.tag} (${topTag.count})` : "—"}
          />
          <StatTile
            label="Top country"
            value={
              topCountry ? `${topCountry.name} (${topCountry.count})` : "—"
            }
          />
        </div>
        {topEquipment && (
          <p
            className="text-[10px] mt-1.5"
            style={{ color: "var(--fc-text-muted)" }}
          >
            Top camera: {topEquipment.make} {topEquipment.model} ·{" "}
            {topEquipment.count}
          </p>
        )}
      </section>

      {/* Database */}
      <section>
        <SectionHeading>Database</SectionHeading>
        <div
          className="rounded-md px-2.5 py-1.5"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <p style={{ color: "var(--fc-text-muted)" }}>Dual-Write</p>
              <p className="font-medium" style={{ color: "#10b981" }}>
                Active
              </p>
            </div>
            <div>
              <p style={{ color: "var(--fc-text-muted)" }}>Normalized</p>
              <p className="font-medium" style={{ color: "#10b981" }}>
                Phase 3
              </p>
            </div>
            <div>
              <p style={{ color: "var(--fc-text-muted)" }}>Stats cached</p>
              <p className="font-medium">
                {stats.cachedAt
                  ? new Date(stats.cachedAt).toLocaleTimeString()
                  : "Live"}
              </p>
            </div>
            <div>
              <p style={{ color: "var(--fc-text-muted)" }}>RLS</p>
              <p className="font-medium" style={{ color: "#10b981" }}>
                Enabled
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Refresh */}
      <div className="flex items-center justify-between">
        <p className="text-[10px]" style={{ color: "var(--fc-text-muted)" }}>
          Refreshed {new Date(stats.refreshedAt).toLocaleTimeString()}
        </p>
        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="px-2 py-0.5 rounded text-[10px] font-medium disabled:opacity-50"
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
  );
}
