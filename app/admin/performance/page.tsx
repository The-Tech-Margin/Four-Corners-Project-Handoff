/**
 * Admin Performance — Web Vitals dashboard (LCP, CLS, INP, FCP, TTFB).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { StatCard, SectionHeading } from "@/components/admin/stat-card";

interface VitalSummary {
  metric: string;
  p50: number;
  p75: number;
  p95: number;
  count: number;
}

interface RouteVitals {
  path: string;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface DeviceVitals {
  device: string;
  lcp_p75: number | null;
  count: number;
}

interface BrowserEngineVitals {
  engine: string | null;
  engine_version: string | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface OsVitals {
  os_name: string | null;
  os_version: string | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface DeviceBrandVitals {
  device_brand: string | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface ClientVitals {
  client_name: string | null;
  client_type: string | null;
  client_version: string | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface ConnectionVitals {
  connection_speed: string | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

interface PerfStats {
  summary: VitalSummary[];
  byRoute: RouteVitals[];
  byDevice: DeviceVitals[];
  byBrowserEngine?: BrowserEngineVitals[];
  byOs?: OsVitals[];
  byDeviceBrand?: DeviceBrandVitals[];
  byClient?: ClientVitals[];
  byConnection?: ConnectionVitals[];
  total: number;
  since: string;
}

interface BreakdownRow {
  key: string;
  label: string;
  lcp_p75: number | null;
  cls_p75: number | null;
  inp_p75: number | null;
  count: number;
}

const CWV_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

function getVitalColor(metric: string, value: number): string {
  const t = CWV_THRESHOLDS[metric];
  if (!t) return "var(--fc-text)";
  if (value <= t.good) return "#10b981";
  if (value <= t.poor) return "#f59e0b";
  return "var(--fc-danger)";
}

function formatVital(metric: string, value: number | null): string {
  if (value == null) return "—";
  if (metric === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

const TIME_RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
];

const METRIC_ORDER = ["LCP", "CLS", "INP", "FCP", "TTFB", "FID"];

/** Renders a labelled list of dimension rows with p75 LCP/CLS/INP + sample count. */
function VitalsBreakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeading>{title}</SectionHeading>
      <div className="space-y-2 mb-8">
        {rows.map((r) => (
          <div
            key={r.key}
            className="rounded-lg px-4 py-3"
            style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}
          >
            <p className="text-xs font-medium mb-2 truncate" style={{ color: "var(--fc-text)" }}>
              {r.label}
            </p>
            <div className="flex gap-4 flex-wrap">
              <span className="text-xs">
                <span style={{ color: "var(--fc-text-muted)" }}>LCP </span>
                <span className="font-medium tabular-nums" style={{ color: r.lcp_p75 != null ? getVitalColor("LCP", r.lcp_p75) : "var(--fc-text-muted)" }}>
                  {formatVital("LCP", r.lcp_p75)}
                </span>
              </span>
              <span className="text-xs">
                <span style={{ color: "var(--fc-text-muted)" }}>CLS </span>
                <span className="font-medium tabular-nums" style={{ color: r.cls_p75 != null ? getVitalColor("CLS", r.cls_p75) : "var(--fc-text-muted)" }}>
                  {formatVital("CLS", r.cls_p75)}
                </span>
              </span>
              <span className="text-xs">
                <span style={{ color: "var(--fc-text-muted)" }}>INP </span>
                <span className="font-medium tabular-nums" style={{ color: r.inp_p75 != null ? getVitalColor("INP", r.inp_p75) : "var(--fc-text-muted)" }}>
                  {formatVital("INP", r.inp_p75)}
                </span>
              </span>
              <span className="text-xs tabular-nums" style={{ color: "var(--fc-text-muted)" }}>
                {r.count} samples
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function joinLabel(...parts: (string | null | undefined)[]): string {
  const label = parts.filter(Boolean).join(" ").trim();
  return label || "Unknown";
}

export default function AdminPerformance() {
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/performance?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to load performance stats");
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--fc-text-muted)" }}>
        Loading performance data...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="text-center py-20">
        <p style={{ color: "var(--fc-danger)" }}>{error}</p>
        <button onClick={fetchStats} className="mt-4 px-4 py-2 rounded text-sm font-medium" style={{ background: "var(--fc-accent)", color: "var(--fc-accent-on)" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const sortedSummary = [...stats.summary].sort(
    (a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric),
  );

  return (
    <div>
      {/* Time range selector */}
      <div
        className="inline-flex mb-3 rounded"
        style={{
          background: "var(--fc-wash)",
          border: "1px solid var(--fc-border)",
          padding: 1,
          gap: 1,
        }}
      >
        {TIME_RANGES.map((r) => {
          const isActive = hours === r.hours;
          return (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className="rounded text-[10px] font-medium transition-colors"
              style={{
                padding: "2px 6px",
                background: isActive ? "var(--fc-accent)" : "transparent",
                color: isActive ? "var(--fc-accent-on)" : "var(--fc-text-muted)",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {stats.total === 0 ? (
        <div className="text-center py-16">
          <p style={{ color: "var(--fc-text-muted)" }}>No performance data recorded in this time range.</p>
        </div>
      ) : (
        <>
          {/* Core Web Vitals Summary */}
          <SectionHeading>Core Web Vitals (p75)</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {sortedSummary.map((v) => (
              <StatCard
                key={v.metric}
                label={v.metric}
                value={formatVital(v.metric, v.p75)}
                sub={`p50: ${formatVital(v.metric, v.p50)} | ${v.count} samples`}
                accent={getVitalColor(v.metric, v.p75)}
              />
            ))}
          </div>

          {/* By Route — card layout for mobile */}
          {stats.byRoute.length > 0 && (
            <>
              <SectionHeading>By Route</SectionHeading>
              <div className="space-y-2 mb-8">
                {stats.byRoute.map((r) => (
                  <div
                    key={r.path}
                    className="rounded-lg px-4 py-3"
                    style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}
                  >
                    <p className="text-xs font-mono mb-2 truncate" style={{ color: "var(--fc-text-muted)" }}>
                      {r.path}
                    </p>
                    <div className="flex gap-4 flex-wrap">
                      <span className="text-xs">
                        <span style={{ color: "var(--fc-text-muted)" }}>LCP </span>
                        <span className="font-medium tabular-nums" style={{ color: r.lcp_p75 != null ? getVitalColor("LCP", r.lcp_p75) : "var(--fc-text-muted)" }}>
                          {formatVital("LCP", r.lcp_p75)}
                        </span>
                      </span>
                      <span className="text-xs">
                        <span style={{ color: "var(--fc-text-muted)" }}>CLS </span>
                        <span className="font-medium tabular-nums" style={{ color: r.cls_p75 != null ? getVitalColor("CLS", r.cls_p75) : "var(--fc-text-muted)" }}>
                          {formatVital("CLS", r.cls_p75)}
                        </span>
                      </span>
                      <span className="text-xs">
                        <span style={{ color: "var(--fc-text-muted)" }}>INP </span>
                        <span className="font-medium tabular-nums" style={{ color: r.inp_p75 != null ? getVitalColor("INP", r.inp_p75) : "var(--fc-text-muted)" }}>
                          {formatVital("INP", r.inp_p75)}
                        </span>
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--fc-text-muted)" }}>
                        {r.count} samples
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* By Device */}
          {stats.byDevice.length > 0 && (
            <>
              <SectionHeading>By Device</SectionHeading>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
                {stats.byDevice.map((d) => (
                  <StatCard
                    key={d.device}
                    label={d.device.charAt(0).toUpperCase() + d.device.slice(1)}
                    value={formatVital("LCP", d.lcp_p75)}
                    sub={`${d.count} samples`}
                    accent={d.lcp_p75 != null ? getVitalColor("LCP", d.lcp_p75) : undefined}
                  />
                ))}
              </div>
            </>
          )}

          {/* Drain-sourced breakdowns (populated by the Vercel Speed Insights drain) */}
          <VitalsBreakdown
            title="By Operating System"
            rows={(stats.byOs ?? []).map((o, i) => ({
              key: `${o.os_name}-${o.os_version}-${i}`,
              label: joinLabel(o.os_name, o.os_version),
              lcp_p75: o.lcp_p75,
              cls_p75: o.cls_p75,
              inp_p75: o.inp_p75,
              count: o.count,
            }))}
          />

          <VitalsBreakdown
            title="By Browser"
            rows={(stats.byClient ?? []).map((c, i) => ({
              key: `${c.client_name}-${c.client_version}-${i}`,
              label: joinLabel(c.client_name, c.client_version),
              lcp_p75: c.lcp_p75,
              cls_p75: c.cls_p75,
              inp_p75: c.inp_p75,
              count: c.count,
            }))}
          />

          <VitalsBreakdown
            title="By Browser Engine"
            rows={(stats.byBrowserEngine ?? []).map((e, i) => ({
              key: `${e.engine}-${e.engine_version}-${i}`,
              label: joinLabel(e.engine, e.engine_version),
              lcp_p75: e.lcp_p75,
              cls_p75: e.cls_p75,
              inp_p75: e.inp_p75,
              count: e.count,
            }))}
          />

          <VitalsBreakdown
            title="By Device Brand"
            rows={(stats.byDeviceBrand ?? []).map((d, i) => ({
              key: `${d.device_brand}-${i}`,
              label: joinLabel(d.device_brand),
              lcp_p75: d.lcp_p75,
              cls_p75: d.cls_p75,
              inp_p75: d.inp_p75,
              count: d.count,
            }))}
          />

          <VitalsBreakdown
            title="By Connection Speed"
            rows={(stats.byConnection ?? []).map((c, i) => ({
              key: `${c.connection_speed}-${i}`,
              label: joinLabel(c.connection_speed),
              lcp_p75: c.lcp_p75,
              cls_p75: c.cls_p75,
              inp_p75: c.inp_p75,
              count: c.count,
            }))}
          />
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--fc-text-muted)" }}>
          {stats.total} samples since {new Date(stats.since).toLocaleString()}
        </p>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="px-4 py-2 rounded text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: "var(--fc-wash)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
            borderRadius: "var(--radius)",
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
