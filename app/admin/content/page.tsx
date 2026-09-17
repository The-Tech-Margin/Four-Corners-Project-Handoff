/**
 * Admin Content — tag distribution, camera equipment, and a
 * visibility/storage rollup of projects.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeading, StatTile } from "@/components/admin/stat-card";
import { HorizontalBarChart, type BarDatum } from "@/components/admin/charts";

interface ContentStats {
  tags: { tag: string; count: number }[];
  equipment: { make: string; model: string; count: number }[];
}

interface PlatformStats {
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
}

export default function AdminContent() {
  const [content, setContent] = useState<ContentStats | null>(null);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const [contentRes, statsRes] = await Promise.all([
        fetch("/api/admin/content").then((r) =>
          r.ok ? (r.json() as Promise<ContentStats>) : null,
        ),
        fetch("/api/admin/stats").then((r) =>
          r.ok ? (r.json() as Promise<PlatformStats>) : null,
        ),
      ]);
      setContent(contentRes);
      setPlatform(statsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading && !content) {
    return (
      <div
        className="flex items-center justify-center py-16 text-xs"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Loading content stats...
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="text-center py-16">
        <p className="text-xs" style={{ color: "var(--fc-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!content) return null;

  const tagBars: BarDatum[] = content.tags
    .slice(0, 10)
    .map((t) => ({ label: t.tag, value: t.count }));

  const equipmentBars: BarDatum[] = content.equipment.map((e) => ({
    label: `${e.make || "?"} ${e.model || ""}`.trim(),
    value: e.count,
    color: "var(--fc-corner-links)",
  }));

  const publishedPct =
    platform && platform.projects.total > 0
      ? Math.round(
          (platform.projects.published / platform.projects.total) * 100,
        )
      : 0;

  return (
    <div className="space-y-4">
      {/* Visibility & Storage rollup (replaces Creator Locations) */}
      {platform && (
        <section>
          <SectionHeading>Visibility &amp; Storage</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <StatTile
              label="Total"
              value={platform.projects.total}
              accent="var(--fc-accent)"
            />
            <StatTile
              label="Published"
              value={`${platform.projects.published} (${publishedPct}%)`}
              accent="#10b981"
            />
            <StatTile
              label="In Gallery"
              value={platform.projects.gallery}
            />
            <StatTile
              label="Private"
              value={platform.projects.private}
            />
            <StatTile
              label="Context items"
              value={platform.content.contextItems}
            />
            <StatTile
              label="With context"
              value={platform.content.projectsWithContext}
            />
            <StatTile
              label="Voice notes"
              value={platform.content.transcriptions}
            />
            <StatTile label="New 7d" value={platform.projects.newLast7Days} />
          </div>
        </section>
      )}

      {/* Tag Distribution */}
      <section>
        <SectionHeading>Top Tags</SectionHeading>
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {tagBars.length === 0 ? (
            <p
              className="text-xs py-4 text-center"
              style={{ color: "var(--fc-text-muted)" }}
            >
              No tags yet.
            </p>
          ) : (
            <HorizontalBarChart data={tagBars} />
          )}
        </div>
      </section>

      {/* Equipment */}
      <section>
        <SectionHeading>Camera Equipment</SectionHeading>
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--fc-surface)",
            border: "1px solid var(--fc-border)",
          }}
        >
          {equipmentBars.length === 0 ? (
            <p
              className="text-xs py-4 text-center"
              style={{ color: "var(--fc-text-muted)" }}
            >
              No equipment data yet.
            </p>
          ) : (
            <HorizontalBarChart data={equipmentBars} />
          )}
        </div>
      </section>

      {/* Refresh */}
      <div className="flex justify-end">
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
