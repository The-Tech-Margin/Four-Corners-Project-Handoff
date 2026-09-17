/**
 * WorldMap — equirectangular world map with country silhouettes plus
 * visitor-count bubbles positioned by country centroid.
 *
 * Renders TopoJSON land outlines from `world-atlas` (low-res 110m
 * resolution, ~55 KB) using d3-geo projection + path. Bubbles sit on top
 * sized by sqrt(count). Clicking a country raises its ISO code so the
 * parent can open a drill-down panel.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useMemo, useState } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import type { Topology } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import { getCentroid } from "./country-centroids";

export interface GeoPoint {
  country: string | null;
  city: string | null;
  region: string | null;
  count: number;
}

interface Props {
  data: GeoPoint[];
  height?: number;
  onSelectCountry?: (code: string) => void;
  selectedCountry?: string | null;
}

const WIDTH = 720;
const HEIGHT = 360;
const PAD = 12;

/**
 * Convert the bundled TopoJSON to a GeoJSON FeatureCollection once, at
 * module load. Cheap because land-110m.json is ~55 KB; doing it here keeps
 * the component body free of heavy work on every render.
 */
const LAND_FEATURES: FeatureCollection<Geometry, GeoJsonProperties> = feature(
  landTopo as unknown as Topology,
  (landTopo as unknown as Topology).objects.land,
) as FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * Equirectangular projection fitted to the SVG bounds. Centre on the
 * Greenwich meridian so the Pacific dateline wraps at the edges, matching
 * the axis labels.
 */
const PROJECTION = geoEquirectangular().fitExtent(
  [
    [PAD, PAD],
    [WIDTH - PAD, HEIGHT - PAD],
  ],
  LAND_FEATURES,
);

const PATH = geoPath(PROJECTION);

/** Re-use the same projection for centroid → pixel so bubbles align with the silhouette. */
function project(lat: number, lng: number): [number, number] {
  const result = PROJECTION([lng, lat]);
  return result ?? [0, 0];
}

export function WorldMap({
  data,
  height = 260,
  onSelectCountry,
  selectedCountry,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Aggregate by country and keep max for bubble-size scaling
  const { byCountry, max } = useMemo(() => {
    const agg = new Map<string, { count: number; cities: GeoPoint[] }>();
    for (const p of data) {
      if (!p.country) continue;
      const code = p.country.toUpperCase();
      const existing = agg.get(code) ?? { count: 0, cities: [] };
      existing.count += p.count;
      existing.cities.push(p);
      agg.set(code, existing);
    }
    let max = 0;
    for (const v of agg.values()) if (v.count > max) max = v.count;
    return { byCountry: agg, max: max || 1 };
  }, [data]);

  const bubbles = useMemo(() => {
    const items: {
      code: string;
      name: string;
      x: number;
      y: number;
      r: number;
      count: number;
    }[] = [];
    for (const [code, { count }] of byCountry) {
      const c = getCentroid(code);
      if (!c) continue;
      const [x, y] = project(c.lat, c.lng);
      const r = 3 + Math.sqrt(count / max) * 18;
      items.push({ code, name: c.name, x, y, r, count });
    }
    // Sort ascending so bigger bubbles render on top
    return items.sort((a, b) => a.r - b.r);
  }, [byCountry, max]);

  // Unknown countries (no centroid available) — aggregate separately
  const unknownCount = useMemo(() => {
    let sum = 0;
    for (const [code, { count }] of byCountry) {
      if (!getCentroid(code)) sum += count;
    }
    return sum;
  }, [byCountry]);

  // Each land feature gets its own <path> so React's reconciler can keep
  // them stable. feature() returns Feature or FeatureCollection depending on
  // the topology shape — land-110m is a single geometry, so .features exists.
  const landPaths = useMemo(() => {
    const features: Feature<Geometry, GeoJsonProperties>[] =
      LAND_FEATURES.features ?? [];
    return features
      .map((f, i) => ({ d: PATH(f), key: i }))
      .filter((p): p is { d: string; key: number } => typeof p.d === "string");
  }, []);

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        role="img"
        aria-label="World map of visitor locations"
      >
        {/* Background */}
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="var(--fc-bg)"
          rx={6}
        />

        {/* Latitude grid lines — subtle, help orient the projection */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = project(lat, 0);
          return (
            <line
              key={`lat-${lat}`}
              x1={PAD}
              x2={WIDTH - PAD}
              y1={y}
              y2={y}
              stroke="var(--fc-border-subtle)"
              strokeWidth={0.4}
              strokeDasharray={lat === 0 ? "" : "2 3"}
            />
          );
        })}
        {/* Longitude grid lines */}
        {[-120, -60, 0, 60, 120].map((lng) => {
          const [x] = project(0, lng);
          return (
            <line
              key={`lng-${lng}`}
              x1={x}
              x2={x}
              y1={PAD}
              y2={HEIGHT - PAD}
              stroke="var(--fc-border-subtle)"
              strokeWidth={0.4}
              strokeDasharray={lng === 0 ? "" : "2 3"}
            />
          );
        })}

        {/* Land silhouette — continents drawn from world-atlas TopoJSON. */}
        <g
          fill="var(--fc-surface-alt)"
          stroke="var(--fc-border)"
          strokeWidth={0.5}
          strokeLinejoin="round"
          fillOpacity={0.95}
        >
          {landPaths.map((p) => (
            <path key={p.key} d={p.d} />
          ))}
        </g>

        {/* Bounding rect on top of the silhouette so it frames cleanly. */}
        <rect
          x={PAD}
          y={PAD}
          width={WIDTH - PAD * 2}
          height={HEIGHT - PAD * 2}
          fill="none"
          stroke="var(--fc-border)"
          strokeWidth={1}
          rx={4}
        />

        {/* Bubbles */}
        {bubbles.map((b) => {
          const isActive =
            selectedCountry === b.code || hovered === b.code;
          return (
            <g
              key={b.code}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(b.code)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectCountry?.(b.code)}
            >
              <circle
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill="var(--fc-accent)"
                fillOpacity={isActive ? 0.9 : 0.55}
                stroke="var(--fc-accent)"
                strokeWidth={isActive ? 2 : 1}
              />
              <title>{`${b.name} — ${b.count.toLocaleString()}`}</title>
            </g>
          );
        })}
      </svg>

      {/* Hover label */}
      {hovered && (
        <div
          className="absolute top-1 right-1 px-2 py-0.5 rounded text-[10px] font-medium pointer-events-none"
          style={{
            background: "var(--fc-surface)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {bubbles.find((b) => b.code === hovered)?.name} ·{" "}
          {bubbles.find((b) => b.code === hovered)?.count.toLocaleString()}
        </div>
      )}

      {unknownCount > 0 && (
        <div
          className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px]"
          style={{
            background: "var(--fc-surface)",
            color: "var(--fc-text-muted)",
            border: "1px solid var(--fc-border-subtle)",
          }}
        >
          {unknownCount.toLocaleString()} from unmapped regions
        </div>
      )}
    </div>
  );
}
