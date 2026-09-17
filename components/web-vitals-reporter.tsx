"use client";

import { useReportWebVitals } from "next/web-vitals";
import { recordVital } from "@/lib/web-vitals-buffer";

/**
 * Reports Core Web Vitals (CLS, FCP, FID, INP, LCP, TTFB) to our
 * /api/vitals endpoint for storage in the speed_insights table.
 * Runs alongside Vercel's SpeedInsights component.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // Keep the latest value in the in-memory buffer so the issue reporter can
    // attach live vitals to a ticket's diagnostics (additive; no extra work).
    recordVital(metric);

    // Fire-and-forget POST — don't block rendering
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      pathname: window.location.pathname,
      href: window.location.href,
      timestamp: Date.now(),
      connectionSpeed:
        (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType || null,
    });

    // Use sendBeacon for reliability on page unload, fall back to fetch
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", body);
    } else {
      fetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  });

  return null;
}
