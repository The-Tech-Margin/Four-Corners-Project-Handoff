/**
 * Admin Analytics — Vercel-style web analytics dashboard fed by our own
 * `page_views` Supabase table.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatTile, SectionHeading } from "@/components/admin/stat-card";
import {
  HorizontalBarChart,
  type BarDatum,
} from "@/components/admin/charts";
import { WorldMap, type GeoPoint } from "@/components/admin/world-map";
import { getCentroid } from "@/components/admin/country-centroids";

interface Summary {
  total_views: number;
  unique_sessions: number;
  unique_paths: number;
  unique_countries: number;
}

interface TopPage {
  path: string;
  views: number;
  sessions: number;
}

interface TopReferrer {
  referrer_host: string;
  views: number;
}

interface NamedCount {
  browser?: string;
  os?: string;
  views: number;
}

interface CountryRow {
  country: string;
  city: string | null;
  region: string | null;
  views: number;
}

interface UtmRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  views: number;
}

interface AnalyticsResponse {
  summary: Summary;
  topPages: TopPage[];
  topReferrers: TopReferrer[];
  browsers: NamedCount[];
  operatingSystems: NamedCount[];
  countries: CountryRow[];
  utm: UtmRow[];
  since: string;
}

// Shape from /api/admin/performance — we only read the p75 summary here.
interface VitalSummary {
  metric: string;
  p50: number;
  p75: number;
  p95: number;
  count: number;
}
interface PerfSnapshot {
  summary: VitalSummary[];
  total: number;
}

const CWV_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
};

function getVitalColor(metric: string, value: number | null): string | undefined {
  if (value == null) return undefined;
  const t = CWV_THRESHOLDS[metric];
  if (!t) return undefined;
  if (value <= t.good) return "#10b981";
  if (value <= t.poor) return "#f59e0b";
  return "var(--fc-danger)";
}

function formatVital(metric: string, value: number | null): string {
  if (value == null) return "—";
  if (metric === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

const RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
] as const;

function toBarData(
  rows: NamedCount[],
  key: "browser" | "os",
  color: string,
): BarDatum[] {
  const total = rows.reduce((s, r) => s + r.views, 0) || 1;
  return rows.slice(0, 8).map((r) => {
    const name = (r[key] ?? "Unknown") as string;
    const pct = Math.round((r.views / total) * 100);
    return {
      label: `${name} · ${pct}%`,
      value: r.views,
      color,
    };
  });
}

export default function AdminAnalytics() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [perf, setPerf] = useState<PerfSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      // Pull page-view analytics + speed_insights snapshot in parallel so
      // the analytics page reflects performance data where available.
      const [analyticsRes, perfRes] = await Promise.all([
        fetch(`/api/admin/analytics?hours=${hours}`),
        fetch(`/api/admin/performance?hours=${hours}`),
      ]);
      if (!analyticsRes.ok) throw new Error("Failed to load analytics");
      setData((await analyticsRes.json()) as AnalyticsResponse);
      // Performance is additive — a missing speed_insights table or
      // unauthorized response should not block the analytics render.
      if (perfRes.ok) {
        const p = (await perfRes.json()) as PerfSnapshot;
        setPerf(p);
      } else {
        setPerf(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Build GeoPoint[] for the world map from country rows
  const geoPoints: GeoPoint[] = useMemo(() => {
    if (!data) return [];
    return data.countries.map((c) => ({
      country: c.country,
      city: c.city,
      region: c.region,
      count: c.views,
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading analytics...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
        <p
          className="text-[10px] mt-2"
          style={{ color: "var(--fc-text-muted)" }}
        >
          The page_views table may not exist yet. Run migration 033 first.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const topCountry = (() => {
    if (data.countries.length === 0) return null;
    const counts = new Map<string, number>();
    for (const c of data.countries) {
      if (!c.country) continue;
      const code = c.country.toUpperCase();
      counts.set(code, (counts.get(code) ?? 0) + c.views);
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

  const topPagesBars: BarDatum[] = data.topPages.map((p) => ({
    label: p.path,
    value: p.views,
  }));
  const topRefBars: BarDatum[] = data.topReferrers.map((r) => ({
    label: r.referrer_host,
    value: r.views,
    color: "var(--fc-corner-links)",
  }));
  const browserBars = toBarData(data.browsers, "browser", "var(--fc-accent)");
  const osBars = toBarData(
    data.operatingSystems,
    "os",
    "var(--fc-corner-cc)",
  );

  return (
    <div className="space-y-4">
      {/* Range selector */}
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
          {RANGES.map((r) => {
            const isActive = hours === r.hours;
            return (
              <button
                key={r.hours}
                type="button"
                onClick={() => setHours(r.hours)}
                className="rounded text-[10px] font-medium transition-colors"
                style={{
                  padding: "2px 6px",
                  background: isActive ? "var(--fc-accent)" : "transparent",
                  color: isActive
                    ? "var(--fc-accent-on)"
                    : "var(--fc-text-muted)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview tiles */}
      <section>
        <SectionHeading>Overview</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatTile
            label="Page views"
            value={summary.total_views.toLocaleString()}
            accent="var(--fc-accent)"
          />
          <StatTile
            label="Visitors"
            value={summary.unique_sessions.toLocaleString()}
          />
          <StatTile
            label="Unique paths"
            value={summary.unique_paths}
          />
          <StatTile
            label="Top country"
            value={
              topCountry
                ? `${topCountry.name} · ${topCountry.count}`
                : "—"
            }
          />
        </div>
      </section>

      {/* Web Vitals snapshot — fed by Vercel Speed Insights → speed_insights
          table. Rendered only when samples exist so the analytics page stays
          clean before the drain has data. */}
      {perf && perf.total > 0 && (() => {
        const byMetric = new Map(perf.summary.map((s) => [s.metric, s]));
        const lcp = byMetric.get("LCP");
        const cls = byMetric.get("CLS");
        const inp = byMetric.get("INP");
        return (
          <section>
            <SectionHeading>Web Vitals (p75)</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <StatTile
                label="LCP p75"
                value={lcp ? formatVital("LCP", lcp.p75) : "—"}
                accent={getVitalColor("LCP", lcp?.p75 ?? null)}
              />
              <StatTile
                label="CLS p75"
                value={cls ? formatVital("CLS", cls.p75) : "—"}
                accent={getVitalColor("CLS", cls?.p75 ?? null)}
              />
              <StatTile
                label="INP p75"
                value={inp ? formatVital("INP", inp.p75) : "—"}
                accent={getVitalColor("INP", inp?.p75 ?? null)}
              />
              <StatTile label="Samples" value={perf.total} />
            </div>
          </section>
        );
      })()}

      {/* Pages + Referrers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section>
          <SectionHeading>Top Pages</SectionHeading>
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {topPagesBars.length === 0 ? (
              <p
                className="text-xs py-4 text-center"
                style={{ color: "var(--fc-text-muted)" }}
              >
                No page views in this range.
              </p>
            ) : (
              <HorizontalBarChart data={topPagesBars} />
            )}
          </div>
        </section>

        <section>
          <SectionHeading>Top Referrers</SectionHeading>
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {topRefBars.length === 0 ? (
              <p
                className="text-xs py-4 text-center"
                style={{ color: "var(--fc-text-muted)" }}
              >
                No external referrers yet.
              </p>
            ) : (
              <HorizontalBarChart data={topRefBars} />
            )}
          </div>
        </section>
      </div>

      {/* World Map */}
      <section>
        <SectionHeading>Visitor Geography</SectionHeading>
        {geoPoints.length === 0 ? (
          <div
            className="rounded-md p-4 text-xs text-center"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
              color: "var(--fc-text-muted)",
            }}
          >
            No geographic data yet.
          </div>
        ) : (
          <>
            <div
              className="rounded-md overflow-hidden p-2"
              style={{
                background: "var(--fc-surface)",
                border: "1px solid var(--fc-border)",
              }}
            >
              <WorldMap
                data={geoPoints}
                height={260}
                selectedCountry={selectedCountry}
                onSelectCountry={(code) =>
                  setSelectedCountry((prev) => (prev === code ? null : code))
                }
              />
            </div>

            {/* Drill-down for selected or top country */}
            {(() => {
              const focusCode =
                selectedCountry ??
                (topCountry
                  ? geoPoints
                      .find(
                        (p) =>
                          (p.country ?? "").toUpperCase() ===
                          (geoPoints[0]?.country ?? "").toUpperCase(),
                      )
                      ?.country?.toUpperCase() ?? null
                  : null);
              if (!focusCode) return null;
              const name = getCentroid(focusCode)?.name ?? focusCode;
              const cities = data.countries
                .filter(
                  (c) =>
                    c.country?.toUpperCase() === focusCode && c.city,
                )
                .sort((a, b) => b.views - a.views)
                .slice(0, 10);
              const totalInCountry = data.countries
                .filter((c) => c.country?.toUpperCase() === focusCode)
                .reduce((s, c) => s + c.views, 0);
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
                            {c.views.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </section>

      {/* Browser + OS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section>
          <SectionHeading>Browsers</SectionHeading>
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {browserBars.length === 0 ? (
              <p
                className="text-xs py-4 text-center"
                style={{ color: "var(--fc-text-muted)" }}
              >
                No data yet.
              </p>
            ) : (
              <HorizontalBarChart data={browserBars} />
            )}
          </div>
        </section>

        <section>
          <SectionHeading>Operating Systems</SectionHeading>
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {osBars.length === 0 ? (
              <p
                className="text-xs py-4 text-center"
                style={{ color: "var(--fc-text-muted)" }}
              >
                No data yet.
              </p>
            ) : (
              <HorizontalBarChart data={osBars} />
            )}
          </div>
        </section>
      </div>

      {/* UTM breakdown */}
      {data.utm.length > 0 && (
        <section>
          <SectionHeading>UTM Campaigns</SectionHeading>
          <div
            className="rounded-md overflow-hidden"
            style={{
              background: "var(--fc-surface)",
              border: "1px solid var(--fc-border)",
            }}
          >
            {data.utm.map((u, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
                style={{
                  borderTop:
                    i === 0
                      ? "none"
                      : "1px solid var(--fc-border-subtle)",
                }}
              >
                <span
                  className="text-[11px] font-mono flex-1 min-w-0 truncate"
                  style={{ color: "var(--fc-text)" }}
                >
                  {[u.source, u.medium, u.campaign]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                <span
                  className="text-[11px] tabular-nums shrink-0"
                  style={{ color: "var(--fc-text-muted)" }}
                >
                  {u.views.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Refresh */}
      <div className="flex justify-end pt-2">
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
