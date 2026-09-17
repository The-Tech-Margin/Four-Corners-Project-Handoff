/**
 * Lightweight SVG charts for the admin dashboard.
 * Uses d3-scale (already installed) — no heavy chart libs.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useId } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { line as d3Line, curveMonotoneX, area as d3Area } from "d3-shape";

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  formatValue?: (n: number) => string;
}

/**
 * Horizontal bar chart — HTML stacked rows with label above, thin bar, value right.
 * Avoids SVG viewBox text-stretching issues at narrow widths.
 */
export function HorizontalBarChart({
  data,
  formatValue = (n) => n.toLocaleString(),
}: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        const fill = d.color ?? "var(--fc-accent)";
        return (
          <li key={d.label}>
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <span
                className="text-[11px] truncate"
                style={{ color: "var(--fc-text)" }}
              >
                {d.label}
              </span>
              <span
                className="text-[11px] tabular-nums shrink-0"
                style={{ color: "var(--fc-text-muted)" }}
              >
                {formatValue(d.value)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-sm overflow-hidden"
              style={{ background: "var(--fc-wash)" }}
            >
              <div
                className="h-full rounded-sm"
                style={{ width: `${pct}%`, background: fill }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface TimeSeriesPoint {
  t: Date | string | number;
  value: number;
}

interface TimeSeriesProps {
  data: TimeSeriesPoint[];
  height?: number;
  color?: string;
  fillColor?: string;
}

/**
 * Compact line + area chart for time-series data.
 */
export function TimeSeriesChart({
  data,
  height = 80,
  color = "var(--fc-accent)",
  fillColor,
}: TimeSeriesProps) {
  const id = useId();
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[11px]"
        style={{ height, color: "var(--fc-text-faint)" }}
      >
        Not enough data
      </div>
    );
  }
  const points = data.map((d) => ({
    t: typeof d.t === "object" ? d.t.getTime() : new Date(d.t).getTime(),
    value: d.value,
  }));
  const width = 600; // viewBox units
  const padX = 4;
  const padY = 6;

  const xScale = scaleTime()
    .domain([
      new Date(Math.min(...points.map((p) => p.t))),
      new Date(Math.max(...points.map((p) => p.t))),
    ])
    .range([padX, width - padX]);
  const yMax = Math.max(...points.map((p) => p.value)) || 1;
  const yScale = scaleLinear()
    .domain([0, yMax])
    .range([height - padY, padY]);

  const linePath = d3Line<{ t: number; value: number }>()
    .x((p) => xScale(new Date(p.t)))
    .y((p) => yScale(p.value))
    .curve(curveMonotoneX)(points);

  const areaPath = d3Area<{ t: number; value: number }>()
    .x((p) => xScale(new Date(p.t)))
    .y0(height - padY)
    .y1((p) => yScale(p.value))
    .curve(curveMonotoneX)(points);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor ?? color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={fillColor ?? color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#grad-${id})`} />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

interface StackedBarProps {
  segments: { label: string; value: number; color: string }[];
  height?: number;
}

/**
 * Single horizontal stacked bar — useful for proportional breakdowns.
 */
export function StackedBar({ segments, height = 8 }: StackedBarProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  return (
    <div
      className="w-full overflow-hidden flex"
      style={{
        height,
        background: "var(--fc-wash)",
        borderRadius: "var(--radius)",
      }}
      role="img"
    >
      {segments.map((seg) => {
        const widthPct = (seg.value / total) * 100;
        return (
          <div
            key={seg.label}
            style={{
              width: `${widthPct}%`,
              background: seg.color,
            }}
            title={`${seg.label}: ${seg.value.toLocaleString()}`}
          />
        );
      })}
    </div>
  );
}
