/**
 * Core Web Vitals buffer — keeps the latest value per metric (LCP/CLS/INP/…)
 * in memory so the issue reporter can attach live vitals to a ticket's
 * diagnostics. The web-vitals-reporter writes here as metrics arrive; capture
 * reads a snapshot at submit time. O(1) writes, no listeners of its own.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface VitalSample {
  value: number;
  rating: string | null;
  /** ms since epoch when this metric was last recorded. */
  ts: number;
}

const latest: Record<string, VitalSample> = {};

/** Record (or overwrite) the latest sample for a metric, keyed by name. */
export function recordVital(metric: {
  name: string;
  value: number;
  rating?: string;
}): void {
  latest[metric.name] = {
    value: Math.round(metric.value * 1000) / 1000,
    rating: metric.rating ?? null,
    ts: Date.now(),
  };
}

/** Snapshot of the latest sample per metric (e.g. { LCP, CLS, INP, FCP, TTFB }). */
export function getVitals(): Record<string, VitalSample> {
  return { ...latest };
}
